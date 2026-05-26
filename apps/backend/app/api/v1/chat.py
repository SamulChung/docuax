"""AI 채팅 API — 자유 대화(변환 외).

엔드포인트:
  POST /chat              메시지 배열 → AI 응답 (선택적 provider override)

특징:
  - provider 매개변수로 일시적으로 다른 LLM 호출 가능 (tenos / openai / anthropic / mock / chain)
  - provider 미지정 시 현재 활성 provider 사용
  - 시스템 프롬프트 자동 주입 (한국 문서 작성 컨텍스트)
  - Rate limit: convert와 동일 (분당 IP별 제한)
"""
from __future__ import annotations

import time
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_optional
from app.core.config import Settings, get_settings
from app.core.logging import get_logger
from app.core.rate_limit import rate_limit_convert
from app.db import get_db
from app.models import User, UserApiKey
from app.providers.llm import get_llm_provider
from app.providers.llm.base import ChatMessage as ProviderChatMessage, ProviderUnavailable
from app.providers.llm.registry import _build_single as build_specific_provider
from app.services.key_vault import decrypt
from app.services.organization_profile import get_profile as get_org_profile

router = APIRouter()
log = get_logger(__name__)


# 지원 provider id (settings.LLM_PROVIDER 와 일치)
ProviderId = Literal["tenos", "tenos_hf", "openai", "anthropic", "mock", "chain"]


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str = Field(..., min_length=1, max_length=20000)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(..., min_length=1, max_length=50)
    provider: ProviderId | None = Field(
        None,
        description="이번 호출에만 사용할 LLM provider. 미지정 시 현재 활성 provider.",
    )
    temperature: float = Field(0.7, ge=0.0, le=1.0)
    max_tokens: int = Field(1024, ge=64, le=4096)
    inject_system_prompt: bool = Field(
        True,
        description="True면 한국 문서 작성 보조 시스템 프롬프트 자동 추가",
    )
    # ─── 에디터 컨텍스트 — AI 가 현재 작성 중인 문서를 인지하도록 ───
    source_markdown: str = Field(
        "",
        max_length=40000,
        description="현재 에디터 본문 (마크다운). 비어 있지 않으면 system 메시지에 함께 주입.",
    )
    source_title: str = Field("", max_length=200, description="현재 문서 제목 (선택)")

    # ─── 변환결과 컨텍스트 — AI 가 PreviewPane 의 블록을 인지하도록 ───
    preview_summary: str = Field(
        "",
        max_length=20000,
        description=(
            "현재 변환결과 블록 요약 (blk-XXXX · type · 텍스트). "
            "AI 가 정확히 어느 블록을 가리키는지 알 수 있게."
        ),
    )
    selected_block_ids: list[str] = Field(
        default_factory=list,
        max_length=50,
        description="사용자가 변환결과에서 선택한 블록 ID. AI 응답 우선 대상.",
    )
    # ─── 조직 전용 AI 비서 ───────────────────────────────────────────────────
    organization_id: str | None = Field(
        None,
        description="조직 프로파일 ID. 설정된 ai_system_prompt 가 있으면 시스템 메시지에 주입.",
    )


class ChatResponse(BaseModel):
    message: str
    provider: str
    model_id: str
    latency_ms: float


