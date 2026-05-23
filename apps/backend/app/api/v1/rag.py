from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.rag import get_template_store
from app.schemas import TemplateIndexRequest, TemplateIndexResponse

router = APIRouter()


@router.post("/rag/index", response_model=TemplateIndexResponse)
async def index_template(req: TemplateIndexRequest) -> TemplateIndexResponse:
    store = get_template_store()
    try:
        n = await store.index_document(
            organization_id=req.organization_id,
            document_id=req.document_id,
            title=req.title,
            content=req.content,
            metadata=req.metadata,
        )
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"index failed: {e}") from e
    return TemplateIndexResponse(
        organization_id=req.organization_id,
        chunks_indexed=n,
        total_chunks_in_org=store.count(req.organization_id),
    )


@router.get("/rag/search")
async def search_template(organization_id: str, query: str, top_k: int = 5) -> dict:
    store = get_template_store()
    results = await store.search(organization_id=organization_id, query=query, top_k=top_k)
    return {"organization_id": organization_id, "query": query, "results": results}
