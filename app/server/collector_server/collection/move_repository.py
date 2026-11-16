from __future__ import annotations

from .database import Database
from .domain import MoveRecord


class MoveRepository:
    def __init__(self, db: Database) -> None:
        self._db = db

    def add(self, run_id: int, source: str, destination: str, transfer: str) -> None:
        self._db.execute(
            "INSERT INTO moves (run_id, source, destination, transfer) VALUES (?,?,?,?)",
            (run_id, source, destination, transfer),
        )

    def for_run(self, run_id: int) -> list[MoveRecord]:
        rows = self._db.query("SELECT * FROM moves WHERE run_id = ? ORDER BY id", (run_id,))
        return [MoveRecord(r["id"], r["run_id"], r["source"], r["destination"], r["transfer"]) for r in rows]

    def count(self, run_id: int) -> int:
        return int(self._db.query("SELECT COUNT(*) AS n FROM moves WHERE run_id = ? AND transfer != 'mkdir'", (run_id,))[0]["n"])
