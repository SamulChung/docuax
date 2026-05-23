"""프롬프트 라이브러리 저장소.

DocuAX 강의/컬설팅에서 회사별로 만드는 프롬프트 치트시트를
관리한다. (대표 예: 문구조합 의료 AI 영업, 경인지방데이터청, 대외협력 등)

저장 구조:
  data/prompts/index.json   # 메타 인덱스

template_library 와 동일한 패턴을 따르되, 프롬프트는 원본 파일이
아닌 속성 조각(JSON)으로 저장하므로 폴더를 별도로 만들지 않는다.
"""
from __future__ import annotations

import json
import threading
import time
import uuid
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.core.logging import get_logger

log = get_logger(__name__)


class Prompt(BaseModel):
    id: str
    title: str
    description: str = ""
    content: str  # 실제 프롬프트 본문 (복사대상)
    category: str = ""  # 섹션/단계명 (예: "문제 정의", "고객 미팅 준비")
    tags: list[str] = Field(default_factory=list)
    organization_label: str = ""  # 회사·기관명 (추적용 라벨 — 자유 텍스트)
    organization_id: str | None = None  # 로그인 조직 계정 ID (선택)
    owner_id: str = ""
    source_filename: str | None = None  # 대량 임포트한 경우 원본 HTML 파일명
    shared_with_org: bool = False
    created_at: float = 0.0
    updated_at: float = 0.0

    # ─── 구조화 필드 (역관목조분 + 요정분생설) ────────────────────────────────
    # 역관목조분 5축 — 프롬프트를 구성하는 다섯 가지 답안 설계 축.
    # 자유 입력 텍스트 (한 줄~한 문단). 비어 있으면 content 에 반영 안 됨.
    role: str = ""          # 역할 — 누가 답하는가 (e.g. "의료 AI 영업 전문가")
    field: str = ""         # 관련분야 — 어떤 영역의 지식 (e.g. "산부인과 SaaS")
    purpose: str = ""       # 목적 — 왜 답하는가 (e.g. "병원장 미팅 자료 준비")
    conditions: str = ""    # 조건 — 제약 사항 (e.g. "근거 인용 · 추측 금지")
    length: str = ""        # 분량 — 길이/형식 지정 (e.g. "A4 한 쪽 · 4단락")

    # 요정분생설 — 프롬프트가 LLM 에게 시키는 일의 종류 (5종 중 하나).
    # ""(미지정), "summary", "organization", "analysis", "generation", "explanation"
    task_type: str = ""


def _root() -> Path:
    return get_settings().storage_local_dir.parent / "prompts"


def _index_path() -> Path:
    return _root() / "index.json"


_lock = threading.Lock()


# 요정분생설 5종 — 프롬프트 task_type 의 허용 값
TASK_TYPES = ("summary", "organization", "analysis", "generation", "explanation")
TASK_TYPE_KO = {
    "summary": "요약",
    "organization": "정리",
    "analysis": "분석",
    "generation": "생성",
    "explanation": "설명",
}


def _normalize_task_type(value: str) -> str:
    """task_type 입력을 표준 영문 키로 정규화. 빈 문자열/미지원 값이면 ""."""
    v = (value or "").strip().lower()
    if v in TASK_TYPES:
        return v
    # 한글 라벨도 받아 정규화
    for k, ko in TASK_TYPE_KO.items():
        if v == ko:
            return k
    return ""


def compose_content_from_axes(
    *,
    role: str,
    field: str,
    purpose: str,
    conditions: str,
    length: str,
    task_type: str,
    body: str = "",
) -> str:
    """역관목조분 + 요정분생설 입력을 LLM 이 잘 따르는 프롬프트 본문으로 조립.

    body 는 마법사의 '추가 지시' 자유 입력 — 비어 있으면 골격만 생성.
    구조화된 5축 중 비어 있는 축은 출력에서 자동 생략 (잡음 방지).
    """
    parts: list[str] = []
    tt = _normalize_task_type(task_type)
    if tt:
        parts.append(f"[유형] {TASK_TYPE_KO[tt]}")
    axes = [
        ("역할", role),
        ("관련분야", field),
        ("목적", purpose),
        ("조건", conditions),
        ("분량", length),
    ]
    for label, val in axes:
        v = (val or "").strip()
        if v:
            parts.append(f"[{label}] {v}")
    header = "\n".join(parts)
    body = (body or "").strip()
    if header and body:
        return f"{header}\n\n{body}\n"
    if header:
        return f"{header}\n"
    return body + ("\n" if body else "")


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


def create_prompt(
    *,
    title: str,
    content: str,
    description: str = "",
    category: str = "",
    tags: list[str] | None = None,
    organization_label: str = "",
    organization_id: str | None = None,
    owner_id: str = "",
    source_filename: str | None = None,
    shared_with_org: bool = False,
    role: str = "",
    field: str = "",
    purpose: str = "",
    conditions: str = "",
    length: str = "",
    task_type: str = "",
) -> Prompt:
    pid = uuid.uuid4().hex[:12]
    now = time.time()
    p = Prompt(
        id=pid,
        title=title.strip() or "(제목 없음)",
        description=description.strip(),
        content=content,
        category=category.strip(),
        tags=tags or [],
        organization_label=organization_label.strip(),
        organization_id=organization_id,
        owner_id=owner_id,
        source_filename=source_filename,
        shared_with_org=shared_with_org,
        created_at=now,
        updated_at=now,
        role=role.strip(),
        field=field.strip(),
        purpose=purpose.strip(),
        conditions=conditions.strip(),
        length=length.strip(),
        task_type=_normalize_task_type(task_type),
    )
    with _lock:
        idx = _load_index()
        idx[pid] = p.model_dump()
        _save_index(idx)
    return p


