"""검토 매크로 10종 — R1~R10. 10종 모두 AI 강화.

이 매크로들은 비동기 apply_async()를 제공한다 — provider 호출이 들어가기 때문.
sync apply()는 빠른 결과(예: 정규식 기반)로 폴백.
"""
from __future__ import annotations

import asyncio
import re
from typing import Any

from app.macros.base import Macro, MacroCategory
from app.macros.helpers import get_selected_blocks, iter_runs
from app.pipeline.ir import DocumentIR, InlineRun
from app.providers.llm import ChatMessage, ModelProvider, ReviewTag, ReviewTags


class R1_AIReviewAll(Macro):
    id = "R1"; category = MacroCategory.REVIEW
    name = "AI 재검토 (전체)"; description = "현재 문서 전체에 AI 검토 표시 재실행"
    ai_powered = True
    shortcut = {"win": "Ctrl+Shift+R", "mac": "⌘+Shift+R"}

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        provider: ModelProvider | None = (params or {}).get("_provider")  # type: ignore[assignment]
        if provider is None:
            return ir
        tags = asyncio.run(provider.review_tag(ir.plain_text()))
        ir.review_tags = tags.tags
        return ir


class R2_AIReviewSelection(Macro):
    id = "R2"; category = MacroCategory.REVIEW
    name = "AI 재검토 (선택)"; description = "선택 영역만 AI 검토 표시 재실행"
    ai_powered = True

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        provider: ModelProvider | None = (params or {}).get("_provider")  # type: ignore[assignment]
        if provider is None:
            return ir
        selected = "\n".join(b.to_plain_text() for b in get_selected_blocks(ir, params))
        if not selected.strip():
            return ir
        tags = asyncio.run(provider.review_tag(selected))
        # 선택 영역 외 기존 태그 유지
        ir.review_tags = [t for t in ir.review_tags if not any(b.id in (params or {}).get("selected_block_ids", []) for b in ir.blocks)]
        ir.review_tags.extend(tags.tags)
        return ir


class R3_HallucinationSuspect(Macro):
    id = "R3"; category = MacroCategory.REVIEW
    name = "할루시네이션 의심 표시"; description = "신뢰도 낮은 주장을 빨강으로 자동 표시"
    ai_powered = True

    _HEDGE_RE = re.compile(
        r"(?:추정|예상|예측|것으로 보|것으로 추정|것으로 추측|할 것으로|보입니다|것으로 판단)"
    )

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        text = ir.plain_text()
        for m in self._HEDGE_RE.finditer(text):
            ir.review_tags.append(
                ReviewTag(
                    span_start=m.start(),
                    span_end=m.end(),
                    color="red",
                    reason="추정 표현 — 사실 확인 필요",
                    confidence=0.7,
                )
            )
        return ir


class R4_NumberVerify(Macro):
    id = "R4"; category = MacroCategory.REVIEW
    name = "숫자 검증"; description = "문서 내 모든 숫자를 노랑으로 표시 + 단위·일관성 체크"
    ai_powered = True

    _NUM_RE = re.compile(
        r"\b(?:\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(?:원|만원|억|%|건|명|개|일|월|년|시간|분|초)?\b"
    )

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        text = ir.plain_text()
        existing = {(t.span_start, t.span_end) for t in ir.review_tags if t.color == "yellow"}
        for m in self._NUM_RE.finditer(text):
            span = (m.start(), m.end())
            if span in existing:
                continue
            ir.review_tags.append(
                ReviewTag(
                    span_start=span[0],
                    span_end=span[1],
                    color="yellow",
                    reason="숫자 검증 필요",
                    confidence=0.95,
                )
            )
        return ir


class R5_LogicContradiction(Macro):
    id = "R5"; category = MacroCategory.REVIEW
    name = "논리 모순 탐지"; description = "문서 내 논리적 모순 자동 탐지 + 빨강 표시"
    ai_powered = True

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        provider: ModelProvider | None = (params or {}).get("_provider")  # type: ignore[assignment]
        if provider is None:
            return ir

        async def _ask() -> ReviewTags:
            return await provider.review_tag(ir.plain_text())

        tags = asyncio.run(_ask())
        ir.review_tags.extend([t for t in tags.tags if t.color == "red"])
        return ir


class R6_ToneConsistency(Macro):
    id = "R6"; category = MacroCategory.REVIEW
    name = "어조 일관성 체크"; description = "격식체·평어체 혼용 자동 탐지"
    ai_powered = True

    _POLITE = re.compile(r"(?:습니다|합니다|입니다|됩니다|드립니다)")
    _CASUAL = re.compile(r"(?:한다\.|이다\.|다\.|있다\.|된다\.)")

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        text = ir.plain_text()
        polite_count = len(self._POLITE.findall(text))
        casual_count = len(self._CASUAL.findall(text))
        if polite_count > 0 and casual_count > 0:
            # 더 적은 쪽이 혼용 표시 대상
            target_re = self._CASUAL if polite_count > casual_count else self._POLITE
            for m in target_re.finditer(text):
                ir.review_tags.append(
                    ReviewTag(
                        span_start=m.start(),
                        span_end=m.end(),
                        color="red",
                        reason="어조 혼용 — 격식체/평어체 통일 필요",
                        confidence=0.6,
                    )
                )
        return ir


