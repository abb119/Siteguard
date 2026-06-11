"""
Lightweight, idempotent schema upgrades run at startup.

`Base.metadata.create_all` creates missing TABLES but never adds COLUMNS to
existing ones. The auth/roles feature adds columns to `users`, so on databases
created before it we issue the ALTER TABLE statements ourselves. Safe to run
on every boot (checks current columns first); works on SQLite and Postgres.
"""
from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncEngine

# column name -> DDL type/default (kept ANSI so SQLite + Postgres accept it)
_USER_COLUMNS = {
    "full_name": "VARCHAR",
    "role": "VARCHAR DEFAULT 'worker'",
    "company_id": "INTEGER",
}


async def ensure_auth_schema(engine: AsyncEngine) -> None:
    async with engine.begin() as conn:
        await conn.run_sync(_upgrade_sync)
    # backfill role for rows created before the column existed
    async with engine.begin() as conn:
        await conn.exec_driver_sql("UPDATE users SET role = 'worker' WHERE role IS NULL")


def _upgrade_sync(sync_conn) -> None:
    dialect = sync_conn.dialect.name
    if dialect == "sqlite":
        existing = {row[1] for row in sync_conn.exec_driver_sql("PRAGMA table_info(users)")}
    else:
        existing = {row[0] for row in sync_conn.exec_driver_sql(
            "SELECT column_name FROM information_schema.columns WHERE table_name = 'users'"
        )}
    for col, ddl in _USER_COLUMNS.items():
        if col not in existing:
            sync_conn.exec_driver_sql(f"ALTER TABLE users ADD COLUMN {col} {ddl}")
            print(f"INFO: migrate_lite added users.{col}", flush=True)
