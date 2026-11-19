from __future__ import annotations

import base64
import glob
import json
import os
import re
import time
import urllib.error
import urllib.request
from typing import Any

from pydantic import Field, field_validator

from collector_server.shared.camel_model import CamelModel

from ..pieces import Piece, PiecesData
from ..stage_api import StageContext, StageError
from . import detect_cache

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
MAX_FRAMES = 120  # shortcut: frames per piece are capped at this many, so long pieces get a lower frame rate; raise if clips need finer detail
MAX_ANSWER_RETRIES = 2  # shortcut: each clip is asked again at most this many times; raise if answers are often fixed by a second ask
TIME_SLACK = 0.5  # seconds past the clip's edges that a timestamp may run before it counts as wrong
BUILT_IN = ("SOURCE_NAME", "DURATION_SECONDS", "MAX_CUT_CONTEXT_SECONDS")  # filled in for every clip
RESERVED = (*BUILT_IN, "PROBLEMS")  # PROBLEMS is only filled in for the invalid timestamp prompt
_NAME = re.compile(r"[A-Za-z_][A-Za-z0-9_]{0,39}")
_PLACEHOLDER = re.compile(r"\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}")

DEFAULT_RETRY = "Your answer could not be read. Answer again with only the JSON in the format from the instructions, and no other text."
DEFAULT_OUTPUT_LIMIT = "Your answer was cut off because it was too long. Answer again with fewer intervals, joining neighbouring ones, and only the JSON in the format from the instructions."
DEFAULT_INVALID = "These timestamps were invalid: {{PROBLEMS}}. Answer again with every interval inside 0 and {{DURATION_SECONDS}} seconds, with end after start, and only the JSON in the format from the instructions."
DEFAULT_VARIABLES = {"MAX_MODEL_SECTION_SECONDS": "30", "MAX_CLASS_CUT_SECONDS": "60"}


class DetectSettings(CamelModel):
    prompt: str = Field(
        """Find usable action clips in the full parkour practice video {{SOURCE_NAME}}, duration {{DURATION_SECONDS}} seconds. Detect individual attempts and repetitions: approaches into skills, jumps, vaults, climbs, swings, flips, wall runs, balance, drops, catches, transitions, and landings. The goal is to trim boring gaps, not to keep only highlight instants. Preserve each distinct practice attempt as its own interval, including its connected approach, obstacle interaction, landing, and immediate recovery/repositioning. A cautious climb, controlled traverse, incomplete attempt, or ordinary-looking movement on an obstacle still counts as parkour practice. Exclude only clearly unrelated talking, prolonged waiting, and walking between attempts. Inspect the entire timeline and segment at each real restart: a new approach, reset, separate obstacle attempt, or resumed movement after a pause starts a new clip. Do not merge several distinct attempts into one long interval; do not split one continuous attempt into tiny action labels. If the video visibly contains multiple distinct attempts, return at least two separate intervals. Prefer preserving a complete attempt over tight highlight-only boundaries. Never omit visible practice just because a precise boundary is uncertain; estimate the nearest reasonable visible source times. Do not invent off-screen actions or timestamps. Return intervals in chronological order, separated only where there is an obvious boring gap or a distinct new attempt. Keep continuous useful movement together. Use seconds from ORIGINAL source start, not proxy time, frames, percentages, or fractions; the supplied proxy has the same duration and playback speed as the source. Check timestamps against the complete timeline and each attempt. Each model interval must be at most {{MAX_MODEL_SECTION_SECONDS}} seconds because the editor adds up to {{MAX_CUT_CONTEXT_SECONDS}} seconds on each side; Prefer keeping each final edited cut at or below {{MAX_CLASS_CUT_SECONDS}} seconds. If connected attempts merge into a longer cut after buffering, warn with the final duration and continue without blocking or truncating it. Split a longer continuous attempt only at a natural pause/reset when visible. Use minimum 0.5-second intervals, maximum 30 intervals, non-overlapping, descriptive concise action labels. JSON only: {"sections":[{"start":1.0,"end":5.0,"action":"climb attempt"},{"start":8.0,"end":12.0,"action":"vault attempt"}]} Select at least two distinct separated clips from this source when two practice attempts are visible; split at the visible reset or new approach. Do not satisfy the clip count by splitting continuous motion arbitrarily. Segment by attempt, not by named skill: keep a single try's linked movements together, but split whenever the participant resets or begins a separate repetition.""",
        min_length=1,
        max_length=4000,
        title="Prompt",
        description="What to look for, and the answer format the stage can read. Use {{NAME}} for a variable: the built-in SOURCE_NAME, DURATION_SECONDS and MAX_CUT_CONTEXT_SECONDS, or one of your own below.",
    )
    variables: dict[str, str] = Field(
        default_factory=lambda: dict(DEFAULT_VARIABLES),
        max_length=30,
        title="Variables",
        description="Your own values for {{NAME}} in the prompts, such as MAX_CLASS_CUT_SECONDS = 60. Names are letters, digits and underscores.",
    )
    retry_prompt: str = Field(DEFAULT_RETRY, min_length=1, max_length=4000, title="Retry prompt", description="Sent when the answer cannot be read, so the model answers again.")
    output_limit_retry_prompt: str = Field(DEFAULT_OUTPUT_LIMIT, min_length=1, max_length=4000, title="Output-limit retry prompt", description="Sent when the model's answer is cut off by its length limit.")
    invalid_timestamp_prompt: str = Field(DEFAULT_INVALID, min_length=1, max_length=4000, title="Invalid timestamp prompt", description="Sent when intervals have bad times. {{PROBLEMS}} lists the bad ones.")
    frames_per_second: float = Field(1.0, ge=0.1, le=2.0, title="Frames per second", description="How many frames a second are sent to the model.")
    padding_before: float = Field(0.25, ge=0, le=10, title="Padding before (seconds)", description="Extra time kept before each action.")
    padding_after: float = Field(0.25, ge=0, le=10, title="Padding after (seconds)", description="Extra time kept after each action.")
    merge_gap: float = Field(1.0, ge=0, le=30, title="Join actions closer than (seconds)", description="Actions this close together become one part.")
    min_action: float = Field(0.5, ge=0, le=30, title="Drop actions shorter than (seconds)", description="Very short parts are left out.")
    reuse_results: bool = Field(True, title="Reuse saved results", description="Do not ask the model again about a clip it has already seen with these settings.")

    @field_validator("variables")
    @classmethod
    def _names_are_usable(cls, value: dict[str, str]) -> dict[str, str]:
        for name, text in value.items():
            if not _NAME.fullmatch(name):
                raise ValueError(f"{name} is not a usable name. Use letters, digits and underscores, starting with a letter")
            if name in RESERVED:
                raise ValueError(f"{name} is built in. Pick another name")
            if len(text) > 500:
                raise ValueError(f"The value of {name} is longer than 500 characters")
        return value


