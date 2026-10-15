"""경량 스키마 부트스트랩 테스트 — 구버전 SQLite DB에 누락 컬럼 추가.

배경: create_all은 이미 존재하는 테이블에 새 컬럼을 추가하지 않는다.
구버전 docuax.db(users.email_verified, google_id 없음)로 부팅하면
/api/v1/auth/register가 sqlite3.OperationalError로 500을 냈다.
"""
import asyncio
import sqlite3
from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import inspect, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

import app.models  # noqa: F401 — Base.metadata에 테이블 등록
from app.db import get_db
from app.db import session as db_session
from app.db.session import _add_missing_columns
from app.models import User

# v3 이전 users 스키마 — email_verified, google_id 컬럼이 없다
_OLD_USERS_DDL = """
CREATE TABLE users (
    id VARCHAR(32) NOT NULL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(120) NOT NULL,
    plan VARCHAR(32) NOT NULL,
    persona_mode VARCHAR(16) NOT NULL,
    organization_id VARCHAR(32),
    password_hash VARCHAR(255) NOT NULL,
    opt_in_training BOOLEAN NOT NULL,
    opt_in_marketing BOOLEAN NOT NULL,
    created_at DATETIME NOT NULL,
    last_login DATETIME
)
"""


@pytest.fixture
def old_db_path(tmp_path):
    """구버전 스키마 users 테이블 + 기존 사용자 1명이 있는 SQLite 파일."""
    db_path = tmp_path / "old.db"
    conn = sqlite3.connect(db_path)
    conn.execute(_OLD_USERS_DDL)
    conn.execute(
        "INSERT INTO users (id, email, name, plan, persona_mode, password_hash,"
        " opt_in_training, opt_in_marketing, created_at)"
        " VALUES ('u1', 'old@example.com', '기존유저', 'free', 'worker', 'hash', 0, 0,"
        " '2025-01-01 00:00:00')"
    )
    conn.commit()
    conn.close()
    return db_path


