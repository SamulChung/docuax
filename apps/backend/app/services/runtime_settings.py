"""Runtime 설정 오버레이.

`.env`는 부팅 시 기본값만 제공. 사용자가 UI에서 변경하면 이 파일에 저장되어
`.env`보다 우선 적용된다. 재시작 없이 즉시 반영 (provider 캐시 무효화).

저장 위치: data/runtime_settings.json (gitignored)
저장 형식: 평문 JSON (운영에서는 OS keychain 또는 KMS 사용 권장)

보안:
- 파일은 백엔드 프로세스만 접근
- 토큰은 GET API에서 마스킹되어 반환 (`hf_QJ••••••••CQoV` 형태)
- 평문은 절대 프론트엔드로 전송 X
"""
from __future__ import annotations

import json
import os
import threading
from pathlib import Path
from typing import Any

from app.core.config import Settings, get_settings
from app.core.logging import get_logger

log = get_logger(__name__)


# 이 필드만 runtime overlay 대상 (다른 .env 항목은 수정 불가)
ALLOWED_FIELDS = {
    "llm_provider",
    "llm_chain",
    "tenos_base_url",
    "tenos_model",
    "tenos_api_key",
    "tenos_timeout_s",
    "hf_api_token",
    "openai_api_key",
    "openai_model",
    "openai_base_url",
    "anthropic_api_key",
    "anthropic_model",
    # OCR
    "ocr_provider",
    "ocr_tesseract_cmd",
    "ocr_default_lang",
    "clova_ocr_url",
    "clova_ocr_secret",
}

# 토큰·키 필드 — GET 응답에서 마스킹
SECRET_FIELDS = {
    "tenos_api_key",
    "hf_api_token",
    "openai_api_key",
    "anthropic_api_key",
    "clova_ocr_secret",
}


def _settings_path() -> Path:
    s = get_settings()
    return s.storage_local_dir.parent / "runtime_settings.json"


_lock = threading.Lock()


def load_overlay() -> dict[str, Any]:
    p = _settings_path()
    if not p.exists():
        return {}
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as e:
        log.warning("runtime_settings.json 읽기 실패", error=str(e))
        return {}


def save_overlay(updates: dict[str, Any]) -> dict[str, Any]:
    """현재 overlay에 updates를 병합 저장. 빈 문자열은 해당 필드 삭제."""
    with _lock:
        cur = load_overlay()
        for k, v in updates.items():
            if k not in ALLOWED_FIELDS:
                continue
            if v == "" or v is None:
                cur.pop(k, None)
            else:
                cur[k] = v
        p = _settings_path()
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(cur, ensure_ascii=False, indent=2), encoding="utf-8")
        # 파일 권한 — POSIX에서 0600
        try:
            os.chmod(p, 0o600)
        except OSError:
            pass
        return cur


# 시작 시 .env가 제공한 값을 보존 — overlay 해제 시 복귀용
_baseline_env: dict[str, str | None] | None = None


def _capture_baseline() -> dict[str, str | None]:
    """ALLOWED_FIELDS에 해당하는 환경변수 초기값을 한 번 캡쳐."""
    global _baseline_env
    if _baseline_env is not None:
        return _baseline_env
    _baseline_env = {field.upper(): os.environ.get(field.upper()) for field in ALLOWED_FIELDS}
    return _baseline_env


def apply_overlay_to_env() -> None:
    """현재 overlay를 환경변수에 주입. overlay에 없는 필드는 baseline 복귀.

    pydantic-settings가 .env보다 환경변수를 우선시키므로, overlay 변경이 즉시 적용된다.
    """
    baseline = _capture_baseline()
    overlay = load_overlay()
    for field in ALLOWED_FIELDS:
        ek = field.upper()
        if field in overlay and overlay[field] not in ("", None):
            os.environ[ek] = str(overlay[field])
        else:
            # baseline (= .env가 줬던 값) 으로 복귀
            base_val = baseline.get(ek)
            if base_val is None:
                os.environ.pop(ek, None)
            else:
                os.environ[ek] = base_val


def mask_secret(value: str) -> str:
    if not value or len(value) < 8:
        return "••••" if value else ""
    return f"{value[:4]}••••••••{value[-4:]}"


def public_view(settings_obj: Settings | None = None) -> dict[str, Any]:
    """프론트엔드용 — 시크릿은 마스킹, 그 외는 그대로."""
    s = settings_obj or get_settings()
    overlay = load_overlay()
    out: dict[str, Any] = {}
    for field in ALLOWED_FIELDS:
        # overlay > .env > default
        if field in overlay:
            val = overlay[field]
            source = "overlay"
        else:
            val = getattr(s, field, "")
            source = "env"
        if field in SECRET_FIELDS:
            out[field] = {
                "value": mask_secret(str(val or "")),
                "is_set": bool(val),
                "source": source,
            }
        else:
            out[field] = {"value": val, "is_set": val not in ("", None), "source": source}
    return out


def reset_overlay() -> None:
    p = _settings_path()
    if p.exists():
        p.unlink()
