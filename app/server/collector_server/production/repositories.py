from __future__ import annotations

import json
from typing import get_args

from collector_server.shared.database import Database

from .models import Batch, LogKind, Pass, PassStatus, Run, StageRun
from .pieces import VideoData
from .stage_api import StageStep

_PASS_FIELDS = {
    "status", "stage_index", "stage_key", "blocked_reason", "blocked_choices",
    "overrides", "error", "output", "started_at", "finished_at", "steps_used", "blocked_items", "stages",
}
_JSON_FIELDS = {"blocked_choices", "blocked_items", "overrides", "output", "steps_used", "stages"}


class BatchRepository:
    def __init__(self, db: Database) -> None:
        self._db = db

    def create(self, name: str, input_folder: str, pipeline_id: int | None, steps: list[StageStep], run_on: str, output_root: str, now: str,
               folder_pattern: str | None = None, auto_run: bool = True) -> Batch:
        cursor = self._db.execute(
            "INSERT INTO production_batches (name, input_folder, pipeline_id, steps, run_on, output_root, created_at, folder_pattern, auto_run) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (name, input_folder, pipeline_id, json.dumps([step.model_dump() for step in steps]), run_on, output_root, now, folder_pattern, int(auto_run)),
        )
        return self.get(cursor.lastrowid)  # type: ignore[return-value]

    def get(self, batch_id: int) -> Batch | None:
        rows = self._db.query("SELECT * FROM production_batches WHERE id = ?", (batch_id,))
        return self._batch(rows[0]) if rows else None

    def delete(self, batch_id: int) -> None:
        self._db.execute("DELETE FROM production_batches WHERE id = ?", (batch_id,))

    def update(self, batch_id: int, **fields: str) -> None:
        """Only the name, the output folder and the auto run flag can be changed in place."""
        unknown = set(fields) - {"name", "output_root", "auto_run"}
        if unknown:
            raise ValueError(f"Cannot update {', '.join(sorted(unknown))}")
        assignments = ", ".join(f"{name} = ?" for name in fields)
        self._db.execute(f"UPDATE production_batches SET {assignments} WHERE id = ?", (*fields.values(), batch_id))

    def set_pipeline(self, batch_id: int, pipeline_id: int) -> None:
        self._db.execute("UPDATE production_batches SET pipeline_id = ? WHERE id = ?", (pipeline_id, batch_id))

    def by_pipeline(self, pipeline_id: int) -> list[Batch]:
        return [self._batch(row) for row in self._db.query("SELECT * FROM production_batches WHERE pipeline_id = ? ORDER BY id", (pipeline_id,))]

    def list(self) -> list[Batch]:
        return [self._batch(row) for row in self._db.query("SELECT * FROM production_batches ORDER BY id")]

    @staticmethod
    def _batch(row) -> Batch:  # noqa: ANN001
        return Batch(
            id=row["id"], name=row["name"], input_folder=row["input_folder"], run_on=row["run_on"],
            pipeline_id=row["pipeline_id"], steps=[StageStep(**step) for step in json.loads(row["steps"])],
            output_root=row["output_root"], created_at=row["created_at"], folder_pattern=row["folder_pattern"], auto_run=bool(row["auto_run"]),
        )


class RunRepository:
    def __init__(self, db: Database) -> None:
        self._db = db

    def create(self, batch_id: int, now: str) -> Run:
        cursor = self._db.execute(
            "INSERT INTO production_runs (batch_id, number, created_at) "
            "VALUES (?, (SELECT COALESCE(MAX(number), 0) + 1 FROM production_runs WHERE batch_id = ?), ?)",
            (batch_id, batch_id, now),
        )
        return self.get(cursor.lastrowid)  # type: ignore[return-value]

    def get(self, run_id: int) -> Run | None:
        rows = self._db.query("SELECT * FROM production_runs WHERE id = ?", (run_id,))
        return self._run(rows[0]) if rows else None

    def latest(self, batch_id: int) -> Run | None:
        rows = self._db.query("SELECT * FROM production_runs WHERE batch_id = ? ORDER BY number DESC LIMIT 1", (batch_id,))
        return self._run(rows[0]) if rows else None

    def for_batch(self, batch_id: int) -> list[Run]:
        return [self._run(row) for row in self._db.query("SELECT * FROM production_runs WHERE batch_id = ? ORDER BY number", (batch_id,))]

    def delete_except(self, batch_id: int, keep_run_id: int) -> None:
        """Removes the batch's other runs. Their cards and logs go with them; output files on disk stay."""
        self._db.execute("DELETE FROM production_runs WHERE batch_id = ? AND id != ?", (batch_id, keep_run_id))

    @staticmethod
    def _run(row) -> Run:  # noqa: ANN001
        return Run(id=row["id"], batch_id=row["batch_id"], number=row["number"], created_at=row["created_at"])