async def _migrate(db_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{db_path}")
    try:
        async with engine.begin() as conn:
            await conn.run_sync(_add_missing_columns)
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_adds_missing_columns_to_old_users_table(old_db_path):
    """구버전 users 테이블에 email_verified, google_id 컬럼이 추가된다."""
    await _migrate(old_db_path)

    conn = sqlite3.connect(old_db_path)
    cols = {row[1] for row in conn.execute("PRAGMA table_info(users)")}
    conn.close()
    assert "email_verified" in cols
    assert "google_id" in cols


@pytest.mark.asyncio
async def test_existing_rows_get_default_not_null(old_db_path):
    """기존 행의 email_verified는 NULL이 아닌 False로 채워진다."""
    await _migrate(old_db_path)

    conn = sqlite3.connect(old_db_path)
    row = conn.execute(
        "SELECT email_verified, google_id FROM users WHERE id = 'u1'"
    ).fetchone()
    conn.close()
    assert row[0] == 0  # False — NULL 아님
    assert row[1] is None  # nullable 컬럼은 NULL 허용


@pytest.mark.asyncio
async def test_orm_query_works_after_migration(old_db_path):
    """마이그레이션 후 User 모델 SELECT(register 흐름의 이메일 조회)가 동작한다."""
    await _migrate(old_db_path)

    engine = create_async_engine(f"sqlite+aiosqlite:///{old_db_path}")
    try:
        async with engine.connect() as conn:
            result = await conn.execute(
                select(User).where(User.email == "old@example.com")
            )
            user = result.first()
            assert user is not None
            assert user.email_verified is False
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_migration_is_idempotent(old_db_path):
    """두 번 실행해도 오류 없이 동일 결과."""
    await _migrate(old_db_path)
    await _migrate(old_db_path)

    conn = sqlite3.connect(old_db_path)
    cols = [row[1] for row in conn.execute("PRAGMA table_info(users)")]
    conn.close()
    assert cols.count("email_verified") == 1


@pytest.mark.asyncio
async def test_creates_missing_index_for_new_column(old_db_path):
    """google_id의 unique 인덱스(ix_users_google_id)도 함께 생성된다."""
    await _migrate(old_db_path)

    engine = create_async_engine(f"sqlite+aiosqlite:///{old_db_path}")
    try:
        async with engine.connect() as conn:
            def _get_indexes(sync_conn):
                return inspect(sync_conn).get_indexes("users")

            indexes = await conn.run_sync(_get_indexes)
    finally:
        await engine.dispose()
    by_name = {ix["name"]: ix for ix in indexes}
    assert "ix_users_google_id" in by_name
    assert by_name["ix_users_google_id"]["unique"]


@pytest.mark.asyncio
async def test_missing_table_is_ignored(tmp_path):
    """메타데이터에는 있지만 DB에 없는 테이블은 건드리지 않는다 (create_all 몫)."""
    db_path = tmp_path / "empty.db"
    sqlite3.connect(db_path).close()

    await _migrate(db_path)  # 예외 없이 통과해야 함

    conn = sqlite3.connect(db_path)
    tables = {
        row[0]
        for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
    }
    conn.close()
    assert "users" not in tables


@pytest.fixture
async def startup_db(old_db_path, monkeypatch):
    engine = create_async_engine(f"sqlite+aiosqlite:///{old_db_path}")
    monkeypatch.setattr(db_session, "engine", engine)
    try:
        yield engine
    finally:
        await engine.dispose()


async def test_startup_failure_is_not_swallowed(startup_db, monkeypatch, old_db_path):
    def fail_after_ddl(conn):
        conn.exec_driver_sql("ALTER TABLE users ADD COLUMN incomplete TEXT")
        raise RuntimeError("migration interrupted")

    monkeypatch.setattr(db_session, "_add_missing_columns", fail_after_ddl)
    with pytest.raises(RuntimeError, match="migration interrupted"):
        await db_session.init_db()

    # SQLite DDL must roll back with the failed startup, preserving existing data.
    with sqlite3.connect(old_db_path) as conn:
        assert "incomplete" not in {row[1] for row in conn.execute("PRAGMA table_info(users)")}
        assert conn.execute("SELECT email FROM users").fetchall() == [("old@example.com",)]


async def test_repairs_index_after_interrupted_migration(old_db_path):
    with sqlite3.connect(old_db_path) as conn:
        conn.execute("ALTER TABLE users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT 0")
        conn.execute("ALTER TABLE users ADD COLUMN google_id VARCHAR(120)")

    await _migrate(old_db_path)

    with sqlite3.connect(old_db_path) as conn:
        assert any(row[1] == "ix_users_google_id" and row[2] for row in conn.execute("PRAGMA index_list(users)"))


async def test_duplicate_google_ids_block_startup(startup_db, old_db_path):
    with sqlite3.connect(old_db_path) as conn:
        conn.execute("ALTER TABLE users ADD COLUMN google_id VARCHAR(120)")
        conn.execute("UPDATE users SET google_id = 'duplicate'")
        conn.execute(
            "INSERT INTO users (id,email,name,plan,persona_mode,password_hash,"
            "opt_in_training,opt_in_marketing,created_at,google_id) "
            "SELECT 'u2','other@example.com',name,plan,persona_mode,password_hash,"
            "opt_in_training,opt_in_marketing,created_at,google_id FROM users WHERE id='u1'"
        )

    with pytest.raises(IntegrityError):
        await db_session.init_db()

    with sqlite3.connect(old_db_path) as conn:
        assert conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 2
        assert "email_verified" not in {row[1] for row in conn.execute("PRAGMA table_info(users)")}


async def test_unknown_missing_column_requires_explicit_migration(startup_db, old_db_path):
    with sqlite3.connect(old_db_path) as conn:
        conn.execute("ALTER TABLE users DROP COLUMN password_hash")

    with pytest.raises(RuntimeError, match="users.password_hash"):
        await db_session.init_db()

    with sqlite3.connect(old_db_path) as conn:
        # Reject the entire plan before silently weakening constraints or changing rows.
        assert "email_verified" not in {row[1] for row in conn.execute("PRAGMA table_info(users)")}
        assert conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 1


async def test_incorrect_google_index_blocks_startup(startup_db, old_db_path):
    with sqlite3.connect(old_db_path) as conn:
        conn.execute("ALTER TABLE users ADD COLUMN google_id VARCHAR(120)")
        conn.execute("CREATE INDEX ix_users_google_id ON users(google_id)")
    with pytest.raises(RuntimeError, match="Explicit index migration required"):
        await db_session.init_db()
    with sqlite3.connect(old_db_path) as conn:
        assert "email_verified" not in {row[1] for row in conn.execute("PRAGMA table_info(users)")}


async def test_concurrent_startup_is_idempotent(startup_db, old_db_path):
    await asyncio.gather(db_session.init_db(), db_session.init_db())
    with sqlite3.connect(old_db_path) as conn:
        assert [row[1] for row in conn.execute("PRAGMA table_info(users)")].count("email_verified") == 1
        assert conn.execute("SELECT email_verified FROM users WHERE id='u1'").fetchone() == (0,)


async def test_register_after_real_startup(startup_db, monkeypatch, old_db_path):
    from app.api.v1 import auth
    from app.main import create_app

    await db_session.init_db()
    sessions = async_sessionmaker(startup_db, expire_on_commit=False)

    async def test_db():
        async with sessions() as session:
            yield session

    email_service = AsyncMock()
    monkeypatch.setattr(auth, "get_email_service", lambda: email_service)
    app = create_app()
    app.dependency_overrides[get_db] = test_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/api/v1/auth/register", json={
            "email": "new@example.com", "password": "test-password-123", "name": "신규사용자",
        })
        assert response.status_code == 200, response.text
        assert response.json()["user"]["email_verified"] is False
        duplicate = await client.post("/api/v1/auth/register", json={
            "email": "new@example.com", "password": "test-password-123",
        })
        assert duplicate.status_code == 409

    with sqlite3.connect(old_db_path) as conn:
        assert conn.execute("SELECT name FROM users WHERE id='u1'").fetchone() == ("기존유저",)
        assert conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 2