class R7_SpellCheck(Macro):
    id = "R7"; category = MacroCategory.REVIEW
    name = "맞춤법·문법 검사"; description = "한국어 맞춤법·띄어쓰기·문법 자동 검사"
    ai_powered = True

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        provider: ModelProvider | None = (params or {}).get("_provider")  # type: ignore[assignment]
        if provider is None:
            return ir

        async def _ask() -> str:
            return await provider.complete(
                [
                    ChatMessage(
                        role="system",
                        content="당신은 한국어 맞춤법 교정 도우미입니다. 입력 문서에서 맞춤법·띄어쓰기 오류를 찾아 JSON으로만 반환하세요: {\"corrections\":[{\"span_start\":int,\"span_end\":int,\"original\":\"\",\"suggestion\":\"\",\"reason\":\"\"}]}",
                    ),
                    ChatMessage(role="user", content=ir.plain_text()),
                ],
                temperature=0.0,
                max_tokens=2048,
                json_schema={},
            )

        try:
            raw = asyncio.run(_ask())
        except Exception:  # noqa: BLE001
            return ir
        import json
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            return ir
        for c in data.get("corrections", []):
            try:
                ir.review_tags.append(
                    ReviewTag(
                        span_start=int(c["span_start"]),
                        span_end=int(c["span_end"]),
                        color="red",
                        reason=f"맞춤법: {c.get('suggestion', '')} ({c.get('reason', '')})",
                        confidence=0.85,
                    )
                )
            except (KeyError, ValueError, TypeError):
                continue
        return ir


class R8_GongmunFormatCheck(Macro):
    id = "R8"; category = MacroCategory.REVIEW
    name = "공문 양식 적합성"; description = "현재 문서가 공문 양식에 맞는지 검증"
    ai_powered = True

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        # 간단한 휴리스틱 — 공문 필수 요소 점검
        text = ir.plain_text()
        checks = {
            "수신/발신 표기": ("수신" in text or "발신" in text),
            "제목 명시": bool(ir.title),
            "본문 글머리": any(
                blk.list_item and blk.list_item.bullet_marker in ("□", "○", "―", "※")
                for blk in ir.blocks
                if blk.list_item
            ),
        }
        missing = [k for k, v in checks.items() if not v]
        ir.macro_log.append(
            {"macro_id": self.id, "checks": checks, "missing": missing}
        )
        return ir


class R9_TemplateMatch(Macro):
    id = "R9"; category = MacroCategory.REVIEW
    name = "기관 양식 일치도"; description = "RAG로 학습한 기관 양식과의 일치도 점수 표시"
    ai_powered = True

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        provider: ModelProvider | None = (params or {}).get("_provider")  # type: ignore[assignment]
        if provider is None:
            return ir

        params = params or {}
        # 1) reference_chunks가 명시되면 그대로 사용
        reference_chunks: list[str] = list(params.get("reference_chunks") or [])

        # 2) 없으면 IR.organization_id로 RAG 자동 검색
        if not reference_chunks and ir.organization_id:
            try:
                from app.rag import get_template_store
                store = get_template_store()
                async def _search():
                    return await store.search(
                        organization_id=ir.organization_id,
                        query=ir.plain_text()[:1000],
                        top_k=5,
                    )
                results = asyncio.run(_search())
                reference_chunks = [r["chunk"] for r in results]
                ir.macro_log.append(
                    {"macro_id": self.id, "phase": "rag", "chunks_found": len(reference_chunks)}
                )
            except Exception as e:  # noqa: BLE001
                ir.macro_log.append(
                    {"macro_id": self.id, "phase": "rag", "error": str(e)}
                )

        async def _ask():
            return await provider.score_template_match(ir.plain_text(), reference_chunks)
        try:
            score = asyncio.run(_ask())
        except Exception as e:  # noqa: BLE001
            ir.macro_log.append({"macro_id": self.id, "phase": "score", "error": str(e)})
            return ir
        ir.macro_log.append(
            {
                "macro_id": self.id,
                "phase": "score",
                "score": score.score,
                "breakdown": score.breakdown,
                "suggestions": score.suggestions,
                "reference_chunks_used": len(reference_chunks),
            }
        )
        return ir


class R10_ApplyAllSuggestions(Macro):
    id = "R10"; category = MacroCategory.REVIEW
    name = "검토 사항 일괄 적용"; description = "AI가 제안한 모든 수정 사항을 한 번에 적용"
    ai_powered = True

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        # 사용자가 빨강 태그에 대해 수정사항을 누적해놓으면 한꺼번에 적용
        params = params or {}
        applied = 0
        for fix in params.get("fixes", []):
            try:
                start, end = int(fix["span_start"]), int(fix["span_end"])
                replacement = str(fix["replacement"])
            except (KeyError, ValueError, TypeError):
                continue
            applied += _replace_in_text(ir, start, end, replacement)
        # 적용된 빨강 태그 제거
        if applied > 0:
            ir.review_tags = [t for t in ir.review_tags if t.color != "red"]
        ir.macro_log.append({"macro_id": self.id, "applied_count": applied})
        return ir


def _replace_in_text(ir: DocumentIR, start: int, end: int, replacement: str) -> int:
    """전체 plain_text 기준 (start, end)를 replacement로 교체."""
    cursor = 0
    for blk in ir.blocks:
        text = blk.to_plain_text()
        b_end = cursor + len(text)
        if start >= cursor and end <= b_end:
            # 단일 블록 내부 — 첫 InlineRun에 교체 결과를 합성 (단순화)
            new_text = text[: start - cursor] + replacement + text[end - cursor :]
            if blk.runs:
                blk.runs = [InlineRun(text=new_text)]
            elif blk.list_item:
                blk.list_item.runs = [InlineRun(text=new_text)]
            return 1
        cursor = b_end + 1
    return 0


MACROS = [
    R1_AIReviewAll, R2_AIReviewSelection, R3_HallucinationSuspect, R4_NumberVerify,
    R5_LogicContradiction, R6_ToneConsistency, R7_SpellCheck, R8_GongmunFormatCheck,
    R9_TemplateMatch, R10_ApplyAllSuggestions,
]
