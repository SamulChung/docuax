"""회사별 프롬프트 라이브러리 API.

엔드포인트:
  POST   /prompts                       단건 생성
  POST   /prompts/import-html           HTML 업로드 → 프롬프트 카드 일괄 임포트
  GET    /prompts                       목록 (organization_label, scope 필터)
  GET    /prompts/organizations         등록된 회사 라벨 목록 + 건수
  GET    /prompts/{id}                  상세
  PATCH  /prompts/{id}                  수정
  DELETE /prompts/{id}                  삭제
  DELETE /prompts                       조직 단위 일괄 삭제
  GET    /prompts/export/markdown       조직 단위 마크다운 핸드북 export
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Query, UploadFile
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

from app.api.deps import get_current_user_optional, is_admin_user
from app.core.logging import get_logger
from app.models import User
from app.providers.llm import get_llm_provider
from app.providers.llm.base import ChatMessage, ProviderUnavailable
from app.services.organization_profile import (
    list_profiles as list_org_profiles,
    update_profile as update_org_profile,
)
from app.services.prompt_card_extractor import extract_prompt_cards
from app.services.prompt_library import (
    TASK_TYPE_KO,
    TASK_TYPES,
    Prompt,
    bulk_create,
    bulk_delete,
    compose_content_from_axes,
    create_prompt,
    delete_prompt,
    export_as_markdown,
    get_prompt,
    list_organization_labels,
    list_prompts,
    update_prompt,
)
from app.services.template_library import UploadedTemplate, store_upload

router = APIRouter()
log = get_logger(__name__)

MAX_HTML_BYTES = 5 * 1024 * 1024  # 5MB


def _require_admin_for_write(user: User | None) -> None:
    """프롬프트 라이브러리는 관리자만 쓰기 가능 — 일반 사용자는 읽기·복사만.

    B2B 운영: 회사 표준 프롬프트는 관리자가 큐레이션, 직원은 소비.
    """
    if not is_admin_user(user):
        raise HTTPException(
            status_code=403,
            detail="프롬프트 라이브러리 쓰기는 관리자만 허용됩니다. 관리자에게 등록을 요청하세요.",
        )


class PromptCreate(BaseModel):
    title: str = Field(..., min_length=1)
    content: str = Field(..., min_length=1)
    description: str = ""
    category: str = ""
    tags: list[str] = Field(default_factory=list)
    organization_label: str = ""
    organization_id: str | None = None
    shared_with_org: bool = False
    # 역관목조분 + 요정분생설 — 신규 입력 마법사가 채워 넣는 구조 필드
    role: str = ""
    field: str = ""
    purpose: str = ""
    conditions: str = ""
    length: str = ""
    task_type: str = ""  # ""(미지정) 또는 TASK_TYPES 중 하나


class PromptUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    content: str | None = None
    category: str | None = None
    tags: list[str] | None = None
    organization_label: str | None = None
    shared_with_org: bool | None = None
    role: str | None = None
    field: str | None = None
    purpose: str | None = None
    conditions: str | None = None
    length: str | None = None
    task_type: str | None = None


class ImportResponse(BaseModel):
    imported: int
    detected_label: str
    warnings: list[str]
    prompts: list[Prompt]


class OrganizationStat(BaseModel):
    label: str
    count: int


@router.post("/prompts", response_model=Prompt)
async def create_one(
    body: PromptCreate,
    x_owner_id: str | None = Header(None, alias="X-Owner-Id"),
    user: Annotated[User | None, Depends(get_current_user_optional)] = None,
) -> Prompt:
    _require_admin_for_write(user)
    return create_prompt(
        title=body.title,
        content=body.content,
        description=body.description,
        category=body.category,
        tags=body.tags,
        organization_label=body.organization_label,
        organization_id=body.organization_id,
        owner_id=x_owner_id or "anonymous",
        shared_with_org=body.shared_with_org,
        role=body.role,
        field=body.field,
        purpose=body.purpose,
        conditions=body.conditions,
        length=body.length,
        task_type=body.task_type,
    )


@router.post("/prompts/import-html", response_model=ImportResponse)
async def import_html(
    file: UploadFile = File(...),
    organization_label: str = Form(""),
    organization_id: str | None = Form(None),
    shared_with_org: bool = Form(False),
    x_owner_id: str | None = Header(None, alias="X-Owner-Id"),
    user: Annotated[User | None, Depends(get_current_user_optional)] = None,
) -> ImportResponse:
    _require_admin_for_write(user)
    """프롬프트 핸드북 HTML 업로드 → 카드 자동 추출 → 일괄 저장.

    organization_label 이 비어 있으면 HTML <title> 또는 <h1> 으로 자동 추정.
    """
    filename = file.filename or "prompts.html"
    if not filename.lower().endswith((".html", ".htm")):
        raise HTTPException(status_code=400, detail="HTML 파일만 지원합니다.")
    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="빈 파일")
    if len(content) > MAX_HTML_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"파일이 너무 큽니다 ({len(content) / 1e6:.1f}MB). 최대 {MAX_HTML_BYTES / 1e6:.0f}MB",
        )

    result = extract_prompt_cards(content)
    if not result.prompts:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "프롬프트 카드를 찾지 못했습니다.",
                "warnings": result.warnings,
                "detected_label": result.detected_label,
            },
        )

    label = organization_label.strip() or result.detected_label or "(라벨 없음)"
    docs = [
        {
            "title": p.title,
            "description": p.description,
            "content": p.content,
            "category": p.category,
            "tags": p.tags,
            "organization_label": label,
            "organization_id": organization_id,
            "owner_id": x_owner_id or "anonymous",
            "source_filename": filename,
            "shared_with_org": shared_with_org,
        }
        for p in result.prompts
    ]
    saved = bulk_create(docs)
    log.info(
        "프롬프트 HTML 임포트",
        filename=filename,
        label=label,
        imported=len(saved),
        warnings=len(result.warnings),
    )
    return ImportResponse(
        imported=len(saved),
        detected_label=label,
        warnings=result.warnings,
        prompts=saved,
    )


@router.get("/prompts", response_model=list[Prompt])
async def list_all(
    organization_label: str | None = Query(None),
    scope: str = Query("all", pattern="^(mine|shared|org|all)$"),
    x_owner_id: str | None = Header(None, alias="X-Owner-Id"),
) -> list[Prompt]:
    return list_prompts(
        organization_label=organization_label,
        owner_id=x_owner_id,
        scope=scope,
    )


@router.get("/prompts/organizations", response_model=list[OrganizationStat])
async def list_orgs(
    x_owner_id: str | None = Header(None, alias="X-Owner-Id"),
) -> list[OrganizationStat]:
    return [OrganizationStat(**d) for d in list_organization_labels(owner_id=x_owner_id)]


@router.get("/prompts/export/markdown", response_class=PlainTextResponse)
async def export_markdown(
    organization_label: str | None = Query(None),
    x_owner_id: str | None = Header(None, alias="X-Owner-Id"),
) -> str:
    return export_as_markdown(
        organization_label=organization_label,
        owner_id=x_owner_id,
    )


@router.get("/prompts/{prompt_id}", response_model=Prompt)
async def get_one(prompt_id: str) -> Prompt:
    p = get_prompt(prompt_id)
    if not p:
        raise HTTPException(status_code=404, detail="프롬프트 없음")
    return p


@router.patch("/prompts/{prompt_id}", response_model=Prompt)
async def patch_one(
    prompt_id: str,
    body: PromptUpdate,
    x_owner_id: str | None = Header(None, alias="X-Owner-Id"),
    user: Annotated[User | None, Depends(get_current_user_optional)] = None,
) -> Prompt:
    _require_admin_for_write(user)
    existing = get_prompt(prompt_id)
    if not existing:
        raise HTTPException(status_code=404, detail="프롬프트 없음")
    updated = update_prompt(prompt_id, **body.model_dump(exclude_none=True))
    if not updated:
        raise HTTPException(status_code=404, detail="프롬프트 없음")
    return updated


@router.delete("/prompts/{prompt_id}")
async def delete_one(
    prompt_id: str,
    x_owner_id: str | None = Header(None, alias="X-Owner-Id"),
    user: Annotated[User | None, Depends(get_current_user_optional)] = None,
) -> dict:
    _require_admin_for_write(user)
    existing = get_prompt(prompt_id)
    if not existing:
        raise HTTPException(status_code=404, detail="프롬프트 없음")
    ok = delete_prompt(prompt_id)
    if not ok:
        raise HTTPException(status_code=404, detail="프롬프트 없음")
    return {"ok": True, "deleted_id": prompt_id}


@router.delete("/prompts")
async def delete_bulk(
    organization_label: str | None = Query(None),
    owner_only: bool = Query(False, description="True면 본인 소유만 삭제 (관리자도 이 옵션을 켜면 자기 것만)"),
    x_owner_id: str | None = Header(None, alias="X-Owner-Id"),
    user: Annotated[User | None, Depends(get_current_user_optional)] = None,
) -> dict:
    _require_admin_for_write(user)
    if not organization_label:
        raise HTTPException(status_code=400, detail="organization_label 필수")
    owner_id = x_owner_id if owner_only else None
    count = bulk_delete(organization_label=organization_label, owner_id=owner_id)
    return {"ok": True, "deleted": count, "organization_label": organization_label}


# ─────────────────────────────────────────────────────────────────────────────
# 역관목조분 + 요정분생설 ─ 구조화 미리보기 / AI 고도화
# ─────────────────────────────────────────────────────────────────────────────


class ComposeAxesRequest(BaseModel):
    """마법사 미리보기 — 5축 + task_type + 본문을 합쳐 content 미리보기 생성.

    프론트엔드 입력값 변경 시마다 호출되므로 LLM 안 씀.
    """

    role: str = ""
    field: str = ""
    purpose: str = ""
    conditions: str = ""
    length: str = ""
    task_type: str = ""
    body: str = ""


class ComposeAxesResponse(BaseModel):
    content: str
    normalized_task_type: str
    task_type_ko: str  # 한글 라벨 (UI 직접 사용)


@router.post("/prompts/compose-axes", response_model=ComposeAxesResponse)
async def compose_axes_preview(body: ComposeAxesRequest) -> ComposeAxesResponse:
    """프롬프트 마법사 입력 → content 미리보기.

    클라이언트도 같은 포맷 규칙을 가질 수 있지만, 서버에 두면
    포맷 변경 시 한 곳만 고치면 됨 (truth source = backend).
    """
    content = compose_content_from_axes(
        role=body.role,
        field=body.field,
        purpose=body.purpose,
        conditions=body.conditions,
        length=body.length,
        task_type=body.task_type,
        body=body.body,
    )
    from app.services.prompt_library import _normalize_task_type  # 내부 헬퍼 재사용

    nt = _normalize_task_type(body.task_type)
    return ComposeAxesResponse(
        content=content,
        normalized_task_type=nt,
        task_type_ko=TASK_TYPE_KO.get(nt, ""),
    )


class EnhanceResponse(BaseModel):
    """기존 프롬프트의 content 를 LLM 이 역관목조분/요정분생설로 추출한 제안.

    저장은 별도 PATCH /prompts/{id} 로 — 이 엔드포인트는 제안만 반환.
    """

    prompt_id: str
    suggested_role: str = ""
    suggested_field: str = ""
    suggested_purpose: str = ""
    suggested_conditions: str = ""
    suggested_length: str = ""
    suggested_task_type: str = ""  # 정규화된 영문 키 ("" 가능)
    suggested_task_type_ko: str = ""
    suggested_content: str = ""  # 5축을 합쳐 다시 조립한 새 본문
    rationale: str = ""  # LLM 의 추출 근거 한 줄
    model_version: str = ""
    latency_ms: float = 0.0


_ENHANCE_SYSTEM = (
    "당신은 한국어 프롬프트 엔지니어링 코치입니다. 입력된 자유 텍스트 프롬프트를 분석해 "
    "다음 두 프레임으로 추출하세요.\n\n"
    "1) 역관목조분 — 5축:\n"
    "   - role(역할): 누가 답하는가\n"
    "   - field(관련분야): 어떤 영역의 지식\n"
    "   - purpose(목적): 왜 답하는가\n"
    "   - conditions(조건): 제약·규칙·금지사항\n"
    "   - length(분량): 결과 길이/형식 (예: 'A4 한 쪽', '3단락')\n"
    "2) 요정분생설 — task_type 1개 선택:\n"
    "   summary(요약) / organization(정리) / analysis(분석) / generation(생성) / explanation(설명)\n\n"
    "규칙:\n"
    "- 원문에 명시되지 않은 축은 빈 문자열로 두세요. 절대 가공·창작하지 마세요.\n"
    "- 각 축 값은 한국어 한 문장 또는 명사구로 간결하게.\n"
    "- task_type 은 반드시 영문 키(summary/organization/analysis/generation/explanation) 또는 빈 문자열.\n"
    "- rationale 은 한 줄(80자 이내) — 왜 이 task_type 인지 핵심 근거.\n\n"
    "출력은 **반드시** 다음 JSON 한 개만 (다른 설명·코드블록 마커 금지):\n"
    "{\"role\":\"...\",\"field\":\"...\",\"purpose\":\"...\",\"conditions\":\"...\","
    "\"length\":\"...\",\"task_type\":\"...\",\"rationale\":\"...\"}"
)


def _parse_enhance_json(raw: str) -> dict:
    """LLM 응답에서 JSON 객체 1개를 파싱. 코드블록·앞뒤 잡음 제거."""
    import json
    import re

    s = (raw or "").strip()
    # ```json ... ``` 블록 제거
    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", s, re.DOTALL)
    if fence:
        s = fence.group(1)
    else:
        # 가장 바깥쪽 {} 추출
        first = s.find("{")
        last = s.rfind("}")
        if first >= 0 and last > first:
            s = s[first : last + 1]
    try:
        return json.loads(s)
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=502,
            detail=f"LLM 응답 JSON 파싱 실패: {e}. raw={raw[:200]!r}",
        ) from e


@router.post("/prompts/{prompt_id}/enhance", response_model=EnhanceResponse)
async def enhance_prompt(
    prompt_id: str,
    user: Annotated[User | None, Depends(get_current_user_optional)] = None,  # noqa: ARG001
) -> EnhanceResponse:
    """기존 프롬프트의 자유 텍스트 content 를 LLM 이 분석해 역관목조분/요정분생설 제안.

    저장하지 않음 — 사용자가 미리보기/diff 후 PATCH /prompts/{id} 로 확정.
    DB 변경 없는 LLM 호출이므로 인증 불필요 (rate-limit 으로 보호).
    """
    prompt = get_prompt(prompt_id)
    if not prompt:
        raise HTTPException(status_code=404, detail="프롬프트 없음")

    user_msg = (
        f"제목: {prompt.title}\n"
        f"설명: {prompt.description or '(없음)'}\n"
        f"카테고리: {prompt.category or '(없음)'}\n"
        f"라벨: {prompt.organization_label or '(없음)'}\n\n"
        "--- 원본 프롬프트 ---\n"
        f"{prompt.content}\n"
        "--- /원본 ---\n\n"
        "위 프롬프트를 분석해 역관목조분 5축과 요정분생설 task_type 을 추출하세요."
    )

    import time as _time

    started = _time.time()
    provider = get_llm_provider()
    try:
        raw = await provider.complete(
            messages=[
                ChatMessage(role="system", content=_ENHANCE_SYSTEM),
                ChatMessage(role="user", content=user_msg),
            ],
            temperature=0.2,
            max_tokens=800,
        )
    except ProviderUnavailable as e:
        raise HTTPException(status_code=502, detail=f"LLM 호출 실패: {e}") from e
    except Exception as e:  # noqa: BLE001
        log.exception("enhance_prompt LLM 예외", prompt_id=prompt_id)
        raise HTTPException(status_code=500, detail=f"LLM 호출 오류: {e}") from e
    latency_ms = (_time.time() - started) * 1000

    parsed = _parse_enhance_json(raw)
    from app.services.prompt_library import _normalize_task_type  # 내부 헬퍼 재사용

    nt = _normalize_task_type(parsed.get("task_type", "") or "")

    # 제안된 5축으로 새 content 재조립 (원본 content 는 그대로 두고 별도 필드로 노출)
    new_content = compose_content_from_axes(
        role=parsed.get("role", "") or "",
        field=parsed.get("field", "") or "",
        purpose=parsed.get("purpose", "") or "",
        conditions=parsed.get("conditions", "") or "",
        length=parsed.get("length", "") or "",
        task_type=nt,
        body=prompt.content.strip(),  # 원본 본문을 [유형]·5축 뒤에 그대로 보존
    )
    log.info(
        "프롬프트 AI 고도화",
        prompt_id=prompt_id,
        latency_ms=round(latency_ms, 1),
        task_type=nt,
    )
    return EnhanceResponse(
        prompt_id=prompt_id,
        suggested_role=parsed.get("role", "") or "",
        suggested_field=parsed.get("field", "") or "",
        suggested_purpose=parsed.get("purpose", "") or "",
        suggested_conditions=parsed.get("conditions", "") or "",
        suggested_length=parsed.get("length", "") or "",
        suggested_task_type=nt,
        suggested_task_type_ko=TASK_TYPE_KO.get(nt, ""),
        suggested_content=new_content,
        rationale=(parsed.get("rationale", "") or "")[:200],
        model_version=provider.model_id,
        latency_ms=latency_ms,
    )


# ─────────────────────────────────────────────────────────────────────────────
# 프롬프트 실행 → 결과를 양식으로 등록 (B2B 핵심 흐름)
# ─────────────────────────────────────────────────────────────────────────────

class PromptRunRequest(BaseModel):
    """프롬프트를 LLM에 실행. 사용자 입력 변수가 있으면 변수 치환 후 전송."""

    variables: dict[str, str] = Field(default_factory=dict, description="{{var}} 치환용 사전")
    user_input: str = Field("", description="프롬프트 끝에 덧붙일 사용자 추가 입력")
    temperature: float = Field(0.4, ge=0.0, le=1.0)
    max_tokens: int = Field(2048, ge=128, le=8192)


class PromptRunResponse(BaseModel):
    prompt_id: str
    prompt_title: str
    rendered_prompt: str  # 변수 치환·user_input 합쳐진 실제 LLM 입력
    result_markdown: str
    model_version: str
    latency_ms: float


def _render_prompt(template: str, variables: dict[str, str], user_input: str) -> str:
    """{{var}} 치환 + 사용자 입력 합치기."""
    rendered = template
    for k, v in variables.items():
        rendered = rendered.replace("{{" + k + "}}", v)
    if user_input.strip():
        rendered = f"{rendered}\n\n[사용자 추가 입력]\n{user_input.strip()}"
    return rendered


@router.post("/prompts/{prompt_id}/run", response_model=PromptRunResponse)
async def run_prompt(
    prompt_id: str,
    body: PromptRunRequest,
    user: Annotated[User | None, Depends(get_current_user_optional)] = None,  # noqa: ARG001
) -> PromptRunResponse:
    """프롬프트를 LLM에 실행 → 마크다운 결과 반환.

    DB 변경 없는 LLM 호출이므로 인증 불필요 (rate-limit 으로 비용 보호).
    프롬프트 카드의 메인 동작([📄 실행 → 문서])이 이 엔드포인트를 호출.
    """
    prompt = get_prompt(prompt_id)
    if not prompt:
        raise HTTPException(status_code=404, detail="프롬프트 없음")

    rendered = _render_prompt(prompt.content, body.variables, body.user_input)

    # DocuAX 시스템 프롬프트 — 결과는 마크다운으로
    system = (
        "당신은 한국 회사·기관의 표준 문서 작성을 돕는 전문 어시스턴트입니다. "
        "결과를 다음 규칙으로 작성하세요:\n"
        "1. 깔끔한 마크다운 문법 (제목은 #, 본문은 단락, 표는 파이프 표).\n"
        "2. 한국 공문 4단계 글머리(□ ○ ― ※)를 적절히 활용.\n"
        "3. 숫자·예산·날짜는 명시적으로 표기.\n"
        "4. 추측이나 가상의 수치를 만들지 말 것. 입력에 없는 사실은 [입력 필요] 로 표기."
    )

    import time as _time
    started = _time.time()
    provider = get_llm_provider()
    try:
        result = await provider.complete(
            messages=[
                ChatMessage(role="system", content=system),
                ChatMessage(role="user", content=rendered),
            ],
            temperature=body.temperature,
            max_tokens=body.max_tokens,
        )
    except ProviderUnavailable as e:
        raise HTTPException(status_code=502, detail=f"LLM 호출 실패: {e}") from e
    except Exception as e:  # noqa: BLE001
        log.exception("LLM 호출 예외", prompt_id=prompt_id)
        raise HTTPException(status_code=500, detail=f"LLM 호출 오류: {e}") from e

    latency_ms = (_time.time() - started) * 1000
    log.info(
        "프롬프트 실행",
        prompt_id=prompt_id,
        title=prompt.title,
        latency_ms=round(latency_ms, 1),
        chars=len(result),
    )
    return PromptRunResponse(
        prompt_id=prompt_id,
        prompt_title=prompt.title,
        rendered_prompt=rendered,
        result_markdown=result,
        model_version=provider.model_id,
        latency_ms=latency_ms,
    )


class PromptSaveAsTemplateRequest(BaseModel):
    """프롬프트 실행 결과를 양식 라이브러리(template_library)에 저장.

    같은 organization_label 을 가진 OrganizationProfile 이 있으면
    default_template_id 에 자동 연결.
    """

    content: str = Field(..., min_length=1, description="저장할 마크다운 (LLM 결과)")
    title: str = Field("", description="양식 제목. 비우면 프롬프트 제목 사용")
    category: str = Field("", description="공문/보고서/제안서/회의록/메모/기타")
    tags: list[str] = Field(default_factory=list)
    description: str = Field("", description="양식 설명")
    shared_with_org: bool = Field(True, description="조직 내 공유")
    auto_link_to_organization: bool = Field(
        True, description="True면 같은 prompt_label의 조직 프로파일에 default_template_id 자동 설정"
    )


class PromptSaveAsTemplateResponse(BaseModel):
    template: UploadedTemplate
    linked_organization_ids: list[str] = Field(
        default_factory=list,
        description="default_template_id 가 이 양식으로 갱신된 OrganizationProfile.id 들",
    )


@router.post("/prompts/{prompt_id}/save-as-template", response_model=PromptSaveAsTemplateResponse)
async def save_as_template(
    prompt_id: str,
    body: PromptSaveAsTemplateRequest,
    x_owner_id: str | None = Header(None, alias="X-Owner-Id"),
    user: Annotated[User | None, Depends(get_current_user_optional)] = None,
) -> PromptSaveAsTemplateResponse:
    """프롬프트 실행 결과를 양식으로 저장 + 조직 프로파일에 자동 연결.

    B2B 시나리오:
    1. 관리자가 회사 표준 보고서 프롬프트를 실행
    2. LLM이 표준 양식 마크다운을 생성
    3. 이 엔드포인트가 그 결과를 .md 파일로 저장
    4. 같은 라벨의 조직 프로파일(예: "경인지방데이터청")에 default_template_id 자동 설정
    5. 그 조직 직원이 변환하면 이 양식이 베이스로 자동 사용됨
    """
    _require_admin_for_write(user)
    prompt = get_prompt(prompt_id)
    if not prompt:
        raise HTTPException(status_code=404, detail="프롬프트 없음")

    title = (body.title or "").strip() or f"[{prompt.organization_label or '양식'}] {prompt.title}"
    filename = f"{title}.md"
    owner_id = x_owner_id or (user.id if user else "anonymous")

    template = store_upload(
        filename=filename,
        content=body.content.encode("utf-8"),
        extracted_markdown=body.content,
        extracted_title=title,
        file_format="md",
        description=body.description or f"프롬프트 [{prompt.title}] 실행 결과로 자동 생성",
        organization_id=None,
        warnings=[],
        category=body.category,
        tags=body.tags or list(prompt.tags),
        owner_id=owner_id,
        shared_with_org=body.shared_with_org,
    )

    linked_org_ids: list[str] = []
    if body.auto_link_to_organization and prompt.organization_label:
        # 같은 prompt_label 을 가진 조직 프로파일을 모두 찾아 연결
        for profile in list_org_profiles(include_private=True):
            if profile.prompt_label and profile.prompt_label == prompt.organization_label:
                updated = update_org_profile(profile.id, default_template_id=template.id)
                if updated:
                    linked_org_ids.append(profile.id)
                    log.info(
                        "조직 프로파일에 기본 양식 자동 연결",
                        organization_id=profile.id,
                        org_name=profile.name,
                        template_id=template.id,
                    )

    log.info(
        "프롬프트 결과를 양식으로 저장",
        prompt_id=prompt_id,
        template_id=template.id,
        title=title,
        linked_orgs=len(linked_org_ids),
    )
    return PromptSaveAsTemplateResponse(
        template=template,
        linked_organization_ids=linked_org_ids,
    )
