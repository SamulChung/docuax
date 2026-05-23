"""파이프라인 패키지.

순환 import 회피: __init__에서 runner를 즉시 import하지 않음.
사용자는 `from app.pipeline.runner import ConversionPipeline` 으로 직접 import.
"""
from app.pipeline.ir import (
    Block,
    BlockType,
    DocumentIR,
    InlineRun,
    ListItem,
    PersonaMode,
    Table,
    TableCell,
)

__all__ = [
    "Block",
    "BlockType",
    "DocumentIR",
    "InlineRun",
    "ListItem",
    "PersonaMode",
    "Table",
    "TableCell",
]


def __getattr__(name: str):
    # Lazy import — runner는 macros·providers 의존성 때문에 늦게 로드
    if name == "ConversionPipeline":
        from app.pipeline.runner import ConversionPipeline
        return ConversionPipeline
    if name == "PipelineContext":
        from app.pipeline.runner import PipelineContext
        return PipelineContext
    if name == "PipelineResult":
        from app.pipeline.runner import PipelineResult
        return PipelineResult
    raise AttributeError(f"module 'app.pipeline' has no attribute {name!r}")
