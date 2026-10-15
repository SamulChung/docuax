"""DB 세션 — SQLAlchemy 2.0 async."""
from __future__ import annotations

from collections.abc import AsyncGenerator

from sqlalchemy import inspect
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


# Only the reviewed legacy auth changes are safe to bootstrap automatically.
# Future schema changes need an explicit migration, including their constraints.
_LEGACY_COLUMNS = {("users", "email_verified"), ("users", "google_id")}


def _add_missing_columns(conn) -> None:
    """기존 사용자 데이터는 보존하고 검토된 두 인증 컬럼·인덱스만 보강한다.

    알 수 없는 누락 컬럼은 nullable로 완화하지 않고 명시적 마이그레이션을 요구한다.
    init_db의 트랜잭션·DB 잠금 안에서 호출해야 한다.
    """
    inspector = inspect(conn)
    existing_tables = set(inspector.get_table_names())
    preparer = conn.dialect.identifier_preparer
    statements: list[tuple[str, str, str]] = []
    indexes = []

    # Validate the entire plan before issuing any ALTER TABLE.
    for table in Base.metadata.sorted_tables:
        if table.name not in existing_tables:
            continue  # 새 테이블은 create_all이 생성
        existing_cols = {c["name"] for c in inspector.get_columns(table.name)}
        for column in table.columns:
            if column.name in existing_cols:
                continue
            if (table.name, column.name) not in _LEGACY_COLUMNS:
                raise RuntimeError(
                    f"Explicit migration required for {table.name}.{column.name}; "
                    "back up the database before migrating"
                )
            col_type = column.type.compile(conn.dialect)
            ddl = (
                f"ALTER TABLE {preparer.quote(table.name)} "
                f"ADD COLUMN {preparer.quote(column.name)} {col_type}"
            )
            if not column.nullable:
                default = column.default
                if default is None or not default.is_scalar:
                    raise RuntimeError(f"Explicit backfill required for {table.name}.{column.name}")
                literal = column.type.literal_processor(conn.dialect)(default.arg)
                ddl += f" DEFAULT {literal} NOT NULL"
            statements.append((ddl, table.name, column.name))

        existing_indexes = {ix["name"]: ix for ix in inspector.get_indexes(table.name)}
        for index in table.indexes:
            if not any((table.name, c.name) in _LEGACY_COLUMNS for c in index.columns):
                continue
            current = existing_indexes.get(index.name)
            if current is not None and (
                bool(current["unique"]) != bool(index.unique)
                or current["column_names"] != [c.name for c in index.columns]
            ):
                raise RuntimeError(f"Explicit index migration required for {index.name}")
            indexes.append(index)

    for ddl, table_name, column_name in statements:
        conn.exec_driver_sql(ddl)
        log.info("스키마 부트스트랩: 누락 컬럼 추가", table=table_name, column=column_name)
    # Retry missing indexes even when a previous deployment already added the column.
    for index in indexes:
        index.create(conn, checkfirst=True)


async def init_db() -> None:
    """앱 시작 시 호출. 운영에서는 Alembic 마이그레이션 사용 권장."""
    # 모델 import — 메타데이터에 등록되도록
    import app.models  # noqa: F401

    try:
        async with engine.begin() as conn:
            if conn.dialect.name == "sqlite":
                # Explicit BEGIN makes SQLite DDL transactional and serializes workers.
                await conn.exec_driver_sql("BEGIN IMMEDIATE")
            elif conn.dialect.name == "postgresql":
                # Stable application lock, released automatically on commit/rollback.
                await conn.exec_driver_sql("SELECT pg_advisory_xact_lock(1146045269)")
            else:
                raise RuntimeError("Schema bootstrap supports SQLite and PostgreSQL only")
            await conn.run_sync(Base.metadata.create_all)
            await conn.run_sync(_add_missing_columns)
    except Exception:  # noqa: BLE001
        log.exception("DB 초기화 실패 — 기존 데이터를 보존하고 백업·마이그레이션 상태를 확인하세요")
        raise
    log.info("DB 초기화 완료", dialect=engine.dialect.name)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session