class ClipRefused(Exception):
    """OpenRouter would not look at this clip's frames, so the clip is skipped rather than failing the batch."""


class DetectAction:
    key = "detect_action"
    title = "Detect action"
    description = "Asks an AI model for the start and end of every action in each clip, and keeps only those parts."
    settings_model = DetectSettings
    transitions = {"pieces": "pieces"}
    position = "any"

    def run(self, data: PiecesData, settings: DetectSettings, ctx: StageContext) -> PiecesData:
        key = (ctx.ai_key or "").strip()
        if not key:
            raise StageError("Add your OpenRouter key in Settings to use Detect action")
        check_variables(settings)
        found: list[Piece] = []
        for number, piece in enumerate(data.items):
            name = os.path.basename(piece.clip)
            raw = self._saved_or_asked(piece, number, settings, ctx, key)
            parts = tidy_parts(raw, piece.length, settings.padding_before, settings.padding_after, settings.merge_gap, settings.min_action)
            for start, end in parts:
                found.append(piece.model_copy(update={"start": piece.start + start, "end": piece.start + end}))
            ctx.log(f"{name}: {len(parts)} action parts")
        if not found:
            raise StageError("The AI found no action in these clips")
        ctx.log(f"Found {len(found)} action parts")
        return PiecesData(items=found)

    @staticmethod
    def _saved_or_asked(piece: Piece, number: int, settings: DetectSettings, ctx: StageContext, key: str) -> list[tuple[float, float]]:
        """The model's raw parts for this piece, from the saved results when they exist for the same settings."""
        cache_key = None
        if ctx.cache_root and settings.reuse_results:
            stat = os.stat(piece.clip)
            # every prompt and variable decides the answer, so all of them are part of the key
            asked = json.dumps([settings.prompt, settings.retry_prompt, settings.output_limit_retry_prompt, settings.invalid_timestamp_prompt, settings.variables], sort_keys=True)
            cache_key = detect_cache.cache_key(ctx.ai_model, asked, settings.frames_per_second, piece.clip, stat.st_size, stat.st_mtime, piece.start, piece.end or piece.clip_duration)
            saved = detect_cache.load(ctx.cache_root, cache_key)
            if saved is not None:
                ctx.log(f"Reused the saved result for {os.path.basename(piece.clip)}")
                return saved
        frames_dir = os.path.join(ctx.work_dir, f"frames-{number}")
        os.makedirs(frames_dir, exist_ok=True)
        fps = min(settings.frames_per_second, MAX_FRAMES / piece.length)
        frames = extract_frames(ctx, piece, frames_dir, fps)
        name = os.path.basename(piece.clip)
        ctx.log(f"Sending {len(frames)} frames of {name} to {ctx.ai_model}")
        values = clip_values(settings, name, piece.length)
        first = render(settings.prompt, values)
        try:
            raw = ask_until_usable(ctx, settings, values, first_content(first, frames, piece.length), piece.length, key)
        except ClipRefused:
            # not saved, so the next run asks again
            ctx.log(f"Skipped {name}: OpenRouter refused its frames (content safety screening)")
            return []
        if cache_key is not None:
            detect_cache.save(ctx.cache_root, cache_key, raw)
        return raw


