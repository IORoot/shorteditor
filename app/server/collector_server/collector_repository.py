from __future__ import annotations

import sqlite3
import json
from datetime import datetime

from .database import Database
from .domain import CollectorRecord
from .models import CollectorConfig, FilterGroup, RandomSelection, ScheduleDraft


def _to_record(row: sqlite3.Row) -> CollectorRecord:
    weekdays = [int(day) for day in row["weekdays"].split(",") if day]
    last_slot = datetime.fromisoformat(row["last_slot"]) if row["last_slot"] else None
    return CollectorRecord(
        id=row["id"],
        name=row["name"],
        source=row["source"],
        transfer=row["transfer"],
        enabled=bool(row["enabled"]),
        kind=row["kind"],
        time=row["time"],
        weekdays=weekdays,
        day_of_month=row["day_of_month"],
        cron=row["cron"],
        last_slot=last_slot,
        source_type=_stored_source_type(row["source_type"]),
        ssh_host=row["ssh_host"],
        ssh_user=row["ssh_user"],
        ssh_key_path=row["ssh_key_path"],
        output_folder=row["output_folder"],
        folder_template=row["folder_template"],
        group_by="none" if row["group_by"] == "window" else row["group_by"],
        suffix=row["suffix"],
        filters=[FilterGroup.model_validate(group) for group in json.loads(row["filters"])],
        random_selection=RandomSelection.model_validate(json.loads(row["random_selection"])),
        date_source=_stored_source(row["date_sources"]),
        filename_pattern=row["filename_pattern"],
    )


class CollectorRepository:
    def __init__(self, db: Database) -> None:
        self._db = db

    def add(self, name: str, source: str, transfer: str = "move") -> CollectorRecord:
        cursor = self._db.execute(
            "INSERT INTO collectors (name, source, transfer) VALUES (?, ?, ?)", (name, source, transfer)
        )
        record = self.get(int(cursor.lastrowid or 0))
        assert record is not None
        return record

    def delete(self, collector_id: int) -> bool:
        """Removes the collector with its runs and their moves. Callers check that no run is in progress."""
        if self.get(collector_id) is None:
            return False
        self._db.execute("DELETE FROM moves WHERE run_id IN (SELECT id FROM runs WHERE collector_id = ?)", (collector_id,))
        self._db.execute("DELETE FROM runs WHERE collector_id = ?", (collector_id,))
        self._db.execute("DELETE FROM collectors WHERE id = ?", (collector_id,))
        return True

    def add_with_config(self, config: CollectorConfig) -> CollectorRecord:
        record = self.add(config.name, config.input_folder, config.transfer)
        updated = self.update_config(record.id, config)
        assert updated is not None
        return updated

    def update_config(self, collector_id: int, config: CollectorConfig) -> CollectorRecord | None:
        self._db.execute(
            "UPDATE collectors SET name=?, source=?, transfer=?, source_type=?, ssh_host=?, ssh_user=?, ssh_key_path=?, "
            "output_folder=?, folder_template=?, group_by=?, suffix=?, filters=?, random_selection=?, date_sources=?, "
            "filename_pattern=? WHERE id=?",
            (
                config.name,
                config.input_folder,
                config.transfer,
                config.source_type,
                config.host,
                config.user,
                config.key_path,
                config.output_folder,
                config.folder_template,
                config.group_by,
                config.suffix,
                json.dumps([group.model_dump(mode="json") for group in config.filters]),
                json.dumps(config.random_selection.model_dump(mode="json")),
                json.dumps([config.date_source]),
                config.filename_pattern,
                collector_id,
            ),
        )
        return self.get(collector_id)

    def list(self) -> list[CollectorRecord]:
        return [_to_record(row) for row in self._db.query("SELECT * FROM collectors ORDER BY id")]

    def get(self, collector_id: int) -> CollectorRecord | None:
        rows = self._db.query("SELECT * FROM collectors WHERE id = ?", (collector_id,))
        return _to_record(rows[0]) if rows else None

    def save_schedule(self, collector_id: int, draft: ScheduleDraft, cron: str, now: datetime) -> CollectorRecord | None:
        self._db.execute(
            "UPDATE collectors SET enabled=?, kind=?, time=?, weekdays=?, day_of_month=?, cron=?, last_slot=? WHERE id=?",
            (
                int(draft.enabled),
                draft.kind,
                draft.time,
                ",".join(str(day) for day in sorted(set(draft.weekdays))),
                draft.day_of_month,
                cron,
                now.isoformat(),
                collector_id,
            ),
        )
        return self.get(collector_id)

    def set_last_slot(self, collector_id: int, when: datetime) -> None:
        self._db.execute("UPDATE collectors SET last_slot=? WHERE id=?", (when.isoformat(), collector_id))


def _stored_source_type(raw: str) -> str:
    """Collectors saved with the removed Mount source are read back as local folders."""
    return "local" if raw == "mount" else raw


def _stored_source(raw: str) -> str:
    """The column used to hold a list of sources; older values map onto the single choice."""
    values = json.loads(raw) or []
    if "filename" in values:
        return "filename"
    if "created" in values:
        return "created"
    return "modified"
