from __future__ import annotations

from collections.abc import Callable

from .models import LogKind
from .repositories import LogRepository

_LINE_LIMIT = 2000


class LogSink:
    """Collects log lines and writes them in groups of `batch`, each with the time it arrived.

    keep: store at most this many lines, then one closing note. None keeps everything.
    """

    def __init__(self, logs: LogRepository, pass_id: int, kind: LogKind, now: Callable[[], str], batch: int = 1, keep: int | None = None) -> None:
        self._logs, self._pass_id, self._kind, self._now = logs, pass_id, kind, now
        self._batch, self._keep, self._count, self._rows = batch, keep, 0, []

    def __call__(self, line: str) -> None:
        self._count += 1
        if self._keep is not None and self._count > self._keep + 1:
            return
        if self._keep is not None and self._count > self._keep:
            line = "(more lines were not kept)"
        self._rows.append((self._now(), line if len(line) <= _LINE_LIMIT else line[:_LINE_LIMIT] + "…"))
        if len(self._rows) >= self._batch:
            self.flush()

    def flush(self) -> None:
        if self._rows:
            rows, self._rows = self._rows, []
            self._logs.add_many(self._pass_id, self._kind, rows)
