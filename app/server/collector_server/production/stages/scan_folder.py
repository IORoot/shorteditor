from __future__ import annotations

import os
from typing import Annotated

from pydantic import Field, StringConstraints

from collector_server.shared.camel_model import CamelModel

from ..ffmpeg import FfmpegError
from ..pieces import Piece, PiecesData
from ..stage_api import StageContext, StageError


class ScanSettings(CamelModel):
    include_subfolders: bool = True
    extensions: list[Annotated[str, StringConstraints(pattern=r"^\.?[A-Za-z0-9]{1,10}$")]] = Field(["mp4", "mov"], max_length=20)
    max_files: int = Field(5000, ge=1, le=100_000)
    min_length: float = Field(1.0, ge=0, allow_inf_nan=False)


class ScanFolder:
    key = "scan_folder"
    title = "Scan folder"
    settings_model = ScanSettings
    transitions = {"none": "pieces"}
    position = "first"

    def run(self, data: None, settings: ScanSettings, ctx: StageContext) -> PiecesData:
        folder = ctx.input_folder
        if not os.path.isdir(folder):
            raise StageError(f"The folder {folder} does not exist")
        wanted = {"." + ext.lower().lstrip(".") for ext in settings.extensions}
        items: list[Piece] = []
        too_short: list[str] = []
        for path in self._files(folder, settings.include_subfolders, settings.max_files, ctx.log):
            if os.path.splitext(path)[1].lower() not in wanted:
                continue
            try:
                duration = ctx.ffmpeg.duration(path)
            except FfmpegError as error:
                if error.code == 127:
                    raise StageError("FFmpeg is not installed") from error
                reason = error.tail[-1] if error.tail else str(error)
                ctx.log(f"Skipped {os.path.basename(path)}: it could not be read ({reason})")
                continue
            if duration <= 0 or duration < settings.min_length:
                too_short.append(os.path.basename(path))
                continue
            items.append(Piece(clip=path, clip_duration=duration))
        if too_short:
            shown = ", ".join(too_short[:5]) + (f" and {len(too_short) - 5} more" if len(too_short) > 5 else "")
            ctx.log(f"Skipped {len(too_short)} clip{'s' if len(too_short) != 1 else ''} shorter than {settings.min_length:g} s: {shown}")
        if not items:
            raise StageError(f"No clips found in {folder}")
        ctx.log(f"Found {len(items)} clips")
        return PiecesData(items=items)

    @staticmethod
    def _files(folder: str, recursive: bool, limit: int, log) -> list[str]:
        found: list[str] = []
        # shortcut: symlinked folders are not followed, symlinked files are; revisit if a library uses links
        for root, dirs, files in os.walk(folder, onerror=lambda e: log(f"Skipped folder {e.filename}: {e.strerror}")):
            dirs[:] = [d for d in dirs if not d.startswith(".")]
            found += [os.path.join(root, name) for name in files if not name.startswith(".")]
            if len(found) > limit:
                raise StageError(f"The folder holds more than {limit} files. Pick a smaller folder")
            if not recursive:
                break
        return sorted(os.path.abspath(path) for path in found)


STAGE = ScanFolder()
