from __future__ import annotations

import sqlite3
import threading
from collections.abc import Iterable
from typing import Any

_SCHEMA = """
CREATE TABLE IF NOT EXISTS collectors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    source TEXT NOT NULL,
    transfer TEXT NOT NULL DEFAULT 'move',
    enabled INTEGER NOT NULL DEFAULT 0,
    kind TEXT NOT NULL DEFAULT 'daily',
    time TEXT NOT NULL DEFAULT '02:00',
    weekdays TEXT NOT NULL DEFAULT '',
    day_of_month INTEGER NOT NULL DEFAULT 1,
    cron TEXT NOT NULL DEFAULT '',
    last_slot TEXT
);
CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    collector_id INTEGER NOT NULL REFERENCES collectors(id),
    started_at TEXT NOT NULL,
    trigger TEXT NOT NULL,
    status TEXT NOT NULL,
    outcome TEXT NOT NULL,
    can_undo INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS moves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL REFERENCES runs(id),
    source TEXT NOT NULL,
    destination TEXT NOT NULL,
    transfer TEXT NOT NULL
);
"""


_NEW_COLUMNS = {
    "active": "INTEGER NOT NULL DEFAULT 1",
    "source_type": "TEXT NOT NULL DEFAULT 'local'",
    "ssh_host": "TEXT NOT NULL DEFAULT ''",
    "ssh_user": "TEXT NOT NULL DEFAULT ''",
    "ssh_key_path": "TEXT NOT NULL DEFAULT ''",
    "output_folder": "TEXT NOT NULL DEFAULT ''",
    "folder_template": "TEXT NOT NULL DEFAULT '{date:YYYY-MM-DD}_{weekday}'",
    "group_by": "TEXT NOT NULL DEFAULT 'day'",
    "suffix": "TEXT NOT NULL DEFAULT ''",
    "filters": "TEXT NOT NULL DEFAULT '[]'",
    "random_selection": "TEXT NOT NULL DEFAULT '{}'",
    "date_sources": "TEXT NOT NULL DEFAULT '[\"mtime\"]'",
    "filename_pattern": "TEXT NOT NULL DEFAULT ''",
    "mode": "TEXT NOT NULL DEFAULT 'schedule'",
    "poll_seconds": "INTEGER NOT NULL DEFAULT 60",
    "settle_seconds": "INTEGER NOT NULL DEFAULT 120",
    "max_files": "INTEGER NOT NULL DEFAULT 50",
}


class Database:
    def __init__(self, path: str) -> None:
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA foreign_keys = ON")
        with self._lock:
            self._conn.executescript(_SCHEMA)
            self._migrate()

    def _migrate(self) -> None:
        existing = {row["name"] for row in self._conn.execute("PRAGMA table_info(collectors)")}
        for name, ddl in _NEW_COLUMNS.items():
            if name not in existing:
                self._conn.execute(f"ALTER TABLE collectors ADD COLUMN {name} {ddl}")
        self._conn.commit()

    def execute(self, sql: str, params: Iterable[Any] = ()) -> sqlite3.Cursor:
        with self._lock:
            cursor = self._conn.execute(sql, tuple(params))
            self._conn.commit()
            return cursor

    def executemany(self, sql: str, rows: Iterable[Iterable[Any]]) -> None:
        with self._lock:
            self._conn.executemany(sql, [tuple(row) for row in rows])
            self._conn.commit()

    def query(self, sql: str, params: Iterable[Any] = ()) -> list[sqlite3.Row]:
        with self._lock:
            return self._conn.execute(sql, tuple(params)).fetchall()

    def close(self) -> None:
        with self._lock:
            self._conn.close()