DEFAULT_SYSTEM_PROMPT = (
    "당신은 (주)텐에이아이의 DocuAX — 한국 회사·기관 문서 작성을 돕는 AI 어시스턴트입니다.\n"
    "\n"
    "[운영사 회사 정보 — 사실에 기반한 답변용]\n"
    "사용자가 '텐에이아이', '회사', '우리 회사' 등으로 지칭하면 다음 회사가 본인의 회사입니다.\n"
    "이 정보는 (주)텐에이아이의 사실이므로, 회사 보고서·소개서·IR·사업계획 등 작성 시 그대로 활용하세요.\n"
    "  • 법인명     : (주)텐에이아이 (TenAI Co., Ltd.)\n"
    "  • 대표이사    : 정원훈\n"
    "  • 설립일자    : 2026년 3월 5일\n"
    "  • 사업자등록번호 : 801-81-03734\n"
    "  • 법인등록번호  : 110111-0952128\n"
    "  • 본사 주소    : 서울특별시 서초구 효령로 335, 202호\n"
    "  • 대표전화    : 02-588-9881\n"
    "  • 업태       : 정보통신업 · 교육서비스업\n"
    "  • 개인정보보호책임자(CPO) : 정원훈\n"
    "  • 홈페이지(예정): www.docuax.com (서비스) · www.tenai.kr (회사)\n"
    "  • 핵심 제품   : DocuAX — 한국 회사·기관 문서 자동화 SaaS 플랫폼\n"
    "  • 핵심 기술   : 한국어 특화 LLM (TenOS-Ko-28B) + Brain-Arms 2계층 아키텍처\n"
    "  • 출시 계획   : 2026년 7월 1일 정식 출시 (베타 5사 레퍼런스)\n"
    "  • 요금제     : Pro 월 9,900원 · Team 월 49,900원 · Enterprise 별도 협의\n"
    "  • 비전       : 한국 기업·기관의 문서 작성 시간을 1/10로 단축\n"
    "\n"
    "회사 보고서 작성 시 — 'DocuAX 제품 소개'와 '(주)텐에이아이 회사 소개'를 정확히 구분하세요:\n"
    "  • '텐에이아이 회사 소개서/IR' 요청 → 위 회사 정보·대표·설립·연혁·비전·재무 계획 중심\n"
    "  • 'DocuAX 제품/기술 소개' 요청 → 한국어 LLM·매크로 100종·HWPX 출력 등 기술 중심\n"
    "  • 두 가지가 섞인 'IR/투자유치 자료' → 회사 + 제품 모두 포함, 회사 정보부터 시작\n"
    "\n"
    "[대화 범위 — 매우 중요]\n"
    "이 채팅은 문서 작성·양식·검토·번역·요약·교정 등 '문서 관련 업무' 보조에 한정됩니다.\n"
    "다음 주제는 정중히 거절하고 문서 작성 도움을 다시 안내하세요:\n"
    "  - 일반 잡담, 시사·정치, 연예·스포츠, 개인 상담\n"
    "  - 코드 작성·디버깅(문서화 외), 수학·과학 문제 풀이\n"
    "  - 의료·법률 자문, 투자·재산 조언\n"
    "거절 예시: \"이 채팅은 문서 작성·양식 관련 도움에 한정되어 있습니다. \"\n"
    "  \"보고서·공문·제안서·회의록 등 어떤 문서를 작성하시는지 알려주세요.\"\n"
    "\n"
    "[답변 원칙]\n"
    "1. 답변은 깔끔한 한국어로. 필요하면 마크다운 활용 (표·헤딩·글머리).\n"
    "2. 한국 공문 4단계 글머리(□ ○ ― ※)를 적절히 활용.\n"
    "3. 추측·환각 금지. 사실 확인이 필요한 부분은 [확인 필요] 로 명시.\n"
    "4. 응답은 핵심부터, 불필요한 인사·반복 금지.\n"
    "5. 사용자가 표·예산·일정 등 정형 데이터를 요구하면 마크다운 표로.\n"
    "6. 사용자가 '이 문서', '여기에', '추가해줘' 등으로 지칭하면 함께 전달된 에디터 마크다운을 의미합니다.\n"
    "\n"
    "[문서 본문 작성 — 절대 규칙]\n"
    "사용자가 보고서·공문·제안서·회의록·기획서 등 '문서를 작성/만들어/써' 등으로 요청하면,\n"
    "답변은 곧바로 문서 본문이어야 합니다. 채팅 회화체 절대 금지:\n"
    "  ✗ 금지: '다음은 ~ 보고서입니다.' '여기 ~을 정리했습니다.' '아래는 ~입니다.'\n"
    "  ✗ 금지: '이 보고서를 기반으로 추가 수정이 필요하시면 말씀해주세요.'\n"
    "  ✗ 금지: '도움이 되었길 바랍니다.' '~로 도움드릴 수 있어 기쁩니다.'\n"
    "  ✗ 금지: '이 템플릿은~' '이 문서는~' 같은 메타 코멘트 (문서가 자신을 설명)\n"
    "  ✗ 금지: 마지막 줄에 '---' + 안내 문구 (그대로 변환 결과에 노출됨)\n"
    "  ✓ 권장: 첫 줄부터 헤딩 또는 본문 단락. 문서가 곧장 시작.\n"
    "  ✓ 권장: 마무리도 본문의 마지막 문장으로. 메타 코멘트 없이 끝남.\n"
    "예시 — '주간보고서 만들어줘' 요청 시:\n"
    "  ✗ 잘못: \"다음은 SaaS 회사의 PM을 위한 주간 보고서 템플릿입니다.\\n\\n# 핵심 성과\\n...\"\n"
    "  ✓ 올바: \"# 주간 보고\\n\\n## 핵심 성과\\n□ 월 매출 15% 증가\\n...\"\n"
    "\n"
    "[코드 펜스 절대 금지]\n"
    "마크다운 본문을 응답할 때 ```markdown ... ``` 같은 코드 펜스로 감싸지 마세요.\n"
    "  ✗ 잘못: \"```markdown\\n# 보고서\\n...\\n```\"  (펜스로 감싸면 본문이 코드 블록처럼 보임)\n"
    "  ✓ 올바: \"# 보고서\\n...\"                       (바로 마크다운 본문)\n"
    "본문 안의 부분 코드(파이썬 등)는 펜스 사용 OK. 전체 응답을 펜스로 감싸지만 마세요.\n"
    "\n"
    "단, 사용자가 '~에 대해 알려줘' 같은 질문이면 일반 대화체 OK.\n"
    "\n"
    "[액션 태그 — 변환결과에 직접 반영]\n"
    "사용자가 '이 블록을 빨강으로', '여기 표 추가', '이 단락 다시 써' 같은 요청을 하면,\n"
    "응답 끝에 다음 태그 중 하나를 단독 줄로 적어주세요. UI 가 자동 실행합니다:\n"
    "  [블록교체:blk-0003] 새로운 마크다운 본문\n"
    "  [블록추가:after:blk-0003] 추가할 마크다운\n"
    "  [에디터교체] 전체 에디터를 이 내용으로 교체할 마크다운\n"
    "  [에디터추가] 에디터 끝에 추가할 마크다운\n"
    "  [변환실행] (인자 없음 — 사용자가 변환 결과를 갱신해야 할 때)\n"
    "태그는 정확한 ID 가 보일 때만 사용 (오타·추측 금지). 모르면 일반 답변만."
)


