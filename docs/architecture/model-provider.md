# Model Provider 아키텍처 — 두뇌 갈아끼우기

DocuAX는 **두뇌(TenOS)**와 **팔(DocuAX 변환 엔진)**을 명확히 분리합니다. 이 문서는 그 경계 — `ModelProvider` 인터페이스의 설계와 운영 규칙을 정의합니다.

## 1. 왜 분리하는가

| 시나리오 | 분리되지 않은 경우 | DocuAX 설계 |
|---|---|---|
| TenOS v5 출시 (8위 → 5위) | 변환 엔진 곳곳에서 모델 호출 재작성 | `.env`의 모델 ID만 변경 |
| 신규 페르소나용 sLM 추가 | 새 호출 경로 신설 | `ModelProvider` 1개 등록 |
| 폐쇄망 고객용 로컬 모델 | 별도 빌드 분기 | provider=`tenos`+ base_url 교체 |
| 비상시 OpenAI 폴백 | 즉시 불가 | `LLM_PROVIDER=openai` 1줄 |
| CI/테스트 | 실제 LLM 호출 | `LLM_PROVIDER=mock` |

## 2. 인터페이스 (`apps/backend/app/providers/llm/base.py`)

`ModelProvider`는 다음 6개 메서드를 정의합니다 — DocuAX 파이프라인이 두뇌에게 시키는 일의 전부입니다:

| 메서드 | 용도 | 파이프라인 단계 |
|---|---|---|
| `complete(messages, **opts)` | 일반 생성·요약 | 2 TenOS 분석, R7 맞춤법 |
| `classify_document(text)` | 문서 유형 판별 (공문/보고서/제안서) | 3 양식 매핑 |
| `review_tag(text)` | 빨강(수정)·파랑(핵심)·노랑(숫자) 자동 태깅 | 4 검토 표시 |
| `embed(texts)` | RAG 벡터화 | 기관 양식 학습 |
| `score_template_match(doc, refs)` | 기관 양식 일치도 점수 (R9) | R9 매크로 |
| `health_check()` | 두뇌 가용성 확인 | 운영 모니터링 |

각 메서드는 **결과 타입을 Pydantic 스키마로 고정**합니다. 두뇌가 바뀌어도 팔은 같은 형태의 결과를 받습니다.

## 3. 등록 방식

`apps/backend/app/providers/llm/registry.py`에 단일 `get_llm_provider()` 함수를 둡니다. `LLM_PROVIDER` 환경변수로 분기:

```python
PROVIDERS = {
    "tenos":     TenOSProvider,       # 운영 기본
    "openai":    OpenAIProvider,      # 백업·폴백
    "anthropic": AnthropicProvider,   # 백업
    "mock":      MockProvider,        # 테스트·CI
}
```

새 모델 추가 = `ModelProvider` 서브클래스 1개 + 레지스트리 1줄.

## 4. 폴백 체인 (Failover)

운영 환경에서는 단일 provider가 아니라 **체인**으로 묶을 수 있습니다:

```env
LLM_PROVIDER=chain
LLM_CHAIN=tenos,openai,mock
```

`ChainProvider`는 앞에서부터 시도하다가 `ProviderUnavailable` 예외가 나면 다음으로 넘어갑니다. 한국 회사가 폐쇄망에서 TenOS만 쓰는 경우엔 `LLM_PROVIDER=tenos` 단일로, 클라우드 SaaS에서 가용성이 중요한 경우엔 체인을 씁니다.

## 5. 모델 버전 추적

`ConversionRun` 테이블의 `model_version` 필드에 매 변환마다 `provider:model:hash`를 기록합니다 (예: `tenos:TenOS-Ko-28B:sha256:abc...`). 출시 후 모델 업그레이드 시 A/B 비교의 기반이 됩니다.

## 6. 모델 교체 체크리스트

운영 중 TenOS를 새 버전으로 올릴 때:

1. **새 vLLM 인스턴스 기동** (별도 endpoint)
2. **shadow traffic** — `LLM_PROVIDER=chain`, `LLM_CHAIN=tenos_v5_shadow,tenos_v4` 로 일정 비율 mirroring
3. **결과 비교** — `ConversionRun`의 `review_tags`·`latency_ms` 비교
4. **점진적 전환** — shadow → primary
5. **롤백 준비** — 이전 endpoint를 48시간 유지

모든 단계가 코드 수정 없이 환경변수·라우팅 설정만으로 가능합니다.

## 7. 보안·On-premise

폐쇄망 고객은 `LLM_PROVIDER=tenos` + `TENOS_BASE_URL=http://localhost:8001/v1` 으로 외부 API 호출이 0건임이 코드 레벨에서 보장됩니다 (`openai`/`anthropic` provider 모듈은 import만 되고 실행되지 않음).
