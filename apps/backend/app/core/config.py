"""환경 설정 — pydantic-settings 기반.

모든 설정은 환경변수 또는 `.env`에서 로드. provider 분기 등 운영 의존성은 여기에 집중.
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── App ──
    app_env: Literal["development", "staging", "production"] = "development"
    app_debug: bool = True
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    app_secret_key: str = "change-me"

    # ── DB ──
    database_url: str = "sqlite+aiosqlite:///./docuax.db"

    # ── LLM Provider ──
    # 단일 provider 또는 "chain" 으로 여러 개를 묶음
    llm_provider: Literal["tenos", "tenos_hf", "openai", "anthropic", "mock", "chain"] = "mock"
    llm_chain: str = "tenos,openai"  # chain일 때 폴백 순서

    tenos_base_url: str = "http://localhost:8001/v1"
    tenos_model: str = "honey90/TenOS-Ko-28B"
    tenos_api_key: str = "local-no-auth"
    tenos_timeout_s: float = 120.0

    # HF Inference API (GPU 없이 TenOS 호출)
    hf_api_token: str = ""

    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    openai_base_url: str = "https://api.openai.com/v1"

    anthropic_api_key: str = ""
    anthropic_model: str = "claude-haiku-4-5-20251001"

    # ── Embedding ──
    embedding_provider: Literal["tenos", "openai", "local"] = "local"
    embedding_model: str = "jhgan/ko-sroberta-multitask"

    # ── OCR ──
    ocr_provider: Literal["none", "tesseract", "clova"] = "none"
    ocr_tesseract_cmd: str = ""  # 빈 값이면 PATH에서 자동 검색
    ocr_default_lang: str = "kor+eng"
    clova_ocr_url: str = ""
    clova_ocr_secret: str = ""

    # ── RAG ──
    chroma_persist_dir: Path = Path("./data/chroma")
    rag_top_k: int = 5

    # ── Storage ──
    storage_backend: Literal["local", "s3"] = "local"
    storage_local_dir: Path = Path("./data/documents")
    s3_bucket: str = ""
    s3_region: str = "ap-northeast-2"
    s3_access_key: str = ""
    s3_secret_key: str = ""

    # ── Email (SMTP) ──
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str = ""          # Gmail 주소 (환경변수 SMTP_USER)
    smtp_password: str = ""      # Gmail 앱 비밀번호 (환경변수 SMTP_PASSWORD)
    smtp_from: str = ""          # 발신자 표시명+주소 (빈 값이면 smtp_user 사용)
    frontend_url: str = "http://localhost:3000"

    @property
    def email_enabled(self) -> bool:
        return bool(self.smtp_user and self.smtp_password)

    # ── Security ──
    cors_origins: str = "http://localhost:3000,https://docuax-qxyndyy63-specialdatastrategist-1934s-projects.vercel.app"
    jwt_algorithm: str = "HS256"
    jwt_expires_min: int = 15  # Access Token 15분 (Refresh Token으로 자동 갱신)

    # ── On-prem 모드 ──
    on_premise: bool = False

    # ── 관리자 (admin) — 콤마로 구분된 이메일 화이트리스트 ──
    # 예: DOCUAX_ADMIN_EMAILS="admin@docuax.io, ceo@tenai.kr"
    # 또는 도메인 와일드카드: "*@tenai.kr"
    admin_emails: str = "specialdatastrategist@gmail.com"

    # ── Rate Limit (IP 분당) ──
    rate_limit_default_per_min: int = 120
    rate_limit_auth_per_min: int = 10
    rate_limit_convert_per_min: int = 30

    # ── Stripe (결제, 선택) ──
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_price_pro: str = ""
    stripe_price_team: str = ""
    stripe_success_url: str = "http://localhost:3000/billing/success"
    stripe_cancel_url: str = "http://localhost:3000/billing/cancel"

    @property
    def cors_origins_list(self) -> list[str]:
        origins = [o.strip() for o in self.cors_origins.split(",") if o.strip()]
        # 프로덕션 Vercel URL은 Railway 환경변수와 무관하게 항상 허용
        _always_allowed = [
            "https://docuax-qxyndyy63-specialdatastrategist-1934s-projects.vercel.app",
        ]
        for url in _always_allowed:
            if url not in origins:
                origins.append(url)
        return origins

    @property
    def admin_emails_list(self) -> list[str]:
        return [e.strip().lower() for e in self.admin_emails.split(",") if e.strip()]

    def is_admin_email(self, email: str | None) -> bool:
        """이메일이 admin allowlist에 해당하는지 — '*@domain' 와일드카드 지원."""
        if not email:
            return False
        e = email.strip().lower()
        for pat in self.admin_emails_list:
            if pat.startswith("*@"):
                if e.endswith(pat[1:]):
                    return True
            elif pat == e:
                return True
        return False

    @property
    def llm_chain_list(self) -> list[str]:
        return [p.strip() for p in self.llm_chain.split(",") if p.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


def reset_settings_cache() -> None:
    """Runtime overlay 변경 후 호출 — 다음 get_settings()가 새 값으로 재구성."""
    get_settings.cache_clear()
