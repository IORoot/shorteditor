from __future__ import annotations

from collector_server.shared.database import Database

_TABLES = """
CREATE TABLE IF NOT EXISTS pipelines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 1,
    steps TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pipeline_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""


def ensure_schema(db: Database) -> None:
    # shortcut: statements are split on ';', so no default or comment above may contain one
    for statement in _TABLES.split(";"):
        if statement.strip():
            db.execute(statement)
