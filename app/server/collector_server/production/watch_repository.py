from __future__ import annotations

import json

from collector_server.shared.database import Database

from .stage_api import StageStep
from .watch_models import Watch, WatchCreate


class WatchRepository:
    def __init__(self, db: Database) -> None:
        self._db = db

    def create(self, data: WatchCreate, now: str) -> Watch:
        cursor = self._db.execute(
            "INSERT INTO production_watches (name, parent_folder, pattern, name_template, steps, run_on, output_root, "
            "interval_minutes, settle_minutes, max_per_check, pipeline_id, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (*self._fields(data), int(data.enabled), now),
        )
        return self.get(cursor.lastrowid)  # type: ignore[return-value]

    def get(self, watch_id: int) -> Watch | None:
        rows = self._db.query("SELECT * FROM production_watches WHERE id = ?", (watch_id,))
        return self._watch(rows[0]) if rows else None

    def list(self) -> list[Watch]:
        return [self._watch(row) for row in self._db.query("SELECT * FROM production_watches ORDER BY id")]

    def update(self, watch_id: int, data: WatchCreate) -> Watch:
        """Change the settings; what the watch has already seen and done is kept."""
        self._db.execute(
            "UPDATE production_watches SET name = ?, parent_folder = ?, pattern = ?, name_template = ?, steps = ?, run_on = ?, "
            "output_root = ?, interval_minutes = ?, settle_minutes = ?, max_per_check = ?, pipeline_id = ?, enabled = ? WHERE id = ?",
            (*self._fields(data), int(data.enabled), watch_id),
        )
        return self._need(watch_id)

    def delete(self, watch_id: int) -> None:
        self._db.execute("DELETE FROM production_watches WHERE id = ?", (watch_id,))

    def set_enabled(self, watch_id: int, enabled: bool) -> Watch:
        self._need(watch_id)
        self._db.execute("UPDATE production_watches SET enabled = ? WHERE id = ?", (int(enabled), watch_id))
        return self._need(watch_id)

    def record_check(self, watch_id: int, at: str, error: str | None, waiting: list[str], created_now: int) -> None:
        self._db.execute(
            "UPDATE production_watches SET last_checked_at = ?, last_error = ?, waiting = ?, created_total = created_total + ? WHERE id = ?",
            (at, error, json.dumps(waiting), created_now, watch_id),
        )

    def seen(self, watch_id: int) -> set[str]:
        return {row["folder_path"] for row in self._db.query("SELECT folder_path FROM production_watch_seen WHERE watch_id = ?", (watch_id,))}

    def clear_seen(self, watch_id: int) -> None:
        self._db.execute("DELETE FROM production_watch_seen WHERE watch_id = ?", (watch_id,))

    def mark_seen(self, watch_id: int, paths: list[str], at: str) -> None:
        self._db.executemany(
            "INSERT OR IGNORE INTO production_watch_seen (watch_id, folder_path, seen_at) VALUES (?, ?, ?)", [(watch_id, path, at) for path in paths]
        )

    def _need(self, watch_id: int) -> Watch:
        found = self.get(watch_id)
        if found is None:
            raise KeyError(watch_id)
        return found

    @staticmethod
    def _fields(data: WatchCreate) -> tuple:
        return (
            data.name, data.parent_folder, data.pattern, data.name_template, "[]",  # steps stay with the pipeline now
            data.run_on, data.output_root, data.interval_minutes, data.settle_minutes, data.max_per_check, data.pipeline_id,
        )

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
