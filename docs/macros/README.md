# 매크로 100종 풀셋 — 구현 안내

PRD 4장 명세를 1:1 매핑한 100종 매크로의 구현 가이드입니다.

## 카테고리 구조

| 카테고리 | 코드 | 개수 | 파일 |
|---|---|---:|---|
| 표 매크로 | T1~T25 | 25 | [`table.py`](../../apps/backend/app/macros/categories/table.py) |
| 표세부 매크로 | S1~S15 | 15 | [`table_detail.py`](../../apps/backend/app/macros/categories/table_detail.py) |
| 블록 매크로 | B1~B20 | 20 | [`block.py`](../../apps/backend/app/macros/categories/block.py) |
| 글자 매크로 | G1~G15 | 15 | [`glyph.py`](../../apps/backend/app/macros/categories/glyph.py) |
| 이동 매크로 | N1~N10 | 10 | [`navigate.py`](../../apps/backend/app/macros/categories/navigate.py) |
| 검토 매크로 | R1~R10 | 10 | [`review.py`](../../apps/backend/app/macros/categories/review.py) |
| 편리 매크로 | P1~P5 | 5 | [`convenience.py`](../../apps/backend/app/macros/categories/convenience.py) |

## 공통 인터페이스

모든 매크로는 [`Macro`](../../apps/backend/app/macros/base.py) 베이스를 상속하고 `apply(ir, params)` 한 메서드만 구현하면 됩니다. 메타데이터는 클래스 변수로 선언:

```python
class T1_BasicTable(Macro):
    id = "T1"
    category = MacroCategory.TABLE
    name = "표 생성 (기본)"
    description = "..."
    ai_powered = False
    auto = False  # True면 변환 시 자동 실행
    shortcut = {"win": "Ctrl+N,T", "mac": "⌘+N,T"}

    def apply(self, ir, params=None, **_):
        # IR을 받아서 변형, 반환
        return ir
```

## 매크로 추가 절차

1. 해당 카테고리 파일에 클래스 작성
2. 파일 하단 `MACROS = [...]` 리스트에 클래스 추가
3. 테스트: `pytest apps/backend/tests/test_macros_count.py`
4. 프론트엔드는 자동 반영 (백엔드 `/api/v1/macros` 호출)

## AI 강화 매크로 (35종)

`ai_powered=True` 표시 매크로는 `params["_provider"]`로 LLM provider를 주입받습니다:

```python
async def apply(self, ir, params=None, **_):
    provider = params.get("_provider")
    if provider:
        tags = await provider.review_tag(ir.plain_text())
        ir.review_tags = tags.tags
    return ir
```

provider 호출은 ModelProvider 추상화 위에서 일어나므로 TenOS·OpenAI·Anthropic 어느 것이든 매크로 코드 변경 없이 동작합니다.

## 자동 매크로 (변환 파이프라인 단계 5)

`auto=True` 표시 매크로들은 매 변환 후 자동 적용:

- **T5 셀 너비 균등** — 모든 표
- **T16 테두리 일괄** — 표준 테두리
- **S12 숫자 자동 우측 정렬** — 숫자 셀
- **S13 머리행 자동 강조** — 첫 행 헤더화
- **B20 단락 자동 정리** — 빈 단락·공백 정규화

추가하려면 클래스 변수에 `auto = True` 만 명시.
