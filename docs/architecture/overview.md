# DocuAX 아키텍처 개요

## 3계층 구조 (PRD 3.1)

```
┌─────────────────────────────────────────────────────────────────────┐
│  상층 — 차별화 (자체 개발 IP)                                          │
│  ───────────────────────────────────────────────                     │
│  ▸ TenOS-Ko-28B (또는 후속·교체 모델)  ← ModelProvider 인터페이스      │
│  ▸ Converter Engine (7단계 파이프라인)                                │
│  ▸ 리모컨 UI (5탭 + 모드 토글)                                        │
│  ▸ AI 검토 시스템 (빨강·파랑·노랑)                                    │
├─────────────────────────────────────────────────────────────────────┤
│  중층 — 데이터·인프라                                                 │
│  ───────────────────────────────────────────────                     │
│  ▸ RAG (ChromaDB + 한국어 임베딩)                                    │
│  ▸ vLLM 서빙 (OpenAI 호환 endpoint)                                  │
│  ▸ On-premise 단일 도커                                              │
├─────────────────────────────────────────────────────────────────────┤
│  하층 — 기본기능 (표준 도구 통합. 자체 구현 X)                          │
│  ───────────────────────────────────────────────                     │
│  ▸ python-docx (DOCX)                                                │
│  ▸ python-hwpx + LibreOffice (HWPX)                                  │
│  ▸ WeasyPrint (PDF)                                                  │
│  ▸ SQLAlchemy + Postgres/SQLite                                      │
│  ▸ FastAPI + Next.js                                                 │
└─────────────────────────────────────────────────────────────────────┘
```

## 변환 파이프라인 (7단계, PRD 3.2)

```
사용자 마크다운
      │
      ▼
[1] 입력 파싱 ────────────────► markdown-it-py → DocumentIR
      │
      ▼
[2] TenOS 분석 ──────────────► ModelProvider.classify_document()
      │                          → 공문/보고서/제안서/메모/회의록/일반
      ▼
[3] 양식 매핑 ──────────────► # → □  ## → ○  ### → ―  #### → ※
      │                          + 한컴 표준 폰트 크기·글꼴
      ▼
[4] 검토 표시 ──────────────► ModelProvider.review_tag()
      │                          → 빨강·파랑·노랑 자동 태그
      ▼
[5] 매크로 자동 적용 ─────────► auto=True 매크로 일괄 실행
      │                          (T5 셀너비균등, T16 테두리, S12 숫자정렬,
      │                           S13 머리행강조, B20 단락정리)
      ▼
[6] 포맷 직렬화 ────────────► /render API에서 호출
      │                          DocxRenderer / HwpxRenderer / PdfRenderer
      ▼
[7] 미리보기 페이로드 ────────► 프론트엔드 JSON (블록별 텍스트+태그)
      │
      ▼
   리모컨 UI
```

목표 성능: P50 3초, P95 5초 (1~3페이지).

## 두뇌-팔 분리의 의미

DocuAX 코드 안에서 LLM을 직접 호출하는 곳은 **0개**입니다. 모든 LLM 호출은 `ModelProvider` 인터페이스를 거칩니다. 이로 인해:

| 시나리오 | 영향받는 코드 |
|---|---|
| TenOS v4 → v5 업그레이드 | `.env` 1줄 |
| OpenAI 비상 폴백 | `.env` 1줄 (`LLM_PROVIDER=chain`) |
| 신규 sLM 추가 (Llama, Mistral) | 새 `ModelProvider` 서브클래스 1개 + 레지스트리 1줄 |
| 폐쇄망 배포 (외부 API 차단) | `.env` 1줄 (`ON_PREMISE=true`) |
| 임베딩 모델 교체 | `.env` 1줄 (`EMBEDDING_PROVIDER`) |

자세한 교체 절차는 [`../models/swap-guide.md`](../models/swap-guide.md) 참조.

## 데이터 모델 (PRD 6.1)

7개 엔티티 — User, Organization, Document, ConversionRun, MacroLog, MacroPreference, LearnedTemplate.

`ConversionRun.model_version` 필드가 모델 추적의 핵심:
```
provider:model:hash  (예: "tenos:TenOS-Ko-28B:..." 또는 "openai:gpt-4o:...")
```

이 필드 덕에 출시 후 모델 업그레이드 시 A/B 비교 데이터를 즉시 얻을 수 있습니다.

## Lock-in 메커니즘 (PRD 6.4)

출시 시점부터 가동되는 4가지 데이터 누적:

1. **기관 양식 학습** — `rag/store.py`의 ChromaDB 컬렉션 (org-{id})
2. **매크로 사용 학습** — `MacroPreference` 테이블 (usage_count·custom_shortcut)
3. **검토 패턴 학습** — `ConversionRun.review_tags`에서 사용자 처리 이력 추출
4. **단축키 학습** — `MacroPreference.custom_shortcut`

각 축이 시간이 갈수록 누적되어, 6개월 사용 시 다른 도구로 이전하는 비용이 매우 커집니다.

## 페르소나 A·B 동시 만족 (PRD 2.3)

- **공유 자산**: TenOS·매크로 100종·기관 양식 학습·검토 표시 시스템
- **분기 자산**: 단축키 매핑, 리모컨 탭 기본 노출, 매크로 추천 순서
- **모드 전환**: `PersonaMode` enum + 상단 토글 (`Ctrl+Shift+M`)

리모컨 5탭 — 변환·표·글자·이동·출력. 모드에 따라 같은 매크로 풀에서 다른 우선순위로 노출.
