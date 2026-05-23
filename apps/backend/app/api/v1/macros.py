from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.macros.registry import get_macro_registry
from app.pipeline.stages import build_preview_payload
from app.providers.llm import get_llm_provider
from app.schemas import MacroDescriptor, MacroExecuteRequest, MacroExecuteResponse
from app.services.document_cache import get_document_cache

router = APIRouter()


@router.get("/macros", response_model=list[MacroDescriptor])
async def list_macros(category: str | None = None) -> list[MacroDescriptor]:
    reg = get_macro_registry()
    items = reg.all()
    if category:
        items = [m for m in items if m.category.value == category]
    return [MacroDescriptor(**m.metadata()) for m in items]


@router.get("/macros/stats")
async def macro_stats() -> dict[str, int]:
    return get_macro_registry().stats()


@router.post("/macros/execute", response_model=MacroExecuteResponse)
async def execute_macro(req: MacroExecuteRequest) -> MacroExecuteResponse:
    cache = get_document_cache()
    ir = cache.get(req.document_id)
    if ir is None:
        raise HTTPException(status_code=404, detail="document not found in cache — re-run /convert first")

    try:
        macro = get_macro_registry().get(req.macro_id)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e

    # AI 매크로는 provider 주입
    params: dict = {**req.params}
    if macro.ai_powered:
        params["_provider"] = get_llm_provider()

    log_count_before = len(ir.macro_log)
    try:
        ir2 = macro.apply(ir, params)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"macro execution failed: {e}") from e

    cache.set(ir2)

    # 이 매크로가 추가한 macro_log 항목 — 점프 좌표·R9 점수 등이 여기 들어있음
    new_logs = ir2.macro_log[log_count_before:]
    result: dict = {}
    for entry in new_logs:
        # 매크로 ID 일치하는 항목 병합 (R9의 rag+score 두 단계 등 모두 포함)
        if entry.get("macro_id") == macro.id:
            for k, v in entry.items():
                if k != "macro_id":
                    result[k] = v

    return MacroExecuteResponse(
        success=True,
        macro_id=macro.id,
        preview=build_preview_payload(ir2),
        message=f"{macro.name} 적용 완료",
        result=result,
    )
