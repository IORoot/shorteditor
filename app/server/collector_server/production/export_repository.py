from __future__ import annotations

from collections.abc import Callable

from collector_server.shared.database import Database

from .models import ExportRecord

_FIELDS = {"status", "media_id", "queue_id", "pipeline_id", "folder", "post_type", "caption", "message"}
_FINISHED = ("uploaded", "queued")
# The folder a card works on; a card made without one works on its batch's input folder.
_SOURCE = "COALESCE(NULLIF(c.folder, ''), b.input_folder)"


class ExportRepository:
    """The records of tries to send a card's video to Postiz.

    A record belongs to a batch's folder, not only to a card: Run again replaces a batch's cards, and the
    record of what was already posted has to survive that.
    """

    def __init__(self, db: Database, now: Callable[[], str]) -> None:
        self._db = db
        self._now = now

    def start(self, card_id: int, sha256: str, caption: str) -> int:
        stamp = self._now()
        cursor = self._db.execute(
            "INSERT INTO production_exports (card_id, batch_id, source_folder, batch_name, card_number, sha256, status, caption, created_at, updated_at) "
            f"SELECT c.id, c.batch_id, {_SOURCE}, b.name, c.number, ?, 'uploading', ?, ?, ? "
            "FROM production_cards c JOIN production_batches b ON b.id = c.batch_id WHERE c.id = ?",
            (sha256, caption, stamp, stamp, card_id),
        )
        if cursor.rowcount == 0:
            raise KeyError(card_id)
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
        """The newest record of this card, or of an earlier card of the same batch and folder."""
        rows = self._db.query(
            "SELECT e.* FROM production_exports e WHERE e.card_id = ? OR (e.batch_id, e.source_folder) = "
            f"(SELECT c.batch_id, {_SOURCE} FROM production_cards c JOIN production_batches b ON b.id = c.batch_id WHERE c.id = ?) "
            "ORDER BY e.id DESC LIMIT 1",
            (card_id, card_id),
        )
        return _record(rows[0]) if rows else None

    def mark_checked(self, card_id: int) -> None:
        """The user looked in Postiz after an unclear try: the next try may go ahead."""
        record = self.for_card(card_id)
        if record is not None and record.status == "unclear":
            self.update(record.id, status="checked")

    def by_sha(self, sha256: str) -> ExportRecord | None:
        rows = self._db.query("SELECT * FROM production_exports WHERE sha256 = ? AND status IN (?, ?) ORDER BY id DESC LIMIT 1", (sha256, *_FINISHED))
        return _record(rows[0]) if rows else None

    def list_all(self, limit: int = 200) -> list[ExportRecord]:
        return [_record(row) for row in self._db.query("SELECT * FROM production_exports ORDER BY id DESC LIMIT ?", (limit,))]


def _record(row) -> ExportRecord:  # noqa: ANN001
    return ExportRecord(
        id=row["id"], card_id=row["card_id"], batch_id=row["batch_id"], source_folder=row["source_folder"], sha256=row["sha256"], status=row["status"],
        media_id=row["media_id"], queue_id=row["queue_id"], pipeline_id=row["pipeline_id"], folder=row["folder"], post_type=row["post_type"],
        caption=row["caption"], message=row["message"], created_at=row["created_at"], updated_at=row["updated_at"],
        batch_name=row["batch_name"], card_number=row["card_number"],
    )
