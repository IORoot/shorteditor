from __future__ import annotations

import shutil
from collections.abc import Callable
from datetime import datetime

from .worker import Worker

_FALLBACK = "/opt/homebrew/bin"
_LINE_LIMIT = 500


def _binary(name: str) -> str:
    return shutil.which(name) or f"{_FALLBACK}/{name}"


class FfmpegError(Exception):
    def __init__(self, code: int, tail: list[str]) -> None:
        detail = " | ".join(tail)
        super().__init__(f"FFmpeg stopped with code {code}" + (f": {detail}" if detail else ""))
        self.code = code
        self.tail = tail


class FfmpegRunner:
    def __init__(self, worker: Worker, on_line: Callable[[str], None]) -> None:
        self._worker = worker
        self._on_line = on_line

    def run(self, args: list[str]) -> None:
        self._execute([_binary("ffmpeg"), "-hide_banner", "-nostats", "-y", *args], self._on_line)

    def duration(self, path: str) -> float:
        text = self._probe(["-show_entries", "format=duration", "-of", "csv=p=0", f"file:{path}"])
        try:
            return float(text)
        except ValueError as error:
            raise FfmpegError(1, [f"Could not read the length of {path}"]) from error

    def has_audio(self, path: str) -> bool:
        return bool(self._probe(["-select_streams", "a", "-show_entries", "stream=codec_type", "-of", "csv=p=0", f"file:{path}"]))

    def capture_time(self, path: str) -> float | None:
        text = self._probe(["-show_entries", "format_tags=creation_time", "-of", "csv=p=0", f"file:{path}"])
        if not text:
            return None
        try:
            return datetime.fromisoformat(text).timestamp()
        except ValueError:
            return None

    def _probe(self, args: list[str]) -> str:
        lines: list[str] = []
        self._execute([_binary("ffprobe"), "-v", "error", *args], lines.append)
        return lines[-1].strip() if lines else ""

    def _execute(self, argv: list[str], on_line: Callable[[str], None]) -> None:
        tail: list[str] = []

        def handle(line: str) -> None:
            tail.append(line[:_LINE_LIMIT])
            del tail[:-5]
            on_line(line)

        try:
            code = self._worker.run(argv, handle)
        except FileNotFoundError as error:
            raise FfmpegError(127, [f"{argv[0]} was not found"]) from error
        if code != 0:
            raise FfmpegError(code, tail)
