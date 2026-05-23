"""회사·기관별 문서 양식 프로파일.

DocuAX B2B 영업의 핵심: 한 번 등록해두면 그 기관의 모든 문서가
표준 양식대로 자동 출력된다.

저장 항목:
- 시각 정체성: 브랜드 컬러·악센트·로고
- 헤더/푸터 텍스트 (기관명·도장 위치·페이지 번호 등)
- 서체: 본문/제목 한글 폰트, 본문 폰트 크기
- 페이지 설정: 용지·여백 (mm)
- 기본 매핑: prompt_label (프롬프트 라이브러리와 연결), default_template_id

파이프라인은 변환 시 organization_id 가 있으면 이 프로파일을 읽어
DOCX/HWPX/PDF 출력에 그대로 반영.

저장 구조 — data/org_profiles/index.json
(template_library / prompt_library 와 같은 패턴)
"""
from __future__ import annotations

import json
import re
import threading
import time
import uuid
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field, field_validator

from app.core.config import get_settings
from app.core.logging import get_logger

log = get_logger(__name__)


_HEX_RE = re.compile(r"^#?[0-9a-fA-F]{6}$")


def _normalize_hex(v: str | None, default: str) -> str:
    if not v:
        return default
    s = v.strip()
    if not s.startswith("#"):
        s = "#" + s
    if not _HEX_RE.match(s):
        return default
    return s.upper()


class OrganizationProfile(BaseModel):
    """변환 출력에 즉시 반영되는 회사 양식 프로파일."""

    id: str
    slug: str  # URL/필터용 짧은 영문 식별자 (예: kyeongin-data)
    name: str  # 표기명 (예: 경인지방데이터청)

    # ── 시각 정체성 ──
    brand_color_hex: str = "#1E2761"  # heading·주요 강조 (예: 네이비)
    accent_color_hex: str = "#1F5BAF"  # H3 이하·링크
    table_header_bg_hex: str = "#F2F2F2"

    # ── 서체 (한글 폰트 기본은 한컴이 지원하는 폰트) ──
    font_korean: str = "함초롬바탕"  # 한컴/MS 공통으로 인식 가능
    font_korean_heading: str = "함초롬돋움"
    body_font_size_pt: float = 10.0
    h1_font_size_pt: float = 20.0
    h2_font_size_pt: float = 16.0
    h3_font_size_pt: float = 14.0

    # ── 페이지 ──
    page_size: str = "A4"  # A4 | Letter | A3
    margin_top_mm: float = 25.0
    margin_bottom_mm: float = 25.0
    margin_left_mm: float = 25.0
    margin_right_mm: float = 25.0

    # ── 헤더/푸터 ──
    header_text: str = ""  # 매 페이지 상단 (기관명 등)
    footer_text: str = ""  # 매 페이지 하단 (페이지번호·문서번호)
    logo_data_url: str = ""  # base64 data URL 또는 빈 값

    # ── 연결 ──
    prompt_label: str = ""  # 프롬프트 라이브러리의 organization_label 과 매칭
    default_template_id: str | None = None  # UploadedTemplate.id
    # 변환 시 이 프로파일을 가진 사용자의 조직 ID (DB Organization 와 매핑 — 선택)
    db_organization_id: str | None = None

    # ── 운영 ──
    is_public: bool = False  # True면 비로그인 사용자도 변환 시 선택 가능 (DocuAX가 큐레이션한 공식 양식)
    notes: str = ""  # 관리자 메모
    created_by: str = ""  # admin email
    created_at: float = 0.0
    updated_at: float = 0.0

    @field_validator("brand_color_hex", "accent_color_hex", "table_header_bg_hex")
    @classmethod
    def _ok_hex(cls, v: str) -> str:
        return _normalize_hex(v, "#000000")


def _root() -> Path:
    return get_settings().storage_local_dir.parent / "org_profiles"


def _index_path() -> Path:
    return _root() / "index.json"


_lock = threading.Lock()


def _slugify(name: str) -> str:
    """이름을 안전한 슬러그로 변환. 한글은 그대로 두되 공백 제거·소문자화."""
    s = name.strip().lower()
    s = re.sub(r"\s+", "-", s)
    s = re.sub(r"[^\w가-힣\-]", "", s, flags=re.UNICODE)
    return s or "org-" + uuid.uuid4().hex[:6]


