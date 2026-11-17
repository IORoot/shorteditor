from __future__ import annotations

import re
import shlex

from .stage_api import StageError

# Options that name another input, output, log, preset or filter file are refused, so a pass only reads and writes its own clips.
BLOCKED_NAMES = {
    "i", "f", "y", "n", "attach", "map_metadata", "protocol_whitelist", "protocol_blacklist", "filter_script", "filter_complex_script",
    "passlogfile", "progress", "vstats_file", "stats_file", "report", "dump_attachment", "fontfile", "vpre", "apre", "spre", "fpre",
}
BLOCKED_INSIDE = ("movie=", "amovie=", "subtitles=", "ass=", "lut3d=", "lut=", "haldclut=", "sendcmd=", "textfile=", "fontfile=", "concat:", "file:", "http:", "https:", "pipe:")
PLACEHOLDERS = {"{input}", "{output}"}
# Options that take no value, so a bare file name after them is a second output, not a value.
NO_VALUE = {"an", "vn", "sn", "dn", "nostdin", "nostats", "hide_banner", "stats", "shortest"}
_BRACES = re.compile(r"\{[^{}]*\}")


def split_options(text: str) -> list[str]:
    try:
        return shlex.split(text, posix=True)
    except ValueError as error:
        raise StageError(f"The FFmpeg options have an unclosed quote: {error}") from error


def check_options(args: list[str]) -> None:
    expects_value = False
    for arg in args:
        if arg.startswith("-"):
            name = arg.lstrip("-").split(":")[0].lower()
            if name in BLOCKED_NAMES:
                raise StageError(f"FFmpeg option {arg} is not allowed here. Options cannot read or write other files")
            expects_value = name not in NO_VALUE
        elif arg in PLACEHOLDERS and (expects_value or arg == "{output}"):
            expects_value = False
        elif expects_value:
            expects_value = False
        else:
            raise StageError(f"FFmpeg option {arg} is a file name. Only {{output}} can name the output")
        if any(name in arg for name in BLOCKED_INSIDE):
            raise StageError(f"FFmpeg option {arg} is not allowed here. Options cannot read or write other files")
        if "/" in arg or "\\" in arg:
            raise StageError(f"FFmpeg option {arg} has a file path. Use {{input}} and {{output}} instead")
        for brace in _BRACES.findall(arg):
            if brace not in PLACEHOLDERS:
                raise StageError(f"Only {{input}} and {{output}} can be used in FFmpeg options, not {brace}")


def fill_placeholders(args: list[str], input_path: str, output_path: str) -> list[str]:
    return [arg.replace("{input}", input_path).replace("{output}", output_path) for arg in args]
