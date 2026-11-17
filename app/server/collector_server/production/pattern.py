from __future__ import annotations

import re

from .errors import InvalidInputError

MAX_PATTERN = 200
MAX_NAME = 120
_PLACEHOLDER = re.compile(r"\{([^{}]*)\}")
_CONTROL = re.compile(r"[\x00-\x1f\x7f]+")


def compile_pattern(text: str) -> re.Pattern[str]:
    """The user's folder-name pattern, refused when it is too long, invalid, or shaped to run away."""
    if len(text) > MAX_PATTERN:
        raise InvalidInputError(f"The pattern is too long (at most {MAX_PATTERN} characters)")
    try:
        compiled = re.compile(text)
    except re.error as error:
        raise InvalidInputError(f"The pattern is not valid: {error}") from error
    if _can_run_away(text):
        raise InvalidInputError("The pattern could take far too long to match. Avoid nested repeats like (a+)+, many repeats in a row, and long lists of alternatives")
    return compiled


_NO_GO = re.compile(r"\(\?#|\(\?[a-zA-Z-]*x[a-zA-Z-]*[:)]")  # comments and verbose mode hide a repeat from the check
MAX_UNBOUNDED = 3
MAX_REPEATS = 10


def _can_run_away(text: str) -> bool:
    """True for shapes that make Python's regex engine take far too long on a short name.

    Refused: a group that holds a repeat, an optional part or an alternation and is itself repeated
    ((a+)+, (a|aa)*, (a?){30}); more than 3 open-ended repeats (a*a*a*a*b); more than 10 repeats or
    alternatives in all ((.|.)(.|.)...); comments and verbose mode, which can hide a repeat from this check.

    shortcut: a structural check on the text, not a proof (`re` has no timeout); it also refuses a few
    harmless patterns such as (a|b)+. Folder names are short and the pattern is at most 200 characters.
    """
    if _NO_GO.search(text):
        return True
    stack: list[bool] = []  # per open group: does it hold a repeat, an optional part or an alternation?
    open_ended = repeats = 0
    in_class = False
    i = 0
    while i < len(text):
        char = text[i]
        if char == "\\":
            i += 2
            continue
        if in_class:
            in_class = char != "]"
        elif char == "[":
            in_class = True
        elif char == "(":
            stack.append(False)
        elif char == ")" and stack:
            inner = stack.pop()
            if inner and i + 1 < len(text) and text[i + 1] in "*+{":
                return True
            if stack and (inner or (i + 1 < len(text) and text[i + 1] in "*+{")):
                stack[-1] = True
        elif char == "|":
            if stack:
                stack[-1] = True
            repeats += 1  # a long list of alternatives can be as slow as a repeat
            if repeats > MAX_REPEATS:
                return True
        elif char in "*+?{" and not (char == "?" and text[i - 1] in "(*+?}"):
            repeats += 1
            if stack:
                stack[-1] = True
            if char in "*+" or (char == "{" and re.match(r"\{\d+,\}", text[i:])):
                open_ended += 1
            if open_ended > MAX_UNBOUNDED or repeats > MAX_REPEATS:
                return True
        i += 1
    return False


def check_template(template: str, pattern: re.Pattern[str]) -> None:
    """Refuse a name template that uses a placeholder the pattern cannot fill."""
    if len(template) > MAX_PATTERN:
        raise InvalidInputError("The name template is too long")
    for key in _PLACEHOLDER.findall(template):
        if key == "name":
            continue
        known = (key.isascii() and key.isdigit() and 1 <= int(key) <= pattern.groups) or key in pattern.groupindex
        if not known:
            raise InvalidInputError(f"The name template uses {{{key}}}, which the pattern does not have")


def render_name(template: str, match: re.Match[str], folder: str) -> str:
    def fill(found: re.Match[str]) -> str:
        key = found.group(1)
        if key == "name":
            return folder
        return match.group(int(key) if key.isdigit() else key) or ""

    text = _CONTROL.sub(" ", _PLACEHOLDER.sub(fill, template))
    text = " ".join(text.split())[:MAX_NAME].strip()
    return text or folder[:MAX_NAME]
