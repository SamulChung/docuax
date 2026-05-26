from fastapi import APIRouter

from app.api.v1 import (
    admin, auth, billing, chat, compliance, convert, edit, health, macros,
    me_api_keys, metrics, organizations, prompts, providers, rag, render,
    samples, settings, slides, uploads,
)

api_router = APIRouter(prefix="/v1")
api_router.include_router(health.router, tags=["health"])
api_router.include_router(admin.router, tags=["admin"])
api_router.include_router(auth.router, tags=["auth"])
api_router.include_router(billing.router, tags=["billing"])
api_router.include_router(chat.router, tags=["chat"])
api_router.include_router(compliance.router, tags=["compliance"])
api_router.include_router(convert.router, tags=["convert"])
api_router.include_router(edit.router, tags=["edit"])
api_router.include_router(macros.router, tags=["macros"])
api_router.include_router(me_api_keys.router, tags=["me"])
api_router.include_router(metrics.router, tags=["metrics"])
api_router.include_router(organizations.router, tags=["organizations"])
api_router.include_router(prompts.router, tags=["prompts"])
api_router.include_router(providers.router, tags=["providers"])
api_router.include_router(render.router, tags=["render"])
api_router.include_router(rag.router, tags=["rag"])
api_router.include_router(samples.router, tags=["samples"])
api_router.include_router(settings.router, tags=["settings"])
api_router.include_router(slides.router, tags=["slides"])
api_router.include_router(uploads.router, tags=["uploads"])

__all__ = ["api_router"]