def check_variables(settings: DetectSettings) -> None:
    """Refuses a prompt that names a variable nobody defined, before any clip is sent."""
    known = set(BUILT_IN) | set(settings.variables)
    for label, text, extra in (
        ("prompt", settings.prompt, set()),
        ("retry prompt", settings.retry_prompt, set()),
        ("output-limit retry prompt", settings.output_limit_retry_prompt, set()),
        ("invalid timestamp prompt", settings.invalid_timestamp_prompt, {"PROBLEMS"}),
    ):
        unknown = sorted(set(_PLACEHOLDER.findall(text)) - known - extra)
        if unknown:
            names = ", ".join("{{" + name + "}}" for name in unknown)
            raise StageError(f"The {label} uses {names}, which is not a variable. Define it under Variables, or use a built-in name")


def clip_values(settings: DetectSettings, name: str, duration: float) -> dict[str, str]:
    """What each {{NAME}} stands for in this clip: the built-ins, then the user's own variables."""
    return {
        "SOURCE_NAME": name,
        "DURATION_SECONDS": f"{duration:.1f}",
        "MAX_CUT_CONTEXT_SECONDS": f"{max(settings.padding_before, settings.padding_after):g}",
        **settings.variables,
    }


def render(template: str, values: dict[str, str]) -> str:
    """The template with each {{NAME}} replaced by its value."""
    return _PLACEHOLDER.sub(lambda match: values[match.group(1)], template)


def first_content(prompt: str, frames: list[str], length: float) -> list[dict[str, Any]]:
    """The first message: the prompt, then each frame with its time so the answer can use seconds."""
    step = length / max(1, len(frames))
    content: list[dict[str, Any]] = [{"type": "text", "text": prompt}]
    for index, path in enumerate(frames):
        with open(path, "rb") as image:
            encoded = base64.b64encode(image.read()).decode("ascii")
        content.append({"type": "text", "text": f"Frame at {index * step:.1f} s"})
        content.append({"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{encoded}"}})
    return content


def ask_until_usable(ctx: StageContext, settings: DetectSettings, values: dict[str, str], first: list[dict[str, Any]], length: float, key: str) -> list[tuple[float, float]]:
    """Asks the model, then asks again in the same conversation while its answer is cut off, unreadable or has bad times."""
    messages: list[dict[str, Any]] = [{"role": "user", "content": first}]
    retries = 0
    while True:
        sent_at = time.monotonic()
        text, finish = send(ctx.ai_model, messages, key)
        ctx.log(f"Answer from {ctx.ai_model} after {time.monotonic() - sent_at:.0f} s: {len(text)} characters, stopped because {finish}")
        messages.append({"role": "assistant", "content": text})
        parts: list[tuple[float, float]] = []
        if finish == "length":
            reason, follow = "the answer was cut off", render(settings.output_limit_retry_prompt, values)
        else:
            items = read_sections(text)
            if items is None:
                reason, follow = "the answer could not be read", render(settings.retry_prompt, values)
            else:
                parts, problems = check_sections(items, length)
                if not problems:
                    return parts
                reason = "some timestamps were invalid"
                follow = render(settings.invalid_timestamp_prompt, {**values, "PROBLEMS": "; ".join(problems)})
        if retries == MAX_ANSWER_RETRIES:
            ctx.log(f"Stopped asking again ({reason}); keeping the usable intervals")
            return parts
        retries += 1
        ctx.log(f"Asking again, {retries} of {MAX_ANSWER_RETRIES} ({reason})")
        messages.append({"role": "user", "content": follow})


