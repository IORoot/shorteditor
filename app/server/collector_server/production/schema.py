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
CREATE TABLE IF NOT EXISTS production_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id INTEGER NOT NULL REFERENCES production_batches(id) ON DELETE CASCADE,
    number INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (batch_id, number)
);
CREATE TABLE IF NOT EXISTS production_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id INTEGER NOT NULL REFERENCES production_batches(id) ON DELETE CASCADE,
    run_id INTEGER REFERENCES production_runs(id) ON DELETE CASCADE,
    folder TEXT NOT NULL DEFAULT '',
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
    card_id INTEGER NOT NULL REFERENCES production_cards(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    at TEXT NOT NULL,
    text TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS production_exports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id INTEGER REFERENCES production_cards(id) ON DELETE SET NULL,
    batch_id INTEGER NOT NULL DEFAULT 0,
    source_folder TEXT NOT NULL DEFAULT '',
    batch_name TEXT NOT NULL DEFAULT '',
    card_number INTEGER NOT NULL DEFAULT 0,
    sha256 TEXT NOT NULL,
    status TEXT NOT NULL,
    media_id TEXT,
    queue_id TEXT,
    pipeline_id TEXT,
    folder TEXT,
    post_type TEXT,
    caption TEXT NOT NULL DEFAULT '',
    message TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS production_batch_seen (
    batch_id INTEGER NOT NULL REFERENCES production_batches(id) ON DELETE CASCADE,
    folder TEXT NOT NULL,
    seen_at TEXT NOT NULL,
    PRIMARY KEY (batch_id, folder)
);
CREATE INDEX IF NOT EXISTS production_exports_by_card ON production_exports (card_id, id);
CREATE INDEX IF NOT EXISTS production_exports_by_sha ON production_exports (sha256);
CREATE INDEX IF NOT EXISTS production_cards_by_status ON production_cards (status, id);
CREATE INDEX IF NOT EXISTS production_logs_by_card ON production_logs (card_id, kind, id);
"""


# Columns added after the tables first existed. CREATE TABLE IF NOT EXISTS never adds them to an old table.
_NEW_COLUMNS = {
    "production_batches": {"pipeline_id": "INTEGER", "folder_pattern": "TEXT", "auto_run": "INTEGER NOT NULL DEFAULT 1", "folder_template": "TEXT NOT NULL DEFAULT '{{name}}-{{id}}'", "ignore_subfolders": "INTEGER NOT NULL DEFAULT 0", "watching": "INTEGER NOT NULL DEFAULT 0", "watch_interval_minutes": "INTEGER NOT NULL DEFAULT 5", "watch_settle_minutes": "INTEGER NOT NULL DEFAULT 10", "watch_max_per_check": "INTEGER NOT NULL DEFAULT 20", "watch_last_checked_at": "TEXT", "watch_last_error": "TEXT", "watch_waiting": "TEXT NOT NULL DEFAULT '[]'"},
    "production_cards": {"steps_used": "TEXT NOT NULL DEFAULT '[]'", "blocked_items": "TEXT NOT NULL DEFAULT '[]'", "stages": "TEXT NOT NULL DEFAULT '[]'"},
    "production_watches": {"pipeline_id": "INTEGER"},
    "production_exports": {"batch_id": "INTEGER NOT NULL DEFAULT 0", "source_folder": "TEXT NOT NULL DEFAULT ''", "batch_name": "TEXT NOT NULL DEFAULT ''", "card_number": "INTEGER NOT NULL DEFAULT 0"},  # for a table made before records outlived their cards
}


def _table_exists(db: Database, name: str) -> bool:
    return bool(db.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", (name,)))


def _columns(db: Database, table: str) -> set[str]:
    return {row["name"] for row in db.query(f"PRAGMA table_info({table})")}


def ensure_schema(db: Database) -> None:
    # shortcut: statements are split on ';', so no default or comment above may contain one
    renamed = False
    if _table_exists(db, "production_passes") and not _table_exists(db, "production_cards"):
        # Before runs and cards, every pass was a card. Keep the rows; the rename keeps their ids and logs.
        db.execute("ALTER TABLE production_passes RENAME TO production_cards")
        db.execute("ALTER TABLE production_logs RENAME COLUMN pass_id TO card_id")
        renamed = True
    for statement in _TABLES.split(";"):
        if statement.strip():
            db.execute(statement)
    ensure_watch_schema(db)
    for table, columns in _NEW_COLUMNS.items():
        present = _columns(db, table)
        for name, ddl in columns.items():
            if name not in present:
                db.execute(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}")
    if "run_id" not in _columns(db, "production_cards"):
        db.execute("ALTER TABLE production_cards ADD COLUMN run_id INTEGER REFERENCES production_runs(id) ON DELETE CASCADE")
    if "folder" not in _columns(db, "production_cards"):
        db.execute("ALTER TABLE production_cards ADD COLUMN folder TEXT NOT NULL DEFAULT ''")
    db.execute("CREATE INDEX IF NOT EXISTS production_cards_by_run ON production_cards (run_id, number)")
    db.execute("CREATE INDEX IF NOT EXISTS production_exports_by_source ON production_exports (batch_id, source_folder)")  # after the columns it names exist
    if renamed:
        _give_each_card_a_run(db)


def _give_each_card_a_run(db: Database) -> None:
    """Each card that was a pass before runs existed gets its own run, numbered as the card was.

    That keeps the board the same: a batch's newest run holds its newest card, as its newest pass did.
    """
    for card in db.query("SELECT id, batch_id, number, created_at FROM production_cards WHERE run_id IS NULL ORDER BY id"):
        run = db.execute("INSERT INTO production_runs (batch_id, number, created_at) VALUES (?, ?, ?)", (card["batch_id"], card["number"], card["created_at"]))
        db.execute(
            "UPDATE production_cards SET run_id = ?, folder = (SELECT input_folder FROM production_batches WHERE id = production_cards.batch_id) WHERE id = ?",
            (run.lastrowid, card["id"]),
        )
