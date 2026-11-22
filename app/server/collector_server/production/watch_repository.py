from __future__ import annotations

import json

from collector_server.shared.database import Database

from .stage_api import StageStep
from .watch_models import Watch


class WatchRepository:
    """Reads the separate watches from before batches could watch, so they can be converted. Nothing new is written here."""

    def __init__(self, db: Database) -> None:
        self._db = db

    def list(self) -> list[Watch]:
        return [self._watch(row) for row in self._db.query("SELECT * FROM production_watches ORDER BY id")]

    def delete(self, watch_id: int) -> None:
        self._db.execute("DELETE FROM production_watch_seen WHERE watch_id = ?", (watch_id,))
        self._db.execute("DELETE FROM production_watches WHERE id = ?", (watch_id,))

    def seen(self, watch_id: int) -> set[str]:
        return {row["folder_path"] for row in self._db.query("SELECT folder_path FROM production_watch_seen WHERE watch_id = ?", (watch_id,))}

    def mark_seen(self, watch_id: int, paths: list[str], at: str) -> None:
        self._db.executemany("INSERT OR IGNORE INTO production_watch_seen (watch_id, folder_path, seen_at) VALUES (?, ?, ?)", [(watch_id, path, at) for path in paths])

    @staticmethod
    def _watch(row) -> Watch:  # noqa: ANN001
        return Watch(
            id=row["id"], name=row["name"], parent_folder=row["parent_folder"], pattern=row["pattern"], name_template=row["name_template"],
            steps=[StageStep(**step) for step in json.loads(row["steps"])], run_on=row["run_on"], output_root=row["output_root"],
            interval_minutes=row["interval_minutes"], settle_minutes=row["settle_minutes"], max_per_check=row["max_per_check"],
            pipeline_id=row["pipeline_id"], enabled=bool(row["enabled"]), created_at=row["created_at"],
            last_checked_at=row["last_checked_at"], last_error=row["last_error"],
            waiting=json.loads(row["waiting"]), created_total=row["created_total"],
        )
