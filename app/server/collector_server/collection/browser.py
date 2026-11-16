from __future__ import annotations

import os

from .models import BrowseEntry, BrowseResult


class FolderBrowser:
    def __init__(self, default: str | None = None) -> None:
        self._default = default

    def list(self, path: str | None) -> BrowseResult:
        target = self._resolve(path)
        if not os.path.isdir(target):
            raise FileNotFoundError(f"Folder not found: {target}")
        entries: list[BrowseEntry] = []
        with os.scandir(target) as scan:
            for entry in scan:
                if entry.name.startswith(".") or not entry.is_dir():
                    continue
                entries.append(BrowseEntry(name=entry.name, path=entry.path))
        entries.sort(key=lambda item: item.name.lower())
        parent = os.path.dirname(target)
        return BrowseResult(path=target, parent=parent if parent != target else None, entries=entries)

    def _resolve(self, path: str | None) -> str:
        if path:
            expanded = os.path.expanduser(path)
            if not os.path.isabs(expanded):
                raise ValueError("Path must be absolute")
            return os.path.normpath(expanded)
        if self._default:
            return self._default
        return "/Volumes" if os.path.isdir("/Volumes") else os.path.expanduser("~")
