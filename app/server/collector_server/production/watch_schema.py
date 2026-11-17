from __future__ import annotations

from collector_server.shared.database import Database

_TABLES = """
CREATE TABLE IF NOT EXISTS production_watches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    parent_folder TEXT NOT NULL,
    pattern TEXT NOT NULL,
    name_template TEXT NOT NULL DEFAULT '{name}',
    steps TEXT NOT NULL,
    run_on TEXT NOT NULL DEFAULT 'any',
    output_root TEXT,
    interval_minutes INTEGER NOT NULL DEFAULT 5,
    settle_minutes INTEGER NOT NULL DEFAULT 10,
    max_per_check INTEGER NOT NULL DEFAULT 20,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    last_checked_at TEXT,
    last_error TEXT,
    waiting TEXT NOT NULL DEFAULT '[]',
    created_total INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS production_watch_seen (
    watch_id INTEGER NOT NULL REFERENCES production_watches(id) ON DELETE CASCADE,
    folder_path TEXT NOT NULL,
    seen_at TEXT NOT NULL,
    PRIMARY KEY (watch_id, folder_path)
);
"""


def ensure_watch_schema(db: Database) -> None:
    for statement in _TABLES.split(";"):
        if statement.strip():
            db.execute(statement)
