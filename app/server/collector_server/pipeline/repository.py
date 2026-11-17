from __future__ import annotations

import json

from collector_server.shared.database import Database
from collector_server.shared.pipeline import StageStep

from .models import Pipeline


def _dump(steps: list[StageStep]) -> str:
    return json.dumps([step.model_dump() for step in steps])


class PipelineRepository:
    def __init__(self, db: Database) -> None:
        self._db = db

    def create(self, name: str, description: str, steps: list[StageStep], now: str) -> Pipeline:
        cursor = self._db.execute(
            "INSERT INTO pipelines (name, description, steps, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            (name, description, _dump(steps), now, now),
        )
        return self.get(cursor.lastrowid)  # type: ignore[arg-type, return-value]

    def get(self, pipeline_id: int) -> Pipeline | None:
        rows = self._db.query("SELECT * FROM pipelines WHERE id = ?", (pipeline_id,))
        return self._row(rows[0]) if rows else None

    def list(self) -> list[Pipeline]:
        return [self._row(row) for row in self._db.query("SELECT * FROM pipelines ORDER BY id")]

    def update(self, pipeline_id: int, name: str, description: str, steps: list[StageStep], now: str) -> None:
        self._db.execute(
            "UPDATE pipelines SET name = ?, description = ?, steps = ?, updated_at = ? WHERE id = ?",
            (name, description, _dump(steps), now, pipeline_id),
        )

    def set_enabled(self, pipeline_id: int, enabled: bool) -> None:
        self._db.execute("UPDATE pipelines SET enabled = ? WHERE id = ?", (1 if enabled else 0, pipeline_id))

    def delete(self, pipeline_id: int) -> None:
        self._db.execute("DELETE FROM pipelines WHERE id = ?", (pipeline_id,))

    def get_meta(self, key: str) -> str | None:
        rows = self._db.query("SELECT value FROM pipeline_meta WHERE key = ?", (key,))
        return rows[0]["value"] if rows else None

    def set_meta(self, key: str, value: str) -> None:
        self._db.execute("INSERT OR REPLACE INTO pipeline_meta (key, value) VALUES (?, ?)", (key, value))

    @staticmethod
    def _row(row) -> Pipeline:  # noqa: ANN001
        return Pipeline(
            id=row["id"], name=row["name"], description=row["description"], enabled=bool(row["enabled"]),
            steps=[StageStep(**step) for step in json.loads(row["steps"])],
            created_at=row["created_at"], updated_at=row["updated_at"],
        )