def _load_index() -> dict[str, dict[str, Any]]:
    p = _index_path()
    if not p.exists():
        return {}
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def _save_index(idx: dict[str, dict[str, Any]]) -> None:
    p = _index_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(idx, ensure_ascii=False, indent=2), encoding="utf-8")


def create_profile(*, name: str, slug: str | None = None, created_by: str = "", **fields: Any) -> OrganizationProfile:
    pid = uuid.uuid4().hex[:12]
    now = time.time()
    final_slug = (slug or _slugify(name)).strip()
    # 중복 슬러그면 -2, -3 …
    with _lock:
        idx = _load_index()
        existing_slugs = {m.get("slug") for m in idx.values()}
        base = final_slug
        n = 2
        while final_slug in existing_slugs:
            final_slug = f"{base}-{n}"
            n += 1
        profile = OrganizationProfile(
            id=pid,
            slug=final_slug,
            name=name.strip(),
            created_by=created_by,
            created_at=now,
            updated_at=now,
            **fields,
        )
        idx[pid] = profile.model_dump()
        _save_index(idx)
    log.info("조직 프로파일 생성", id=pid, slug=final_slug, name=name)
    return profile


def list_profiles(*, include_private: bool = True) -> list[OrganizationProfile]:
    idx = _load_index()
    items = [OrganizationProfile(**m) for m in idx.values()]
    if not include_private:
        items = [it for it in items if it.is_public]
    return sorted(items, key=lambda x: x.name)


def get_profile(pid: str) -> OrganizationProfile | None:
    idx = _load_index()
    m = idx.get(pid)
    return OrganizationProfile(**m) if m else None


def get_profile_by_slug(slug: str) -> OrganizationProfile | None:
    idx = _load_index()
    for m in idx.values():
        if m.get("slug") == slug:
            return OrganizationProfile(**m)
    return None


def update_profile(pid: str, **patch: Any) -> OrganizationProfile | None:
    """일부 필드 수정. id/slug/created_* 는 변경 불가."""
    immutable = {"id", "slug", "created_by", "created_at"}
    with _lock:
        idx = _load_index()
        if pid not in idx:
            return None
        m = idx[pid]
        for k, v in patch.items():
            if k in immutable or v is None:
                continue
            if k in {"brand_color_hex", "accent_color_hex", "table_header_bg_hex"} and isinstance(v, str):
                v = _normalize_hex(v, m.get(k, "#000000"))
            m[k] = v
        m["updated_at"] = time.time()
        idx[pid] = m
        _save_index(idx)
        return OrganizationProfile(**m)


def delete_profile(pid: str) -> bool:
    with _lock:
        idx = _load_index()
        if pid not in idx:
            return False
        del idx[pid]
        _save_index(idx)
    log.info("조직 프로파일 삭제", id=pid)
    return True


# ─────────────────────────────────────────────────────────────────────────────
# 변환·렌더링 통합 — DocumentIR 보조 attribute로 캐싱
# ─────────────────────────────────────────────────────────────────────────────

# 메모리 캐시 (organization_id → profile). DocumentIR 에 직접 붙이는 대신
# 약식 캐시로 처리 — 운영에서는 DB로 옮긴다.
_active_profile_for_doc: dict[str, OrganizationProfile] = {}


def remember_for_document(document_id: str, profile: OrganizationProfile | None) -> None:
    if profile is None:
        _active_profile_for_doc.pop(document_id, None)
    else:
        _active_profile_for_doc[document_id] = profile


def profile_for_document(document_id: str) -> OrganizationProfile | None:
    return _active_profile_for_doc.get(document_id)


def resolve_profile(*, organization_id: str | None = None, slug: str | None = None) -> OrganizationProfile | None:
    """변환 시 조직 식별자(id 또는 slug) → 프로파일.

    organization_id 는 (1) 직접 ID, (2) slug 매핑 둘 다 시도.
    """
    if not organization_id and not slug:
        return None
    if organization_id:
        p = get_profile(organization_id)
        if p:
            return p
        # slug 로도 시도
        p = get_profile_by_slug(organization_id)
        if p:
            return p
    if slug:
        return get_profile_by_slug(slug)
    return None
