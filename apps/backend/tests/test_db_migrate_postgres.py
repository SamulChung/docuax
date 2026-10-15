"""Real PostgreSQL migration checks; CI provides a disposable PostgreSQL service."""
import asyncio
import os
import uuid

import pytest
from sqlalchemy import inspect, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import create_async_engine

from app.db import session as db_session
from app.models import User
from tests.test_db_migrate import _OLD_USERS_DDL


@pytest.fixture
async def postgres_db(monkeypatch):
    url = os.environ.get("TEST_POSTGRES_URL")
    if not url:
        pytest.skip("TEST_POSTGRES_URL is not set")
    url = db_session._make_async_url(url)
    schema = f"docuax_test_{uuid.uuid4().hex}"
    admin = create_async_engine(url, connect_args={"ssl": False})
    async with admin.begin() as conn:
        await conn.exec_driver_sql(f'CREATE SCHEMA "{schema}"')
    engine = create_async_engine(url, connect_args={
        "ssl": False, "server_settings": {"search_path": schema},
    })
    monkeypatch.setattr(db_session, "engine", engine)
    try:
        async with engine.begin() as conn:
            await conn.exec_driver_sql(_OLD_USERS_DDL.replace("DATETIME", "TIMESTAMP"))
            await conn.exec_driver_sql(
                "INSERT INTO users (id,email,name,plan,persona_mode,password_hash,"
                "opt_in_training,opt_in_marketing,created_at) VALUES "
                "('u1','old@example.com','기존유저','free','worker','hash',"
                "FALSE,FALSE,'2025-01-01 00:00:00')"
            )
        yield engine
    finally:
        await engine.dispose()
        async with admin.begin() as conn:
            await conn.exec_driver_sql(f'DROP SCHEMA "{schema}" CASCADE')
        await admin.dispose()


async def test_postgres_concurrent_startup_preserves_users(postgres_db):
    await asyncio.gather(db_session.init_db(), db_session.init_db())
    await db_session.init_db()
    async with postgres_db.connect() as conn:
        row = (await conn.execute(select(User).where(User.id == "u1"))).first()
        assert row.name == "기존유저"
        assert row.email_verified is False
        assert row.google_id is None
        indexes = await conn.run_sync(lambda c: inspect(c).get_indexes("users"))
        assert any(ix["name"] == "ix_users_google_id" and ix["unique"] for ix in indexes)


async def test_postgres_failed_startup_rolls_back_ddl(postgres_db, monkeypatch):
    def fail_after_ddl(conn):
        conn.exec_driver_sql("ALTER TABLE users ADD COLUMN incomplete TEXT")
        raise RuntimeError("migration interrupted")

    monkeypatch.setattr(db_session, "_add_missing_columns", fail_after_ddl)
    with pytest.raises(RuntimeError, match="migration interrupted"):
        await db_session.init_db()
    async with postgres_db.connect() as conn:
        columns = await conn.run_sync(lambda c: inspect(c).get_columns("users"))
        assert "incomplete" not in {c["name"] for c in columns}
        assert (await conn.exec_driver_sql("SELECT COUNT(*) FROM users")).scalar_one() == 1


async def test_postgres_duplicate_google_ids_block_startup(postgres_db):
    async with postgres_db.begin() as conn:
        await conn.exec_driver_sql("ALTER TABLE users ADD COLUMN google_id VARCHAR(120)")
        await conn.exec_driver_sql("UPDATE users SET google_id='duplicate'")
        await conn.exec_driver_sql(
            "INSERT INTO users (id,email,name,plan,persona_mode,password_hash,"
            "opt_in_training,opt_in_marketing,created_at,google_id) "
            "SELECT 'u2','other@example.com',name,plan,persona_mode,password_hash,"
            "opt_in_training,opt_in_marketing,created_at,google_id FROM users WHERE id='u1'"
        )
    with pytest.raises(IntegrityError):
        await db_session.init_db()
    async with postgres_db.connect() as conn:
        columns = await conn.run_sync(lambda c: inspect(c).get_columns("users"))
        assert "email_verified" not in {c["name"] for c in columns}
        assert (await conn.exec_driver_sql("SELECT COUNT(*) FROM users")).scalar_one() == 2
