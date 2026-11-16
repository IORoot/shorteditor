from __future__ import annotations

import os

from .domain import RunRecord
from .file_transfer import FileTransfer
from .move_repository import MoveRepository
from .run_repository import RunRepository


class UndoService:
    def __init__(self, moves: MoveRepository, runs: RunRepository, files: FileTransfer) -> None:
        self._moves = moves
        self._runs = runs
        self._files = files

    def undo(self, run_id: int) -> RunRecord:
        run = self._runs.get(run_id)
        if run is None:
            raise LookupError("Run not found")
        if not run.can_undo:
            raise ValueError("This run can't be undone")
        restored, skipped, folders = 0, 0, set()
        for record in reversed(self._moves.for_run(run_id)):
            try:
                if self._reverse(record.transfer, record.source, record.destination):
                    restored += 1
                    folders.add(os.path.dirname(record.destination))
                else:
                    skipped += 1
            except OSError:
                skipped += 1
        for folder in sorted(folders, key=len, reverse=True):
            try:
                os.rmdir(folder)
            except OSError:
                pass
        note = f"Undone: restored {restored}" + (f", {skipped} could not be restored" if skipped else "")
        updated = self._runs.update(run_id, outcome=f"{run.outcome} · {note}", can_undo=False)
        assert updated is not None
        return updated

    def _reverse(self, transfer: str, source: str, destination: str) -> bool:
        if transfer == "move":
            if os.path.lexists(source) or not os.path.lexists(destination):
                return False
            self._files.move(destination, source)
            return True
        if not os.path.lexists(destination):
            return False
        os.remove(destination)
        return True
