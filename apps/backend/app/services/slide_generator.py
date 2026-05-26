"""슬라이드 생성 서비스 — Claude를 호출해 SlideSchema JSON 반환."""
from __future__ import annotations

import json
import uuid
from typing import Any

from app.core.logging import get_logger
from app.providers.llm import ChatMessage, get_llm_provider

log = get_logger(__name__)

CANVAS_W = 1280
CANVAS_H = 720

_SYSTEM_PROMPT = """
당신은 프레젠테이션 슬라이드를 JSON으로 생성하는 전문가입니다.
아래 SlideSchema 형식을 엄격히 따르십시오.
캔버스 크기는 1280×720 픽셀입니다.
모든 좌표(left, top, width, height)는 픽셀 정수값입니다.

SlideSchema 형식:
{
  "id": "<uuid hex string>",
  "title": "<슬라이드 제목>",
  "theme": "<gov|corp|minimal|gradient|custom>",
  "customTheme": null,
  "slides": [
    {
      "id": "slide-0",
      "background": "<hex color>",
      "elements": [
        {
          "id": "el-0",
          "type": "<textbox|rect|circle|line|image>",
          "left": <int>,
          "top": <int>,
          "width": <int>,
          "height": <int>,
          "text": "<string or null>",
          "fontSize": <int or null>,
          "fontWeight": "<normal|bold|null>",
          "fill": "<hex color or null>",
          "src": "<image url or null>"
        }
      ]
    }
  ]
}

JSON만 반환하십시오. 마크다운 코드블록 없이 순수 JSON.
""".strip()

_ANALYSIS_MAPPING = """
역관목조분 구조를 슬라이드로 변환하는 규칙:
- 역할(役割) → 첫 슬라이드: 관계자 소개
- 관계(關係) → 두 번째 슬라이드: rect + line 도형으로 관계 다이어그램
- 목표(目標) → 세 번째 슬라이드: 불릿 텍스트박스 목록
- 조건(條件) → 네 번째 슬라이드: 조건/요건 텍스트
- 분쟁(紛爭) → 다섯 번째 슬라이드: 쟁점 항목 리스트
없는 항목은 슬라이드 생략.
""".strip()


async def generate_slides(
    *,
    mode: str,
    document_text: str | None,
    instruction: str | None,
    theme: str,
    custom_theme: dict[str, Any] | None,
    analysis_text: str | None,
) -> dict[str, Any]:
    """Claude를 호출해 SlideSchema JSON dict를 반환한다."""
    provider = get_llm_provider()

    if mode == "document" and not document_text:
        raise ValueError("document_text는 document 모드에서 필수입니다")
    if mode == "analysis" and not analysis_text:
        raise ValueError("analysis_text는 analysis 모드에서 필수입니다")

    if mode == "analysis":
        user_content = (
            f"{_ANALYSIS_MAPPING}\n\n"
            f"아래 역관목조분 분석 결과를 슬라이드로 변환하십시오:\n\n{analysis_text}"
        )
    else:
        user_content = (
            f"아래 문서를 읽고 지시어에 따라 슬라이드를 생성하십시오.\n\n"
            f"## 문서\n{document_text}\n\n"
            f"## 지시어\n{instruction}\n\n"
            f"테마: {theme}"
        )

    messages: list[ChatMessage] = [
        ChatMessage(role="system", content=_SYSTEM_PROMPT),
        ChatMessage(role="user", content=user_content),
    ]

    try:
        raw = await provider.complete(messages, temperature=0.3, max_tokens=4096)  # Lower temperature → deterministic JSON structure
    except Exception as e:
        log.warning("슬라이드 생성 LLM 호출 실패, fallback 반환", error=str(e))
        return _fallback_schema(theme)

    try:
        schema: dict[str, Any] = json.loads(raw)
    except json.JSONDecodeError:
        # JSON 파싱 실패 시 { ... } 블록 추출 시도
        import re
        # Find the outermost JSON object by locating the first '{' and matching brace
        match = re.search(r"\{", raw)
        if match:
            start = match.start()
            depth = 0
            end = start
            for i, ch in enumerate(raw[start:], start):
                if ch == "{":
                    depth += 1
                elif ch == "}":
                    depth -= 1
                    if depth == 0:
                        end = i + 1
                        break
            try:
                schema = json.loads(raw[start:end])
            except json.JSONDecodeError:
                log.warning("슬라이드 JSON 추출 실패, fallback 반환", raw_snippet=raw[:100])
                schema = _fallback_schema(theme)
        else:
            log.warning("슬라이드 JSON 파싱 실패, fallback 스키마 반환")
            schema = _fallback_schema(theme)

    # id 보장
    if not schema.get("id"):
        schema["id"] = uuid.uuid4().hex

    return schema


def _fallback_schema(theme: str) -> dict[str, Any]:
    """파싱 실패 시 반환하는 최소 스키마."""
    return {
        "id": uuid.uuid4().hex,
        "title": "슬라이드",
        "theme": theme,
        "customTheme": None,
        "slides": [
            {
                "id": "slide-0",
                "background": "#ffffff",
                "elements": [
                    {
                        "id": "el-0",
                        "type": "textbox",
                        "left": 80,
                        "top": 280,
                        "width": 1120,
                        "height": 80,
                        "text": "슬라이드 생성 중 오류가 발생했습니다. 다시 시도해 주세요.",
                        "fontSize": 24,
                        "fontWeight": "normal",
                        "fill": "#374151",
                        "src": None,
                    }
                ],
            }
        ],
    }
