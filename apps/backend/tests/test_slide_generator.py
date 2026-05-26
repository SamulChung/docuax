"""slide_generator 서비스 단위 테스트."""
import json
import os

import pytest

os.environ.setdefault("LLM_PROVIDER", "mock")


@pytest.fixture
def mock_provider(mocker):
    """LLM provider를 목으로 교체."""
    sample_schema = {
        "id": "test-id",
        "title": "테스트 슬라이드",
        "theme": "gov",
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
                        "top": 60,
                        "width": 1120,
                        "height": 80,
                        "text": "제목",
                        "fontSize": 32,
                        "fontWeight": "bold",
                        "fill": "#1e3a5f",
                        "src": None,
                    }
                ],
            }
        ],
    }
    provider = mocker.MagicMock()
    provider.complete = mocker.AsyncMock(return_value=json.dumps(sample_schema))
    mocker.patch(
        "app.services.slide_generator.get_llm_provider", return_value=provider
    )
    return provider, sample_schema


@pytest.mark.asyncio
async def test_generate_from_document(mock_provider):
    provider, expected = mock_provider
    from app.services.slide_generator import generate_slides

    result = await generate_slides(
        mode="document",
        document_text="보고서 내용입니다.",
        instruction="3장으로 만들어줘",
        theme="gov",
        custom_theme=None,
        analysis_text=None,
    )
    assert result["title"] == "테스트 슬라이드"
    assert len(result["slides"]) == 1
    assert result["slides"][0]["elements"][0]["type"] == "textbox"
    provider.complete.assert_awaited_once()


@pytest.mark.asyncio
async def test_generate_from_analysis(mock_provider):
    provider, _ = mock_provider
    from app.services.slide_generator import generate_slides

    result = await generate_slides(
        mode="analysis",
        document_text=None,
        instruction=None,
        theme="corp",
        custom_theme=None,
        analysis_text="역할: 갑, 을\n관계: 계약\n목표: 납품",
    )
    assert "slides" in result
    provider.complete.assert_awaited_once()


@pytest.mark.asyncio
async def test_generate_returns_valid_schema_keys(mock_provider):
    from app.services.slide_generator import generate_slides

    result = await generate_slides(
        mode="document",
        document_text="테스트",
        instruction="슬라이드",
        theme="minimal",
        custom_theme=None,
        analysis_text=None,
    )
    assert "id" in result
    assert "slides" in result
    assert isinstance(result["slides"], list)
    for slide in result["slides"]:
        assert "elements" in slide
        for el in slide["elements"]:
            assert "type" in el
            assert "left" in el
            assert "top" in el


@pytest.mark.asyncio
async def test_generate_returns_fallback_on_invalid_json(mocker):
    """LLM이 invalid JSON을 반환하면 fallback 스키마를 반환해야 한다."""
    provider = mocker.MagicMock()
    provider.complete = mocker.AsyncMock(return_value="this is not json at all")
    mocker.patch(
        "app.services.slide_generator.get_llm_provider", return_value=provider
    )
    from app.services.slide_generator import generate_slides

    result = await generate_slides(
        mode="document",
        document_text="테스트",
        instruction="슬라이드",
        theme="minimal",
        custom_theme=None,
        analysis_text=None,
    )
    assert "id" in result
    assert "slides" in result
    assert len(result["slides"]) >= 1


@pytest.mark.asyncio
async def test_generate_returns_fallback_on_provider_error(mocker):
    """LLM 호출 실패 시 fallback 스키마를 반환해야 한다."""
    provider = mocker.MagicMock()
    provider.complete = mocker.AsyncMock(side_effect=Exception("provider unavailable"))
    mocker.patch(
        "app.services.slide_generator.get_llm_provider", return_value=provider
    )
    from app.services.slide_generator import generate_slides

    result = await generate_slides(
        mode="document",
        document_text="테스트",
        instruction="슬라이드",
        theme="gov",
        custom_theme=None,
        analysis_text=None,
    )
    assert "id" in result
    assert "slides" in result
