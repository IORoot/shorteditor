from __future__ import annotations

from collections.abc import Callable

from .file_transfer import FileTransfer, TransferError
from .move_repository import MoveRepository
from .transfer_plan import TransferPlan


class TransferExecutor:
    def __init__(self, files: FileTransfer, moves: MoveRepository) -> None:
        self._files = files
        self._moves = moves

    def execute(self, plan: TransferPlan, transfer: str, run_id: int, progress: Callable[[str], None]) -> int:
        total, done = plan.total_files, 0
        verb = {"move": "Moving", "copy": "Copying", "link": "Linking"}[transfer]
        try:
            for group in plan.groups:
                for item in group.files:
                    for folder in self._files.make_folders(item.destination):
                        self._moves.add(run_id, "", folder, "mkdir")
                    self._transfer(transfer, item.source, item.destination)
                    self._moves.add(run_id, item.source, item.destination, transfer)
                    done += 1
                    progress(f"{verb} {done} of {total}…")
        except Exception as error:  # noqa: BLE001 - report which file stopped the run
            raise TransferError(f"Stopped after {done} of {total}: {error}") from error
        return done

    def _transfer(self, transfer: str, source: str, destination: str) -> None:
        if transfer == "move":
            self._files.move(source, destination)
        elif transfer == "copy":
            self._files.copy(source, destination)
        else:
            self._files.link(source, destination)
