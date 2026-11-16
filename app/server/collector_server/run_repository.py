from __future__ import annotations

import sqlite3
from datetime import datetime

from .database import Database
from .domain import RunRecord


def _to_record(row: sqlite3.Row) -> RunRecord:
    return RunRecord(
        id=row["id"],
        collector_id=row["collector_id"],
        started_at=datetime.fromisoformat(row["started_at"]),
        trigger=row["trigger"],
        status=row["status"],
        outcome=row["outcome"],
        can_undo=bool(row["can_undo"]),
    )


class RunRepository:
    def __init__(self, db: Database) -> None:
        self._db = db

    def add(
        self,
        collector_id: int,
        started_at: datetime,
        trigger: str,
        status: str,
        outcome: str,
        can_undo: bool = False,
    ) -> RunRecord:
        cursor = self._db.execute(
            "INSERT INTO runs (collector_id, started_at, trigger, status, outcome, can_undo) VALUES (?,?,?,?,?,?)",
            (collector_id, started_at.isoformat(), trigger, status, outcome, int(can_undo)),
        )
        rows = self._db.query("SELECT * FROM runs WHERE id = ?", (cursor.lastrowid,))
        return _to_record(rows[0])

    def get(self, run_id: int) -> RunRecord | None:
        rows = self._db.query("SELECT * FROM runs WHERE id = ?", (run_id,))
        return _to_record(rows[0]) if rows else None

    def update(
        self,
        run_id: int,
        status: str | None = None,
        outcome: str | None = None,
        can_undo: bool | None = None,
    ) -> RunRecord | None:
        fields = {"status": status, "outcome": outcome, "can_undo": None if can_undo is None else int(can_undo)}
        changes = {name: value for name, value in fields.items() if value is not None}
        if changes:
            assignments = ", ".join(f"{name} = ?" for name in changes)
            self._db.execute(f"UPDATE runs SET {assignments} WHERE id = ?", (*changes.values(), run_id))
        return self.get(run_id)

    def recent(self, collector_id: int, limit: int = 5) -> list[RunRecord]:
        rows = self._db.query(
            "SELECT * FROM runs WHERE collector_id = ? ORDER BY started_at DESC, id DESC LIMIT ?",
            (collector_id, limit),
        )
        return [_to_record(row) for row in rows]