def bulk_create(prompts: list[dict[str, Any]]) -> list[Prompt]:
    """일괄 생성 — HTML 임포트에서 사용.

    입력 dict는 create_prompt 의 키워드 인자와 같은 구조.
    """
    out: list[Prompt] = []
    now = time.time()
    with _lock:
        idx = _load_index()
        for d in prompts:
            pid = uuid.uuid4().hex[:12]
            p = Prompt(
                id=pid,
                title=(d.get("title") or "").strip() or "(제목 없음)",
                description=(d.get("description") or "").strip(),
                content=d.get("content") or "",
                category=(d.get("category") or "").strip(),
                tags=d.get("tags") or [],
                organization_label=(d.get("organization_label") or "").strip(),
                organization_id=d.get("organization_id"),
                owner_id=d.get("owner_id") or "",
                source_filename=d.get("source_filename"),
                shared_with_org=bool(d.get("shared_with_org", False)),
                created_at=now,
                updated_at=now,
                role=(d.get("role") or "").strip(),
                field=(d.get("field") or "").strip(),
                purpose=(d.get("purpose") or "").strip(),
                conditions=(d.get("conditions") or "").strip(),
                length=(d.get("length") or "").strip(),
                task_type=_normalize_task_type(d.get("task_type") or ""),
            )
            idx[pid] = p.model_dump()
            out.append(p)
        _save_index(idx)
    log.info("프롬프트 일괄 생성", count=len(out))
    return out


def list_prompts(
    *,
    organization_label: str | None = None,
    owner_id: str | None = None,
    scope: str = "all",  # mine | shared | org | all
) -> list[Prompt]:
    idx = _load_index()
    items = [Prompt(**m) for m in idx.values()]

    if organization_label:
        items = [it for it in items if it.organization_label == organization_label]

    if scope == "mine":
        items = [it for it in items if owner_id and it.owner_id == owner_id]
    elif scope == "shared":
        items = [
            it for it in items
            if it.shared_with_org and (owner_id is None or it.owner_id != owner_id)
        ]
    elif scope == "org":
        items = [
            it for it in items
            if (owner_id and it.owner_id == owner_id) or it.shared_with_org
        ]
    # all: 조직라벨 필터만 적용

    return sorted(items, key=lambda x: (x.organization_label, x.category, -x.created_at))


def list_organization_labels(owner_id: str | None = None) -> list[dict[str, Any]]:
    """등록된 회사/기관 라벨 목록 + 각 건수."""
    idx = _load_index()
    counts: dict[str, int] = {}
    for m in idx.values():
        label = m.get("organization_label") or "(라벨 없음)"
        if owner_id and m.get("owner_id") != owner_id and not m.get("shared_with_org"):
            continue
        counts[label] = counts.get(label, 0) + 1
    return [{"label": k, "count": v} for k, v in sorted(counts.items(), key=lambda kv: -kv[1])]


def get_prompt(pid: str) -> Prompt | None:
    idx = _load_index()
    m = idx.get(pid)
    return Prompt(**m) if m else None


def update_prompt(pid: str, **patch: Any) -> Prompt | None:
    allowed = {
        "title", "description", "content", "category", "tags",
        "organization_label", "shared_with_org",
        # 역관목조분 + 요정분생설 — patch 로 부분 갱신 가능
        "role", "field", "purpose", "conditions", "length", "task_type",
    }
    with _lock:
        idx = _load_index()
        if pid not in idx:
            return None
        m = idx[pid]
        for k, v in patch.items():
            if k in allowed and v is not None:
                if k == "task_type":
                    m[k] = _normalize_task_type(v)
                else:
                    m[k] = v
        m["updated_at"] = time.time()
        idx[pid] = m
        _save_index(idx)
        return Prompt(**m)


def delete_prompt(pid: str) -> bool:
    with _lock:
        idx = _load_index()
        if pid not in idx:
            return False
        del idx[pid]
        _save_index(idx)
    return True


def bulk_delete(*, organization_label: str | None = None, owner_id: str | None = None) -> int:
    """조건에 맞는 프롬프트를 일괄 삭제. 삭제된 건수 반환."""
    with _lock:
        idx = _load_index()
        to_delete = []
        for pid, m in idx.items():
            if organization_label is not None and m.get("organization_label") != organization_label:
                continue
            if owner_id is not None and m.get("owner_id") != owner_id:
                continue
            to_delete.append(pid)
        for pid in to_delete:
            del idx[pid]
        _save_index(idx)
    return len(to_delete)


def export_as_markdown(*, organization_label: str | None = None, owner_id: str | None = None) -> str:
    """프롬프트를 마크다운 핸드북 형식으로 출력."""
    items = list_prompts(organization_label=organization_label, owner_id=owner_id, scope="all")
    if not items:
        return f"# {organization_label or '프롬프트 모음'}\n\n(등록된 프롬프트 없음)\n"

    lines: list[str] = []
    lines.append(f"# {organization_label or '프롬프트 모음'}")
    lines.append("")
    lines.append(f"_총 {len(items)}건_")
    lines.append("")

    # 카테고리 그룹화
    by_cat: dict[str, list[Prompt]] = {}
    for it in items:
        cat = it.category or "(명세 없음)"
        by_cat.setdefault(cat, []).append(it)

    for cat, group in by_cat.items():
        lines.append(f"## {cat}")
        lines.append("")
        for i, p in enumerate(group, 1):
            lines.append(f"### {i}. {p.title}")
            if p.description:
                lines.append(f"> {p.description}")
                lines.append("")
            if p.tags:
                lines.append(" ".join(f"`{t}`" for t in p.tags))
                lines.append("")
            lines.append("```")
            lines.append(p.content)
            lines.append("```")
            lines.append("")

    return "\n".join(lines)