async def _settings_with_user_key(
    base: Settings, user: User | None, db: AsyncSession, provider_id: str,
) -> tuple[Settings, bool]:
    """사용자 본인 키가 있으면 settings 사본에 덮어쓴 채 반환.

    반환: (effective_settings, used_user_key)
    used_user_key=True 면 last_used_at 갱신 신호.
    """
    if user is None or provider_id not in ("openai", "anthropic"):
        return base, False
    res = await db.execute(
        select(UserApiKey).where(
            UserApiKey.user_id == user.id, UserApiKey.provider == provider_id,
        )
    )
    row = res.scalar_one_or_none()
    if not row:
        return base, False
    plain = decrypt(row.encrypted_key)
    if not plain:
        return base, False
    # Settings 는 frozen 이 아니지만 안전을 위해 model_copy
    overrides: dict = {}
    if provider_id == "openai":
        overrides["openai_api_key"] = plain
    elif provider_id == "anthropic":
        overrides["anthropic_api_key"] = plain
    effective = base.model_copy(update=overrides)
    return effective, True


@router.post("/chat", response_model=ChatResponse)
async def chat(
    body: ChatRequest,
    user: Annotated[User | None, Depends(get_current_user_optional)] = None,
    db: AsyncSession = Depends(get_db),
    _rl: None = Depends(rate_limit_convert),
) -> ChatResponse:
    """AI 채팅 — 자유 대화. 변환 rate limit 공유 (무거운 작업)."""
    # 시스템 프롬프트 자동 주입 (이미 있으면 건너뜀)
    msgs: list[ProviderChatMessage] = []
    if body.inject_system_prompt and not any(m.role == "system" for m in body.messages):
        system_text = DEFAULT_SYSTEM_PROMPT
        # 에디터 컨텍스트가 있으면 시스템 프롬프트에 추가
        if body.source_markdown.strip():
            ctx_parts: list[str] = ["\n\n[사용자가 현재 작성 중인 문서]"]
            if body.source_title.strip():
                ctx_parts.append(f"제목: {body.source_title.strip()}")
            # 너무 길면 앞·뒤 합쳐 12,000자만 (토큰 한도 보호)
            md = body.source_markdown
            if len(md) > 12_000:
                md = md[:8_000] + "\n... [중략] ...\n" + md[-3_000:]
            ctx_parts.append("```markdown\n" + md + "\n```")
            ctx_parts.append(
                "위 문서를 참조하여 사용자의 질문에 답하세요. "
                "사용자가 '이 문서', '여기에', '추가해줘' 등으로 지칭하면 위 마크다운을 의미합니다. "
                "필요한 수정 사항은 정확한 마크다운으로 응답하세요 — 사용자가 한 번에 에디터에 붙여넣을 수 있도록."
            )
            system_text = system_text + "".join(f"\n{p}" for p in ctx_parts)

        # 변환결과 블록 컨텍스트 — '이 블록' '여기 표' 지칭 시 정확한 ID 매칭에 필요
        if body.preview_summary.strip():
            preview = body.preview_summary
            if len(preview) > 8_000:
                preview = preview[:6_000] + "\n... [중략] ...\n" + preview[-1_500:]
            system_text += (
                "\n\n[현재 변환결과 — 미리보기 블록 목록]\n"
                "각 줄: <blk-ID> <type> <텍스트 발췌>\n"
                "```\n" + preview + "\n```\n"
                "사용자가 '이 블록' '여기' 같은 지시어를 쓰면 위 ID 와 매칭해 답하세요. "
                "수정이 필요하면 [블록교체:blk-XXXX] 액션 태그를 사용하세요."
            )

        if body.selected_block_ids:
            system_text += (
                f"\n\n[사용자가 선택한 블록] {', '.join(body.selected_block_ids[:20])}\n"
                "위 ID들이 현재 사용자의 집중 대상입니다. 명시적 지정이 없으면 이 블록들을 기준으로 답하세요."
            )

        # 조직 전용 AI 비서 인스트럭션 주입
        if body.organization_id:
            org = get_org_profile(body.organization_id)
            if org and org.ai_system_prompt.strip():
                persona = f" ({org.ai_persona_name})" if org.ai_persona_name.strip() else ""
                system_text += (
                    f"\n\n[조직 전용 AI 비서 지침{persona} — {org.name}]\n"
                    + org.ai_system_prompt.strip()
                )

        msgs.append(ProviderChatMessage(role="system", content=system_text))
    msgs.extend(ProviderChatMessage(role=m.role, content=m.content) for m in body.messages)

    # provider 결정 — 요청 override 우선. 본인 BYOK 키가 있으면 그것으로.
    used_user_key = False
    auto_resolved = ""  # "anthropic_byok" / "openai_byok" / "system" — 로그용
    resolved_provider_id = body.provider or ""

    if body.provider and body.provider != "chain":
        base = get_settings()
        effective, used_user_key = await _settings_with_user_key(base, user, db, body.provider)
        try:
            provider = build_specific_provider(body.provider, effective)
        except Exception as e:  # noqa: BLE001
            log.warning("provider 빌드 실패", provider=body.provider, error=str(e))
            raise HTTPException(
                status_code=400,
                detail=f"{body.provider} provider 사용 불가 — 키·설정 확인 필요. ({e})",
            ) from e
    else:
        # "자동" 모드 — 사용자에게 BYOK 키가 있으면 그것을 우선 사용
        # 우선순위: Anthropic BYOK > OpenAI BYOK > 시스템 기본 provider
        auto_provider_id: str | None = None
        if user is not None:
            res = await db.execute(
                select(UserApiKey)
                .where(UserApiKey.user_id == user.id)
                .where(UserApiKey.provider.in_(("anthropic", "openai")))
            )
            rows = res.scalars().all()
            # Anthropic 우선 (한국어 품질 + 긴 컨텍스트), 둘 다 있으면 Anthropic
            priority = {"anthropic": 0, "openai": 1}
            rows_sorted = sorted(rows, key=lambda r: priority.get(r.provider, 99))
            if rows_sorted:
                auto_provider_id = rows_sorted[0].provider

        if auto_provider_id:
            base = get_settings()
            effective, used_user_key = await _settings_with_user_key(
                base, user, db, auto_provider_id,
            )
            try:
                provider = build_specific_provider(auto_provider_id, effective)
                auto_resolved = f"{auto_provider_id}_byok"
                resolved_provider_id = auto_provider_id
            except Exception as e:  # noqa: BLE001
                log.warning("자동 모드 BYOK provider 빌드 실패 — 시스템 기본으로 폴백",
                            provider=auto_provider_id, error=str(e))
                provider = get_llm_provider()
                auto_resolved = "system"
        else:
            provider = get_llm_provider()
            auto_resolved = "system"

    started = time.time()
    try:
        result = await provider.complete(
            messages=msgs,
            temperature=body.temperature,
            max_tokens=body.max_tokens,
        )
    except ProviderUnavailable as e:
        log.warning("LLM 응답 불가", provider=provider.name, reason=e.reason)
        raise HTTPException(
            status_code=502,
            detail=f"{provider.name} 모델이 응답할 수 없습니다 — {e.reason}",
        ) from e
    except Exception as e:  # noqa: BLE001
        log.exception("채팅 오류", provider=provider.name)
        raise HTTPException(status_code=500, detail=f"채팅 오류: {e}") from e

    latency_ms = (time.time() - started) * 1000
    log.info(
        "채팅 응답",
        provider=provider.name,
        model_id=provider.model_id,
        msgs=len(msgs),
        chars=len(result),
        latency_ms=round(latency_ms, 1),
        user=user.email if user else "anonymous",
        byok=used_user_key,
        requested=body.provider or "auto",
        resolved=resolved_provider_id or provider.name,
        auto_resolved=auto_resolved or "n/a",
    )

    # 본인 키 사용 시 last_used_at 갱신 (best-effort) — 자동 모드 resolved 까지 포함
    if used_user_key and user and resolved_provider_id in ("openai", "anthropic"):
        try:
            from datetime import datetime as _dt
            res = await db.execute(
                select(UserApiKey).where(
                    UserApiKey.user_id == user.id, UserApiKey.provider == resolved_provider_id,
                )
            )
            row = res.scalar_one_or_none()
            if row:
                row.last_used_at = _dt.utcnow()
                await db.commit()
        except Exception:
            pass
    return ChatResponse(
        message=result,
        provider=provider.name,
        model_id=provider.model_id,
        latency_ms=latency_ms,
    )