def send(model: str, messages: list[dict[str, Any]], key: str) -> tuple[str, str]:
    """The model's answer text and why it stopped ("length" when it ran out of room)."""
    body = json.dumps({"model": model, "messages": messages}).encode("utf-8")
    request = urllib.request.Request(OPENROUTER_URL, data=body, headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            reply = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        if error.code == 422:
            raise ClipRefused() from error
        if error.code in (401, 403):
            raise StageError("OpenRouter did not accept the key. Check it in Settings") from error
        if error.code == 404:
            raise StageError(f"OpenRouter does not know the model {model}. Check the model in Settings") from error
        raise StageError(f"OpenRouter answered {error.code}. Try again, or check the model in Settings") from error
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        raise StageError("Could not reach OpenRouter. Check the connection") from error
    try:
        choice = reply["choices"][0]
        return str(choice["message"]["content"] or ""), str(choice.get("finish_reason") or "")
    except (KeyError, IndexError, TypeError) as error:
        raise StageError("OpenRouter sent an answer the stage could not read") from error


def read_sections(text: str) -> list[Any] | None:
    """The list of intervals in the answer's JSON, or None when there is no readable list."""
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        return None
    try:
        data = json.loads(match.group(0))
    except ValueError:
        return None
    if not isinstance(data, dict):
        return None
    items = data.get("sections", data.get("actions"))
    return items if isinstance(items, list) else None


def check_sections(items: list[Any], length: float) -> tuple[list[tuple[float, float]], list[str]]:
    """The usable intervals inside the clip, and a description of each bad one."""
    parts: list[tuple[float, float]] = []
    problems: list[str] = []
    for item in items:
        try:
            start, end = float(item["start"]), float(item["end"])
        except (KeyError, TypeError, ValueError):
            problems.append(f"{str(item)[:60]} has no usable start and end")
            continue
        if end <= start:
            problems.append(f"{start:g} to {end:g} ends before it starts")
        elif end <= -TIME_SLACK or start >= length + TIME_SLACK:
            problems.append(f"{start:g} to {end:g} is outside the clip")
        else:
            parts.append((max(0.0, start), min(length, end)))
    return parts, problems


def parse_actions(text: str, length: float) -> list[tuple[float, float]]:
    """The usable intervals from an answer. Bad or empty answers give no parts."""
    items = read_sections(text)
    return [] if items is None else check_sections(items, length)[0]


def tidy_parts(parts: list[tuple[float, float]], length: float, padding_before: float, padding_after: float, merge_gap: float, min_action: float) -> list[tuple[float, float]]:
    """Pad each part, join parts that are close, and drop the short ones. Never goes outside [0, length]."""
    inside = [(max(0.0, start), min(length, end)) for start, end in parts]  # a saved result may be out of range
    padded = sorted((max(0.0, start - padding_before), min(length, end + padding_after)) for start, end in inside if end > start)
    merged: list[tuple[float, float]] = []
    for start, end in padded:
        if merged and start - merged[-1][1] <= merge_gap:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))
    return [(start, end) for start, end in merged if end - start >= max(min_action, 0.001)]


def fill_prompt(prompt: str, source_name: str, duration: float, padding: float) -> str:
    """The prompt with this clip's name, length and the limits the editor applies filled in."""
    values = {
        "SOURCE_NAME": source_name,
        "DURATION_SECONDS": f"{duration:.1f}",
        "MAX_MODEL_SECTION_SECONDS": f"{MAX_MODEL_SECTION_SECONDS:g}",
        "MAX_CUT_CONTEXT_SECONDS": f"{padding:g}",
        "MAX_CLASS_CUT_SECONDS": f"{MAX_CLASS_CUT_SECONDS:g}",
    }
    for name, value in values.items():
        prompt = prompt.replace("{{" + name + "}}", value)
    return prompt


def extract_frames(ctx: StageContext, piece: Piece, frames_dir: str, fps: float) -> list[str]:
    """Small frames at the given rate, read from the clip part the piece covers."""
    pattern = os.path.join(frames_dir, "frame-%04d.jpg")
    ctx.ffmpeg.run(["-ss", str(piece.start), "-t", str(piece.length), "-i", f"file:{piece.clip}", "-vf", f"fps={fps},scale=-2:360", "-q:v", "6", pattern])
    return sorted(glob.glob(os.path.join(frames_dir, "frame-*.jpg")))



STAGE = DetectAction()
