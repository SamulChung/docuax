"""Mock provider — 테스트·CI·로컬 데모용. LLM 호출 없이 결정적 결과를 반환."""
from __future__ import annotations

import re
from typing import Any

from app.providers.llm._openai_compat import _regex_yellow_tags
from app.providers.llm.base import (
    ChatMessage,
    DocumentClass,
    DocumentClassification,
    HealthStatus,
    ModelProvider,
    ReviewTag,
    ReviewTags,
    TemplateMatchScore,
)


class MockProvider(ModelProvider):
    """결정적 응답을 반환. 운영에서는 사용 금지 — 개발 편의용."""

    name = "mock"

    @property
    def model_id(self) -> str:
        return "mock:deterministic-v1"

    @classmethod
    def from_settings(cls, settings: Any) -> "MockProvider":  # noqa: ARG003
        return cls()

    async def complete(
        self,
        messages: list[ChatMessage],
        *,
        temperature: float = 0.2,  # noqa: ARG002
        max_tokens: int = 1024,  # noqa: ARG002
        json_schema: dict[str, Any] | None = None,  # noqa: ARG002
    ) -> str:
        last = messages[-1].content if messages else ""
        sys = next((m.content for m in messages if m.role == "system"), "")

        # 프롬프트 라이브러리 'AI 고도화' 시스템 프롬프트 감지 — 유효 JSON 반환
        # (mock 모드에서도 enhance API 가 end-to-end 동작하도록.)
        if "역관목조분" in sys or "요정분생설" in sys:
            return self._mock_enhance_json(last)

        # run_prompt 시스템 메시지 감지 → 구조화된 한국 보고서 스켈레톤 반환.
        # (실제 LLM 으로 바꾸기 전 demo 흐름이 의미 있는 결과를 보여주도록.)
        if "표준 문서 작성" in sys or ("마크다운" in sys and "한국 공문" in sys):
            return self._mock_run_document(last)

        return f"[mock] echo: {last[:120]}"

    def _mock_run_document(self, user_text: str) -> str:
        """run_prompt 호출 시 — 사용자 프롬프트에서 섹션을 추출해 한국 공문 형식 보고서 스켈레톤.

        실제 LLM 으로 바꾸기 전이라도 demo 흐름이 의미 있는 결과를 보여주도록.
        실제 콘텐츠는 [입력 필요] 자리표시자 — 사용자가 보고 채워 넣거나 실제 LLM 으로 전환.
        """
        # 1) 제목 추정 — 사용자 텍스트에서 문서 유형 키워드 검색
        #    + 앞쪽에 등장하는 조직/대상 명사(예: "농협 강의안") 가져오기
        title = "업무 보고서"
        doc_type: str = "report"  # report | lecture | proposal | minutes | gongmun | plan
        doc_keywords: list[tuple[str, str, str]] = [
            # (검색 키, 기본 타이틀, doc_type)
            ("강의안", "강의 계획안", "lecture"),
            ("강의 계획", "강의 계획안", "lecture"),
            ("교육 계획", "교육 계획안", "lecture"),
            ("커리큘럼", "교육 커리큘럼", "lecture"),
            ("주간 보고", "주간 업무 보고서", "report"),
            ("월간 보고", "월간 업무 보고서", "report"),
            ("보고서", "업무 보고서", "report"),
            ("제안", "사업 제안서", "proposal"),
            ("회의록", "회의록", "minutes"),
            ("공문", "공문 (수신·기안)", "gongmun"),
            ("기획서", "사업 기획서", "plan"),
            ("기획", "사업 기획서", "plan"),
        ]
        for kw, fallback, dt in doc_keywords:
            if kw in user_text:
                title = fallback
                doc_type = dt
                # "농협 강의안" 같이 직전에 조직/대상 명사가 있으면 제목 앞에 붙임
                m = re.search(rf"([가-힣A-Za-z]{{2,8}})\s*{re.escape(kw)}", user_text)
                if m:
                    qualifier = m.group(1).strip()
                    # 자명한 시제 단어 제거
                    if qualifier not in {"이번", "다음", "지난", "오늘", "내일", "어제", "업무"}:
                        title = f"{qualifier} {fallback}"
                break

        # 2) 섹션 추출 — "성과·진행·이슈·계획" 같은 가운뎃점 클러스터 우선
        candidates: list[str] = []

        # 가운뎃점 클러스터: 토큰[·]토큰[·]토큰 … (최소 3개 이상의 토큰)
        # 각 토큰은 공백 포함 가능 — 마지막 토큰은 다음 문장부호/줄바꿈 직전까지.
        cluster_match = re.search(r"(?:[^·・·\n.,;。]+[·・·])+[^·・·\n.,;。]+", user_text)
        if cluster_match:
            cluster = cluster_match.group(0)
            for raw in re.split(r"[·・·]", cluster):
                p = raw.strip()
                if not p:
                    continue
                # 조사 직전의 한국어 명사 우선 (예: "계획을" → "계획")
                noun = re.search(r"([가-힣]{2,5})(?=[을를이가는은와과의로에서도])", p)
                if noun:
                    candidates.append(noun.group(1))
                    continue
                # 없으면 마지막 한국어/영어 단어 (예: "이번 주 핵심 성과" → "성과")
                words = re.findall(r"[가-힣A-Za-z]{2,8}", p)
                # 의미 없는 시제·수량 단어 제거
                stop = {"이번", "다음", "지난", "주간", "현재", "최근", "오늘", "내일", "어제"}
                words = [w for w in words if w not in stop]
                if words:
                    candidates.append(words[-1])

        # 후보가 부족하면 키워드 매칭으로 보강
        if len(candidates) < 3:
            for kw in (
                "배경", "현황", "목표", "추진", "성과", "진행", "이슈",
                "리스크", "계획", "결론", "제안", "분석",
            ):
                if kw in user_text and kw not in candidates:
                    candidates.append(kw)
                if len(candidates) >= 5:
                    break
        if not candidates:
            # doc_type 에 따라 기본 섹션 다름
            candidates = {
                "lecture": ["강의 일정", "학습 목표", "주요 내용", "강의 자료", "평가/과제"],
                "proposal": ["배경", "제안 내용", "기대 효과", "추진 일정", "예산"],
                "minutes": ["일시·장소", "참석자", "안건 1", "안건 2", "결정 사항"],
                "gongmun": ["수신·발신", "제목", "본문", "붙임"],
                "plan": ["배경", "목표", "추진 전략", "세부 일정", "예산"],
                "report": ["배경", "현황", "분석", "제안", "결론"],
            }.get(doc_type, ["배경", "현황", "분석", "제안", "결론"])
        # 중복 제거 + 최대 5개로 제한
        seen: set[str] = set()
        unique: list[str] = []
        for c in candidates:
            if c not in seen:
                unique.append(c)
                seen.add(c)
        candidates = unique[:5]

        # 3) 마크다운 조립 — 한국 공문 4단계 글머리(□ ○ ― ※) 활용
        lines: list[str] = [
            f"# {title}",
            "",
            "_(데모 모드 — `mock` LLM 결과. 실제 콘텐츠는 LLM provider 전환 후 생성됩니다.)_",
            "",
            "## 개요",
            "",
            "□ 작성 목적",
            "  ○ [입력 필요] 본 보고서의 목적 한 줄 요약",
            "  ○ [입력 필요] 대상 독자·승인자",
            "",
            "□ 작성 일자 · 작성자",
            "  ○ 작성 일자: [입력 필요]",
            "  ○ 작성자: [입력 필요]",
            "",
        ]
        for i, section in enumerate(candidates, 1):
            lines.append(f"## {i}. {section}")
            lines.append("")
            lines.append(f"□ {section} 주요 사항")
            lines.append(f"  ○ [입력 필요] {section} 관련 핵심 내용 1")
            lines.append(f"  ○ [입력 필요] {section} 관련 핵심 내용 2")
            lines.append(f"  ― 세부: [입력 필요]")
            lines.append(f"  ※ 비고: [입력 필요]")
            lines.append("")
        lines.append("## 결론")
        lines.append("")
        lines.append("□ 종합")
        lines.append("  ○ [입력 필요] 핵심 메시지")
        lines.append("  ○ [입력 필요] 후속 액션")
        return "\n".join(lines)

    def _mock_enhance_json(self, user_text: str) -> str:
        """간단한 키워드 휴리스틱으로 5축 + task_type 을 추측해 JSON 반환."""
        import json

        t = user_text
        # task_type 키워드 매칭 (한국어 단순 휴리스틱)
        if any(k in t for k in ("요약", "정리해", "한 문장으로")):
            tt = "summary"
        elif any(k in t for k in ("정리", "목록", "표로")):
            tt = "organization"
        elif any(k in t for k in ("분석", "원인", "비교")):
            tt = "analysis"
        elif any(k in t for k in ("생성", "초안", "작성")):
            tt = "generation"
        elif any(k in t for k in ("설명", "풀이", "이해")):
            tt = "explanation"
        else:
            tt = "generation"  # 기본값
        return json.dumps(
            {
                "role": "한국어 비즈니스 문서 어시스턴트",
                "field": "(원본에 명시 안 됨)",
                "purpose": "(원본에 명시 안 됨)",
                "conditions": "추측·창작 금지, 입력에 없는 사실은 [입력 필요]",
                "length": "A4 한 쪽 분량",
                "task_type": tt,
                "rationale": f"[mock] 키워드 휴리스틱으로 {tt} 로 분류",
            },
            ensure_ascii=False,
        )

    async def classify_document(self, text: str) -> DocumentClassification:
        # 키워드 기반 결정
        if any(k in text for k in ("공문", "수신", "기안", "결재")):
            cls = DocumentClass.GONGMUN
        elif any(k in text for k in ("제안", "사업계획")):
            cls = DocumentClass.PROPOSAL
        elif any(k in text for k in ("보고", "결과")):
            cls = DocumentClass.REPORT
        elif "회의" in text:
            cls = DocumentClass.MINUTES
        else:
            cls = DocumentClass.GENERAL
        return DocumentClassification(
            document_class=cls,
            confidence=0.85,
            rationale=f"키워드 매칭 → {cls.value}",
        )

    async def review_tag(self, text: str) -> ReviewTags:
        tags: list[ReviewTag] = []
        # 빨강 — "추정", "예상" 같은 hedging
        for m in re.finditer(r"(?:추정|예상|예측|것으로 보임|것으로 추정)", text):
            tags.append(
                ReviewTag(
                    span_start=m.start(),
                    span_end=m.end(),
                    color="red",
                    reason="추정 표현 — 근거 확인 필요",
                    confidence=0.7,
                )
            )
        # 파랑 — bold 마크다운, 「 」 강조
        for m in re.finditer(r"\*\*([^*]+)\*\*|「([^」]+)」", text):
            tags.append(
                ReviewTag(
                    span_start=m.start(),
                    span_end=m.end(),
                    color="blue",
                    reason="강조 키워드",
                    confidence=0.85,
                )
            )
        # 노랑 — 정규식 보강 모두 사용
        tags.extend(_regex_yellow_tags(text, existing=tags))
        return ReviewTags(tags=tags, model_version=self.model_id)

    async def score_template_match(
        self, doc_text: str, reference_chunks: list[str]
    ) -> TemplateMatchScore:
        # 간단한 휴리스틱 — 공통 토큰 비율
        if not reference_chunks:
            return TemplateMatchScore(score=0.5, suggestions=["참고 양식 없음"])
        ref_tokens = set()
        for c in reference_chunks:
            ref_tokens |= set(c.split())
        doc_tokens = set(doc_text.split())
        if not ref_tokens:
            return TemplateMatchScore(score=0.5)
        overlap = len(ref_tokens & doc_tokens) / max(1, len(ref_tokens))
        return TemplateMatchScore(
            score=min(1.0, overlap * 1.5),
            breakdown={"token_overlap": overlap},
            suggestions=[],
        )

    async def health_check(self) -> HealthStatus:
        return HealthStatus(available=True, provider=self.name, model="mock", latency_ms=0.1)
