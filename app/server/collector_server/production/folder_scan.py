from __future__ import annotations

import os
import re
import unicodedata
from dataclasses import dataclass, field

from .errors import InvalidInputError

MAX_FOLDERS = 2000
MAX_FILES = 5000  # entries (files and folders) looked at inside one folder
_VIDEO = {".mp4", ".mov"}


@dataclass
class Candidate:
    name: str
    path: str
    clip_count: int
    newest_change: float | None
    match: re.Match[str] = field(repr=False)
    incomplete: bool = False  # something inside could not be read, or the folder is bigger than we look at


@dataclass
class ScanResult:
    matches: list[Candidate]
    not_matching: int
    truncated: bool = False  # there were more folders than we look at


def scan_parent(parent: str, pattern: re.Pattern[str]) -> ScanResult:
    """The folders directly inside `parent` whose whole name matches the pattern, with what is in them."""
    if not os.path.isdir(parent):
        raise InvalidInputError(f"The folder {parent} does not exist")
    base = os.path.abspath(parent)
    inside = os.path.realpath(base).rstrip(os.sep) + os.sep
    try:
        names = sorted(os.listdir(base))
    except OSError as error:
        raise InvalidInputError(f"The folder {parent} cannot be read: {error.strerror}") from error
    matches: list[Candidate] = []
    not_matching = looked_at = 0
    truncated = False
    seen_real: set[str] = set()
    for name in names:
        if name.startswith("."):
            continue
        try:
            name.encode()
        except UnicodeEncodeError:
            continue  # a name that cannot be stored
        path = os.path.join(base, name)
        if not os.path.isdir(path):
            continue
        real = os.path.realpath(path)
        if not (real + os.sep).startswith(inside) or real in seen_real:
            continue  # a link that leaves the parent folder, or a second way to the same folder
        seen_real.add(real)
        looked_at += 1
        if looked_at > MAX_FOLDERS:
            truncated = True
            break
        shown = unicodedata.normalize("NFC", name)  # Macs and NASes disagree about accents
        found = pattern.fullmatch(shown)
        if found is None:
            not_matching += 1
            continue
        clips, newest, incomplete = _inspect(real)
        matches.append(Candidate(shown, path, clips, newest, found, incomplete))
    return ScanResult(matches, not_matching, truncated)


def _inspect(folder: str) -> tuple[int, float | None, bool]:
    """Videos inside a folder, when anything inside last changed, and whether all of it could be read.

    Links to files outside the folder do not count. Every entry counts toward MAX_FILES, so a huge tree
    is cut short (and reported incomplete) instead of walked for minutes.
    """
    clips = seen = 0
    newest = _mtime(folder)
    incomplete = False
    pending = [folder]
    while pending:
        current = pending.pop()
        try:
            with os.scandir(current) as entries:
                for entry in entries:
                    seen += 1
                    if seen > MAX_FILES:
                        return clips, newest, True
                    if entry.is_dir(follow_symlinks=False):
                        pending.append(entry.path)
                        newest = _latest(newest, _entry_mtime(entry))
                        continue
                    if entry.is_symlink() and not (os.path.realpath(entry.path) + os.sep).startswith(folder + os.sep):
                        continue
                    changed = _entry_mtime(entry)
                    if changed is None:
                        continue  # a dangling link, or gone while we looked
                    newest = _latest(newest, changed)
                    if os.path.splitext(entry.name)[1].lower() in _VIDEO:
                        clips += 1
        except OSError:
            incomplete = True
    return clips, newest, incomplete


def _entry_mtime(entry: os.DirEntry[str]) -> float | None:
    try:
        return entry.stat().st_mtime
    except OSError:
        return None


def _mtime(path: str) -> float | None:
    try:
        return os.stat(path).st_mtime
    except OSError:
        return None


def _latest(a: float | None, b: float | None) -> float | None:
    return b if a is None else a if b is None else max(a, b)
