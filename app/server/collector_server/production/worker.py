from __future__ import annotations

import subprocess
from collections.abc import Callable
from typing import Protocol


class Worker(Protocol):
    id: str

    def run(self, argv: list[str], on_line: Callable[[str], None]) -> int: ...


class LocalWorker:
    """Runs commands on this computer. The argument list is never passed through a shell."""

    def __init__(self, id: str = "local") -> None:
        self.id = id

    def run(self, argv: list[str], on_line: Callable[[str], None]) -> int:
        process = subprocess.Popen(
            argv, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, errors="replace"
        )
        assert process.stdout is not None
        try:
            for line in process.stdout:
                on_line(line.rstrip("\n"))
        except BaseException:
            process.kill()  # nobody reads the pipe any more, so it would hang
            process.wait()
            raise
        return process.wait()
