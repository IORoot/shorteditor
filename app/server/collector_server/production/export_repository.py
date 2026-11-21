from __future__ import annotations

from collections.abc import Callable

from collector_server.shared.database import Database

from .models import ExportRecord

_FIELDS = {"status", "media_id", "queue_id", "pipeline_id", "folder", "post_type", "caption", "message"}
_FINISHED = ("uploaded", "queued")


class ExportRepository:
    """The records of tries to send a card's video to Postiz."""

    def __init__(self, db: Database, now: Callable[[], str]) -> None:
        self._db = db
        self._now = now

    def start(self, card_id: int, sha256: str, caption: str) -> int:
        stamp = self._now()
        cursor = self._db.execute(
            "INSERT INTO production_exports (card_id, sha256, status, caption, created_at, updated_at) VALUES (?, ?, 'uploading', ?, ?, ?)",
            (card_id, sha256, caption, stamp, stamp),
        )
        return cursor.lastrowid  # type: ignore[return-value]

    def update(self, record_id: int, **fields) -> None:  # noqa: ANN003
        unknown = set(fields) - _FIELDS
        if unknown:
            raise ValueError(f"Cannot update {', '.join(sorted(unknown))}")
        assignments = ", ".join([*(f"{name} = ?" for name in fields), "updated_at = ?"])
        self._db.execute(f"UPDATE production_exports SET {assignments} WHERE id = ?", (*fields.values(), self._now(), record_id))

    def delete(self, record_id: int) -> None:
        self._db.execute("DELETE FROM production_exports WHERE id = ?", (record_id,))

    def for_card(self, card_id: int) -> ExportRecord | None:
        rows = self._db.query(f"{_SELECT} WHERE e.card_id = ? ORDER BY e.id DESC LIMIT 1", (card_id,))
        return _record(rows[0]) if rows else None

    def by_sha(self, sha256: str) -> ExportRecord | None:
        rows = self._db.query(f"{_SELECT} WHERE e.sha256 = ? AND e.status IN (?, ?) ORDER BY e.id DESC LIMIT 1", (sha256, *_FINISHED))
        return _record(rows[0]) if rows else None

    def list_all(self, limit: int = 200) -> list[ExportRecord]:
        return [_record(row) for row in self._db.query(f"{_SELECT} ORDER BY e.id DESC LIMIT ?", (limit,))]


_SELECT = (
    "SELECT e.*, b.name AS batch_name, c.number AS card_number FROM production_exports e "
    "JOIN production_cards c ON c.id = e.card_id JOIN production_batches b ON b.id = c.batch_id"
)


def _record(row) -> ExportRecord:  # noqa: ANN001
    return ExportRecord(
        id=row["id"], card_id=row["card_id"], sha256=row["sha256"], status=row["status"], media_id=row["media_id"], queue_id=row["queue_id"],
        pipeline_id=row["pipeline_id"], folder=row["folder"], post_type=row["post_type"], caption=row["caption"], message=row["message"],
        created_at=row["created_at"], updated_at=row["updated_at"], batch_name=row["batch_name"], card_number=row["card_number"],
    )
