"""LLM provider 레지스트리 — 두뇌 교체의 단일 진입점.

DocuAX 코드 어디에서도 `TenOSProvider()`를 직접 인스턴스화하지 않는다.
모두 `get_llm_provider()`를 거치며, `LLM_PROVIDER` 환경변수로 결정된다.

새 모델 추가 절차:
1. `app/providers/llm/<new_provider>.py`에 ModelProvider 서브클래스 작성
2. 아래 PROVIDERS 딕셔너리에 한 줄 등록
3. `.env`의 `LLM_PROVIDER=<new>` 변경 — 코드 수정 0줄
"""
from __future__ import annotations

from functools import lru_cache

from app.core.config import Settings, get_settings
from app.core.logging import get_logger
from app.providers.llm.anthropic_provider import AnthropicProvider
from app.providers.llm.base import ModelProvider, ProviderConfigError
from app.providers.llm.chain import ChainProvider
from app.providers.llm.mock import MockProvider
from app.providers.llm.openai_provider import OpenAIProvider
from app.providers.llm.tenos import TenOSProvider
from app.providers.llm.tenos_hf import TenOSHFProvider

log = get_logger(__name__)


# provider 이름 → 빌더 함수
_BUILDERS: dict[str, type] = {
    "tenos": TenOSProvider,
    "tenos_hf": TenOSHFProvider,
    "openai": OpenAIProvider,
    "anthropic": AnthropicProvider,
    "mock": MockProvider,
}


def _build_single(name: str, settings: Settings) -> ModelProvider:
    cls = _BUILDERS.get(name)
    if cls is None:
        raise ProviderConfigError(f"알 수 없는 LLM provider: {name}")
    return cls.from_settings(settings)  # type: ignore[attr-defined]


@lru_cache
def get_llm_provider() -> ModelProvider:
    """현재 설정에 맞는 provider 반환. 프로세스 수명 동안 캐시.

    LLM_PROVIDER=mock(기본)이어도 API 키가 있으면 자동으로 해당 프로바이더로 전환.
    우선순위: anthropic → openai → mock
    """
    settings = get_settings()
    choice = settings.llm_provider

    # mock이 기본값인데 실제 키가 있으면 자동 전환
    if choice == "mock":
        if settings.anthropic_api_key:
            log.info("LLM_PROVIDER=mock 이지만 ANTHROPIC_API_KEY 감지 → anthropic 자동 전환")
            choice = "anthropic"
        elif settings.openai_api_key:
            log.info("LLM_PROVIDER=mock 이지만 OPENAI_API_KEY 감지 → openai 자동 전환")
            choice = "openai"

    if choice == "chain":
        providers: list[ModelProvider] = []
        for name in settings.llm_chain_list:
            try:
                providers.append(_build_single(name, settings))
            except ProviderConfigError as e:
                log.warning("chain 체인에서 provider 제외", provider=name, reason=str(e))
        if not providers:
            log.error("chain에 가용 provider 없음 — mock으로 폴백")
            providers = [MockProvider()]
        provider: ModelProvider = ChainProvider(providers)
    else:
        try:
            provider = _build_single(choice, settings)
        except ProviderConfigError as e:
            log.error("LLM provider 초기화 실패 — mock 폴백", choice=choice, reason=str(e))
            provider = MockProvider()

    log.info("LLM provider 초기화 완료", provider=provider.name, model_id=provider.model_id)
    return provider


def reset_provider_cache() -> None:
    """테스트·핫리로드용 — 설정 변경 후 캐시 무효화."""
    get_llm_provider.cache_clear()
