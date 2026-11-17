from __future__ import annotations

from collector_server.shared.database import Database

from .watch_schema import ensure_watch_schema

_TABLES = """
CREATE TABLE IF NOT EXISTS production_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    input_folder TEXT NOT NULL,
    steps TEXT NOT NULL,
    run_on TEXT NOT NULL DEFAULT 'any',
    output_root TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS production_passes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id INTEGER NOT NULL REFERENCES production_batches(id) ON DELETE CASCADE,
    number INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    stage_index INTEGER NOT NULL DEFAULT 0,
    stage_key TEXT NOT NULL DEFAULT '',
    blocked_reason TEXT,
    blocked_choices TEXT NOT NULL DEFAULT '[]',
    overrides TEXT NOT NULL DEFAULT '{}',
    error TEXT,
    output TEXT,
    created_at TEXT NOT NULL,
    started_at TEXT,
    finished_at TEXT,
    UNIQUE (batch_id, number)
);
CREATE TABLE IF NOT EXISTS production_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pass_id INTEGER NOT NULL REFERENCES production_passes(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    at TEXT NOT NULL,
    text TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS production_passes_by_status ON production_passes (status, id);
CREATE INDEX IF NOT EXISTS production_logs_by_pass ON production_logs (pass_id, kind, id);
"""


# Columns added after the tables first existed. CREATE TABLE IF NOT EXISTS never adds them to an old table.
_NEW_COLUMNS = {
    "production_batches": {"pipeline_id": "INTEGER"},
    "production_passes": {"steps_used": "TEXT NOT NULL DEFAULT '[]'", "blocked_items": "TEXT NOT NULL DEFAULT '[]'"},
    "production_watches": {"pipeline_id": "INTEGER"},
}


def ensure_schema(db: Database) -> None:
    # shortcut: statements are split on ';', so no default or comment above may contain one
    for statement in _TABLES.split(";"):
        if statement.strip():
            db.execute(statement)
    ensure_watch_schema(db)
    for table, columns in _NEW_COLUMNS.items():
        present = {row["name"] for row in db.query(f"PRAGMA table_info({table})")}
        for name, ddl in columns.items():
            if name not in present:
                db.execute(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}")