class PassRepository:
    """The cards of production. A card is one folder of work in a run; the name 'pass' stays in the code."""

    def __init__(self, db: Database) -> None:
        self._db = db

    @property
    def db(self) -> Database:
        return self._db

    def create(self, batch_id: int, now: str, overrides: dict[str, dict] | None = None, *, run_id: int | None = None, folder: str = "",
               status: str = "queued") -> Pass:
        """A card made without a run goes into a new run of its own, so it is still on the board."""
        if run_id is None:
            run_id = RunRepository(self._db).create(batch_id, now).id
        cursor = self._db.execute(
            "INSERT INTO production_cards (batch_id, run_id, folder, number, overrides, created_at, status) "
            "VALUES (?, ?, ?, (SELECT COALESCE(MAX(number), 0) + 1 FROM production_cards WHERE batch_id = ?), ?, ?, ?)",
            (batch_id, run_id, folder, batch_id, json.dumps(overrides or {}), now, status),
        )
        return self.get(cursor.lastrowid)  # type: ignore[return-value]

    def get(self, pass_id: int) -> Pass | None:
        rows = self._db.query("SELECT * FROM production_cards WHERE id = ?", (pass_id,))
        return self._pass(rows[0]) if rows else None

    def folders(self) -> list[str]:
        """The folder of every card in the database."""
        return [row["folder"] for row in self._db.query("SELECT DISTINCT folder FROM production_cards WHERE folder != ''")]

    def for_batch(self, batch_id: int) -> list[Pass]:
        return self._many("SELECT * FROM production_cards WHERE batch_id = ? ORDER BY number", (batch_id,))

    def for_run(self, run_id: int) -> list[Pass]:
        return self._many("SELECT * FROM production_cards WHERE run_id = ? ORDER BY number", (run_id,))

    def delete(self, pass_id: int) -> None:
        self._db.execute("DELETE FROM production_cards WHERE id = ?", (pass_id,))  # its logs go with it; output files stay

    def queued(self) -> list[Pass]:
        # Oldest first. A card put back in the queue after a block keeps its place.
        return self._many("SELECT * FROM production_cards WHERE status = 'queued' ORDER BY id")

    def running(self) -> list[Pass]:
        return self._many("SELECT * FROM production_cards WHERE status = 'running' ORDER BY id")

    def update(self, pass_id: int, only_if_status: PassStatus | None = None, **fields) -> Pass | None:  # noqa: ANN003
        """Change a pass. With only_if_status the change is applied only while the pass is still in that
        status (returns None otherwise), so two threads cannot overwrite each other's decision."""
        unknown = set(fields) - _PASS_FIELDS
        if unknown:
            raise ValueError(f"Cannot update {', '.join(sorted(unknown))}")
        if "status" in fields and fields["status"] not in get_args(PassStatus):
            raise ValueError(f"Unknown status {fields['status']}")
        if fields:
            values = [self._encode(name, value) for name, value in fields.items()]
            assignments = ", ".join(f"{name} = ?" for name in fields)
            guard, extra = (" AND status = ?", (only_if_status,)) if only_if_status else ("", ())
            cursor = self._db.execute(f"UPDATE production_cards SET {assignments} WHERE id = ?{guard}", (*values, pass_id, *extra))
            if cursor.rowcount == 0 and only_if_status:
                return None
        updated = self.get(pass_id)
        if updated is None:
            raise KeyError(pass_id)
        return updated

    @staticmethod
    def _encode(name: str, value):  # noqa: ANN001, ANN205
        if name == "output":
            return value.model_dump_json() if value is not None else None
        return json.dumps(value) if name in _JSON_FIELDS else value

    def _many(self, sql: str, params=()) -> list[Pass]:  # noqa: ANN001
        return [self._pass(row) for row in self._db.query(sql, params)]

    @staticmethod
    def _pass(row) -> Pass:  # noqa: ANN001
        return Pass(
            id=row["id"], batch_id=row["batch_id"], run_id=row["run_id"], folder=row["folder"], number=row["number"], status=row["status"],
            stage_index=row["stage_index"], stage_key=row["stage_key"], blocked_reason=row["blocked_reason"],
            blocked_choices=json.loads(row["blocked_choices"]), blocked_items=json.loads(row["blocked_items"]), overrides=json.loads(row["overrides"]),
            steps_used=[StageStep(**step) for step in json.loads(row["steps_used"])],
            stages=[StageRun(**stage) for stage in json.loads(row["stages"])],
            error=row["error"], output=VideoData.model_validate_json(row["output"]) if row["output"] else None,
            created_at=row["created_at"], started_at=row["started_at"], finished_at=row["finished_at"],
        )


class LogRepository:
    def __init__(self, db: Database) -> None:
        self._db = db

    def add_many(self, pass_id: int, kind: LogKind, rows: list[tuple[str, str]]) -> None:
        """rows are (time, text) pairs."""
        self._db.executemany(
            "INSERT INTO production_logs (card_id, kind, at, text) VALUES (?, ?, ?, ?)", [(pass_id, kind, at, text) for at, text in rows]
        )

    def clear(self, pass_id: int) -> None:
        self._db.execute("DELETE FROM production_logs WHERE card_id = ?", (pass_id,))

    def for_pass(self, pass_id: int, kind: LogKind) -> list[str]:
        return [at_text[1] for at_text in self.entries(pass_id, kind)]

    def entries(self, pass_id: int, kind: LogKind) -> list[tuple[str, str]]:
        """(time, text) pairs in the order they were written."""
        rows = self._db.query("SELECT at, text FROM production_logs WHERE card_id = ? AND kind = ? ORDER BY id", (pass_id, kind))
        return [(row["at"], row["text"]) for row in rows]
