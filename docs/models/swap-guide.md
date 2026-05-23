# 모델 교체 가이드 — 두뇌 갈아끼우기

DocuAX의 두뇌는 환경변수 하나로 교체 가능합니다. 이 문서는 4가지 시나리오의 정확한 방법입니다.

## 1. TenOS 새 버전으로 업그레이드 (가장 흔한 경우)

TenOS v5가 출시됐다고 가정. 운영 영향 없이 점진적 전환:

```bash
# 1) 새 vLLM 인스턴스를 별도 포트로 기동 (기존은 그대로)
vllm serve honey90/TenOS-Ko-28B-v5 --port 8002

# 2) shadow 트래픽으로 검증 — 폴백 체인 사용
# .env
LLM_PROVIDER=chain
LLM_CHAIN=tenos
TENOS_BASE_URL=http://localhost:8002/v1
TENOS_MODEL=honey90/TenOS-Ko-28B-v5

# 3) ConversionRun 테이블에서 model_version 비교
# - latency_ms · review_tags 변화 모니터
# - 일정 비율 사용자에만 노출 (라우터에서)

# 4) 안정 확인 후 모든 트래픽 전환 — base URL만 교체
```

코드 수정 0줄. 컨테이너 재시작 1회.

## 2. 폐쇄망 고객용 — 외부 API 0건 보장

```env
ON_PREMISE=true
LLM_PROVIDER=tenos
TENOS_BASE_URL=http://internal-vllm:8001/v1
EMBEDDING_PROVIDER=local
```

`ON_PREMISE=true`면 `OpenAIProvider`·`AnthropicProvider`는 `from_settings()`에서 `ProviderConfigError`를 던집니다. 코드 레벨에서 외부 API 차단이 보장됩니다.

레지스트리에 `mock` 폴백이 있긴 하지만, 운영에서는 `tenos` 가용성을 모니터링하고 다운되면 사용자에게 명시적 에러를 띄우는 게 옳습니다.

## 3. 비상시 OpenAI 폴백

TenOS vLLM이 다운된 비상 상황:

```env
LLM_PROVIDER=chain
LLM_CHAIN=tenos,openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

`ChainProvider`가 TenOS의 `ProviderUnavailable` 예외를 잡으면 자동으로 OpenAI로 폴백합니다. 사용자는 변환이 멈추지 않음. 단, `ConversionRun.model_version`에 `openai:gpt-4o-mini`로 기록되어 어떤 변환이 폴백된 것인지 추적됩니다.

## 4. 완전히 새로운 모델 종류 — 예: 로컬 Llama

`apps/backend/app/providers/llm/llama_local.py` 를 만들고:

```python
from app.providers.llm.base import ModelProvider, ChatMessage, ...

class LlamaLocalProvider(ModelProvider):
    name = "llama_local"

    @property
    def model_id(self) -> str:
        return f"llama_local:{self._path}"

    @classmethod
    def from_settings(cls, settings):
        return cls(path=settings.llama_local_path)

    async def complete(self, messages, **opts):
        # llama-cpp-python 또는 transformers 호출
        ...

    async def classify_document(self, text):
        ...

    # 그 외 메서드들
```

그리고 `registry.py`의 `_BUILDERS`에 한 줄 추가:

```python
_BUILDERS = {
    "tenos": TenOSProvider,
    "openai": OpenAIProvider,
    "anthropic": AnthropicProvider,
    "mock": MockProvider,
    "llama_local": LlamaLocalProvider,  # 추가
}
```

`.env`에서 `LLM_PROVIDER=llama_local`. 끝. DocuAX 파이프라인·매크로·UI 어디도 수정 안 합니다.

## 5. 임베딩도 동일한 패턴

`EmbeddingProvider` (`apps/backend/app/providers/embeddings/base.py`)도 같은 방식. 한국어 ko-sroberta (로컬) vs OpenAI text-embedding-3 vs 자체 TenOS 임베딩 — `EMBEDDING_PROVIDER` 환경변수로 전환.

## 6. A/B 테스트 — 두 모델 동시 비교

`ChainProvider`는 폴백용. A/B 비교는 라우팅 미들웨어로 합니다 (별도 구현):

```python
# 예: 사용자 ID 짝수 → TenOS, 홀수 → TenOS v5
@router.middleware("http")
async def ab_router(request, call_next):
    user_hash = hash(request.headers.get("X-User-Id", "")) % 100
    if user_hash < 10:  # 10% shadow
        request.state.llm_provider_override = "tenos_v5_shadow"
    return await call_next(request)
```

그리고 `get_llm_provider()`가 `request.state`를 보도록 약간 확장. 이 정도는 명시적 구현이 필요 — 함부로 추상화하지 않음.

## 7. 모델 변경 후 점검 항목

| 항목 | 확인 방법 |
|---|---|
| API 응답 형식 | `/api/v1/health` — `llm.available=true` |
| 검토 태그 정확도 | `ConversionRun.review_tags`의 빨강·파랑·노랑 카운트 분포 |
| 양식 분류 정확도 | `Document.document_class` 분포 |
| 지연시간 회귀 | `ConversionRun.latency_ms` P50/P95 |
| 비용 | provider별 토큰 청구액 |

각 메트릭은 Grafana 등으로 시각화 (배포 단계에서 추가).
