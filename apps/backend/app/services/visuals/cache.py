"""시각 요소 캐시 — 변환된 PNG 를 디스크에 보관.

캐시 키: 입력 콘텐츠(SHA-256) + 엔진명. 같은 입력은 한 번만 렌더.
캐시 위치: <APP_TMP_DIR>/visuals/<hash>.png  (없으면 var/visuals)
"""
from __future__ import annotations

import base64
import hashlib
import os
import re
from pathlib import Path

from app.core.logging import get_logger

log = get_logger(__name__)


def cache_dir() -> Path:
    """시각 요소 캐시 디렉토리. 환경변수 우선."""
    p = Path(os.environ.get("DOCUAX_VISUAL_CACHE_DIR") or "var/visuals")
    p.mkdir(parents=True, exist_ok=True)
    return p


def _hash_key(*parts: str) -> str:
    h = hashlib.sha256()
    for p in parts:
        h.update(p.encode("utf-8"))
    return h.hexdigest()[:32]


def cache_path_for(key: str, suffix: str = ".png") -> Path:
    """주어진 키에 대응하는 캐시 파일 경로 — 존재 여부 무관."""
    return cache_dir() / f"{key}{suffix}"


_B64_DATA_URL_RE = re.compile(r"^data:(?P<mime>[^;]+);base64,(?P<data>.+)$", re.DOTALL)


def materialize_image(
    *,
    src: str = "",
    url: str = "",
    local_path: str = "",
    data_b64: str = "",
    mime: str = "image/png",
) -> Path | None:
    """이미지 데이터를 디스크에 materialize 해서 경로 반환.

    우선순위: data_b64 > local_path > url > src(자동 판별).
    실패 시 None.
    """
    # 1) base64 인라인
    if data_b64:
        return _materialize_b64(data_b64, mime)

    # 2) 로컬 파일
    if local_path:
        p = Path(local_path)
        if p.exists() and p.is_file():
            return p
        log.warning("이미지 local_path 존재 안 함", path=local_path)

    # 3) HTTP(S) URL
    target_url = url or (src if src.startswith(("http://", "https://")) else "")
    if target_url:
        return _download_url(target_url)

    # 4) src 자동 판별 — data URL?
    if src.startswith("data:"):
        return _materialize_b64(src, mime)
    # 또는 로컬 상대 경로
    if src and not src.startswith(("http://", "https://")):
        p = Path(src)
        if p.exists() and p.is_file():
            return p

    return None


def _materialize_b64(data: str, default_mime: str) -> Path | None:
    """base64 → 파일. data URL prefix(`data:image/png;base64,`)도 처리."""
    try:
        mime = default_mime
        payload = data
        m = _B64_DATA_URL_RE.match(data)
        if m:
            mime = m.group("mime")
            payload = m.group("data")
        # whitespace 제거
        payload = "".join(payload.split())
        raw = base64.b64decode(payload, validate=False)
        suffix = "." + (mime.split("/")[-1] if "/" in mime else "png").lower()
        # png/jpg/jpeg/svg 외는 .png 로 통일 (대부분 렌더러가 png 가장 안전)
        if suffix not in (".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"):
            suffix = ".png"
        key = _hash_key("b64", payload[:1024])
        out = cache_path_for(key, suffix)
        if not out.exists():
            out.write_bytes(raw)
        return out
    except Exception as e:  # noqa: BLE001
        log.warning("base64 이미지 디코드 실패", error=str(e))
        return None


def _download_url(url: str, timeout: float = 8.0) -> Path | None:
    """HTTP(S) 이미지 다운로드 — 캐시.

    같은 URL은 한 번만 받는다. SVG는 png 변환을 시도하지 않음 (렌더러 위임).
    """
    key = _hash_key("url", url)
    # 확장자 추정
    suffix = ".png"
    lower = url.lower().split("?")[0]
    for ext in (".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"):
        if lower.endswith(ext):
            suffix = ext
            break
    out = cache_path_for(key, suffix)
    if out.exists():
        return out
    try:
        import httpx
        with httpx.Client(timeout=timeout, follow_redirects=True) as client:
            r = client.get(url)
            r.raise_for_status()
            out.write_bytes(r.content)
            return out
    except Exception as e:  # noqa: BLE001
        log.warning("이미지 다운로드 실패", url=url, error=str(e))
        return None


def resolve_image_to_path(image_data) -> Path | None:
    """ImageData 객체 → 실제 디스크 경로. 편의 wrapper."""
    return materialize_image(
        src=getattr(image_data, "src", ""),
        url=getattr(image_data, "url", ""),
        local_path=getattr(image_data, "local_path", ""),
        data_b64=getattr(image_data, "data_b64", ""),
        mime=getattr(image_data, "mime", "image/png"),
    )
