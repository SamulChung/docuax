"""샘플 라이브러리 API."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.samples import SampleDetail, SampleMeta, get_sample, list_samples

router = APIRouter()


@router.get("/samples", response_model=list[SampleMeta])
async def list_all_samples() -> list[SampleMeta]:
    return list_samples()


@router.get("/samples/{sample_id}", response_model=SampleDetail)
async def get_sample_detail(sample_id: str) -> SampleDetail:
    sample = get_sample(sample_id)
    if not sample:
        raise HTTPException(status_code=404, detail=f"sample not found: {sample_id}")
    return sample
