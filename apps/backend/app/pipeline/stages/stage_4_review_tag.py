"""단계 4 — 검토 표시 부여.

provider.review_tag()로 빨강·파랑·노랑 태그를 받아서 ir.review_tags에 저장.
태그의 span_start/end는 전체 plain_text 기준 — 프론트엔드에서 블록 매핑.

중복 제거:
- 동일 (color, span_start, span_end) → 1개로 dedup
- 동색 인접 영역(공백 1자 이하 떨어짐) → 하나로 병합
- 동일 텍스트가 같은 위치에 여러 마커로 박힌 경우 우선 reason 유지
"""
from __future__ import annotations

from app.providers.llm.base import ReviewTag

from app.pipeline.ir import DocumentIR
from app.providers.llm import ModelProvider


def _dedup_tags(tags: list[ReviewTag]) -> list[ReviewTag]:
    """검토 태그 중복·오버랩 정리.

    1) 완전 중복 (color·start·end 동일) 제거
    2) 같은 색상의 인접·중첩 태그 merge (gap ≤ 1자)
    3) start ASC 정렬
    """
    if not tags:
        return tags

    # 1) 완전 중복 제거
    seen: set[tuple[str, int, int]] = set()
    uniq: list[ReviewTag] = []
    for t in tags:
        key = (t.color, t.span_start, t.span_end)
        if key in seen:
            continue
        seen.add(key)
        uniq.append(t)

    # 2) 같은 색끼리 정렬 + 인접/중첩 병합
    by_color: dict[str, list[ReviewTag]] = {}
    for t in uniq:
        by_color.setdefault(t.color, []).append(t)

    merged: list[ReviewTag] = []
    for color, items in by_color.items():
        items.sort(key=lambda x: (x.span_start, x.span_end))
        cur: ReviewTag | None = None
        for t in items:
            if cur is None:
                cur = t
                continue
            # 중첩 또는 1자 이내 인접 → 병합
            if t.span_start <= cur.span_end + 1:
                # end 만 늘리고, reason 은 첫 태그 유지 (가장 길게 합쳐진 의미만)
                if t.span_end > cur.span_end:
                    cur = ReviewTag(
                        color=cur.color,
                        span_start=cur.span_start,
                        span_end=t.span_end,
                        reason=cur.reason or t.reason,
                        confidence=max(cur.confidence, t.confidence),
                    )
            else:
                merged.append(cur)
                cur = t
        if cur is not None:
            merged.append(cur)

    # 3) 전체 start 오름차순
    merged.sort(key=lambda x: x.span_start)
    return merged


async def apply_review_tags(ir: DocumentIR, provider: ModelProvider) -> DocumentIR:
    text = ir.plain_text()
    if not text.strip():
        return ir
    tags = await provider.review_tag(text)
    ir.review_tags = _dedup_tags(tags.tags)
    # 추적용: 어느 모델이 태깅했는지
    ir.model_version = tags.model_version or provider.model_id
    return ir
