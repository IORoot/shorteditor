from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime

_TOKEN = re.compile(r"\{([a-z]+)(?::([^{}]*))?\}")
_DATE_FORMAT = re.compile(r"^(?:YYYY|YY|MM|DD|HH|mm|[-_. ])+$")
_NAMES = {"date", "weekday", "suffix", "window", "counter"}
_UNSAFE = re.compile(r"[\\:\x00]")


@dataclass(frozen=True)
class ClipContext:
    when: datetime
    suffix: str = ""
    window_name: str = ""
    window_start: str = ""
    counter: int = 1


class FolderTemplate:
    def __init__(self, text: str) -> None:
        self._text = text.strip()
        self._check_tokens()
        self._check_path()

    @property
    def text(self) -> str:
        return self._text

    def uses_window(self) -> bool:
        return any(match.group(1) == "window" for match in _TOKEN.finditer(self._text))

    def render(self, context: ClipContext) -> str:
        rendered = _TOKEN.sub(lambda match: self._value(match, context), self._text)
        segments = [_UNSAFE.sub("-", part).strip() for part in rendered.split("/")]
        return "/".join(part for part in segments if part)

    def _check_tokens(self) -> None:
        if not self._text:
            raise ValueError("Folder structure cannot be empty")
        for match in _TOKEN.finditer(self._text):
            name, arg = match.group(1), match.group(2)
            if name not in _NAMES:
                raise ValueError(f"Unknown token {{{name}}}")
            self._check_arg(name, arg)
        leftover = _TOKEN.sub("", self._text)
        if "{" in leftover or "}" in leftover:
            raise ValueError("Unbalanced or malformed braces in folder structure")

    @staticmethod
    def _check_arg(name: str, arg: str | None) -> None:
        if name == "date" and arg is not None and not _DATE_FORMAT.match(arg):
            raise ValueError(f"Invalid date format '{arg}' (use YYYY, YY, MM, DD, HH, mm)")
        if name == "weekday" and arg not in (None, "long"):
            raise ValueError("{weekday} accepts only ':long'")
        if name == "window" and arg not in ("name", "start"):
            raise ValueError("{window} needs ':name' or ':start'")
        if name in ("suffix", "counter") and arg is not None:
            raise ValueError(f"{{{name}}} takes no argument")

    def _check_path(self) -> None:
        if self._text.startswith("/"):
            raise ValueError("Folder structure must be relative to the output folder")
        if any(part == ".." for part in self._text.split("/")):
            raise ValueError("Folder structure cannot contain '..'")

    @staticmethod
    def _value(match: re.Match[str], context: ClipContext) -> str:
        name, arg = match.group(1), match.group(2)
        when = context.when
        if name == "date":
            return FolderTemplate._format_date(arg or "YYYY-MM-DD", when)
        if name == "weekday":
            return f"{when:%A}" if arg == "long" else f"{when:%a}"
        if name == "suffix":
            return context.suffix
        if name == "window":
            return context.window_name if arg == "name" else context.window_start
        return f"{context.counter:02d}"

    @staticmethod
    def _format_date(pattern: str, when: datetime) -> str:
        replacements = {
            "YYYY": f"{when.year:04d}",
            "YY": f"{when.year % 100:02d}",
            "MM": f"{when.month:02d}",
            "DD": f"{when.day:02d}",
            "HH": f"{when.hour:02d}",
            "mm": f"{when.minute:02d}",
        }
        return re.sub("YYYY|YY|MM|DD|HH|mm", lambda m: replacements[m.group(0)], pattern)
