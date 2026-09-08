"""DB 세션 — SQLAlchemy 2.0 async."""
from __future__ import annotations

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings
from app.core.logging import get_logger

log = get_logger(__name__)


class Base(DeclarativeBase):
    pass


def _make_async_url(url: str) -> str:
    """DATABASE_URL을 SQLAlchemy 비동기 드라이버 형식으로 변환.

    Railway/Heroku 제공 URL 패턴:
      postgres://...   → postgresql+asyncpg://...
      postgresql://... → postgresql+asyncpg://...
    SQLite (로컬 개발):
      sqlite:///...    → sqlite+aiosqlite:///...
    이미 올바른 형식이면 그대로 반환.

    주의: asyncpg는 URL의 sslmode 파라미터를 지원하지 않으므로 제거한다.
    Railway 내부 네트워크는 SSL 없이도 안전하게 연결된다.
    """
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+asyncpg://", 1)
    elif url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    elif url.startswith("sqlite:///") and "+aiosqlite" not in url:
        return url.replace("sqlite:///", "sqlite+aiosqlite:///", 1)

    # asyncpg는 sslmode URL 파라미터를 인식하지 못해 에러 발생
    # Railway 내부망은 SSL 불필요 → sslmode 파라미터 제거
    if "sslmode=" in url:
        import re
        url = re.sub(r"[?&]sslmode=[^&]*", "", url)
        # 파라미터 제거 후 '?' 없이 '&'만 남으면 정리
        url = re.sub(r"\?&", "?", url)
        url = url.rstrip("?")

    return url


_settings = get_settings()
_db_url = _make_async_url(_settings.database_url)

# PostgreSQL 연결 풀 설정
_engine_kwargs: dict = {"echo": False, "future": True}
if _db_url.startswith("postgresql"):
    _engine_kwargs["pool_pre_ping"] = True   # 연결 상태 사전 확인
    _engine_kwargs["pool_size"] = 5
    _engine_kwargs["max_overflow"] = 10
    _engine_kwargs["connect_args"] = {"ssl": False}  # Railway 내부망 SSL 불필요

engine = create_async_engine(_db_url, **_engine_kwargs)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


def _default_literal(column) -> str | None:
    """컬럼의 파이썬 스칼라 default를 SQL 리터럴로 변환. 변환 불가(callable, dict 등)면 None."""
    default = column.default
    if default is None or not getattr(default, "is_scalar", False):
        return None
    value = default.arg
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"  # SQLite도 1/0 별칭으로 지원
    if isinstance(value, (int, float)):
        return repr(value)
    if isinstance(value, str):
        escaped = value.replace("'", "''")
        return f"'{escaped}'"
    return None


def _add_missing_columns(conn) -> None:
    """create_all이 건너뛰는 기존 테이블에 모델의 누락 컬럼을 ALTER TABLE로 추가.

    additive 변경(컬럼·인덱스 추가)만 처리하는 경량 부트스트랩.
    컬럼 삭제·이름 변경·타입 변경은 다루지 않는다 — 그 시점엔 Alembic 도입 필요.
    NOT NULL 컬럼은 스칼라 default가 있을 때만 NOT NULL DEFAULT로 추가하고,
    default를 리터럴로 못 만들면 nullable로 추가한다 (기존 행 때문에 NOT NULL 불가).
    """
    from sqlalchemy import inspect as sa_inspect

    inspector = sa_inspect(conn)
    existing_tables = set(inspector.get_table_names())
    preparer = conn.dialect.identifier_preparer

    for table in Base.metadata.sorted_tables:
        if table.name not in existing_tables:
            continue  # 새 테이블은 create_all이 생성
        existing_cols = {c["name"] for c in inspector.get_columns(table.name)}
        added: list[str] = []
        for column in table.columns:
            if column.name in existing_cols:
                continue
            col_type = column.type.compile(conn.dialect)
            ddl = (
                f"ALTER TABLE {preparer.quote(table.name)} "
                f"ADD COLUMN {preparer.quote(column.name)} {col_type}"
            )
            literal = _default_literal(column)
            if literal is not None:
                ddl += f" DEFAULT {literal}"
                if not column.nullable:
                    ddl += " NOT NULL"
            conn.exec_driver_sql(ddl)
            added.append(column.name)
        if added:
            log.info("스키마 부트스트랩: 누락 컬럼 추가", table=table.name, columns=added)
            # 새 컬럼에 걸린 인덱스 생성 (예: users.google_id unique 인덱스)
            for index in table.indexes:
                if any(c.name in added for c in index.columns):
                    index.create(conn, checkfirst=True)


async def init_db() -> None:
    """앱 시작 시 호출. 운영에서는 Alembic 마이그레이션 사용 권장."""
    # 모델 import — 메타데이터에 등록되도록
    from app.models import (
        AuditLog,
        ConversionRun,
        Document,
        LearnedTemplate,
        MacroLog,
        MacroPreference,
        Organization,
        RefreshToken,
        Slide,
        User,
    )  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    # 구버전 DB(예: email_verified 없는 users)에 누락 컬럼 보강 — 멱등
    try:
        async with engine.begin() as conn:
            await conn.run_sync(_add_missing_columns)
    except Exception:  # noqa: BLE001
        log.exception(
            "스키마 부트스트랩 실패 — 로컬 SQLite라면 docuax.db 삭제 후 재부팅으로 복구 가능"
        )
    log.info("DB 초기화 완료", url=_settings.database_url)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session
