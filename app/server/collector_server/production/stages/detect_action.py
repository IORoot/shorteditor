from __future__ import annotations

import base64
import glob
import json
import os
import re
import urllib.error
import urllib.request
from typing import Any

from pydantic import Field

from collector_server.shared.camel_model import CamelModel

from ..pieces import Piece, PiecesData
from ..stage_api import StageContext, StageError
from . import detect_cache

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
MAX_FRAMES = 120  # shortcut: frames per piece are capped at this many, so long pieces get a lower frame rate; raise if clips need finer detail


class DetectSettings(CamelModel):
    model: str = Field("nvidia/nemotron-nano-12b-v2-vl", min_length=1, max_length=200, title="Model", description="The OpenRouter model that looks at the frames.")
    prompt: str = Field(
        'Find every time an action happens in these frames. Answer only with JSON like {"actions": [{"start": 3.5, "end": 9.0}]}. '
        "Times are seconds from the first frame. Answer {\"actions\": []} when nothing happens.",
        min_length=1,
        max_length=2000,
        title="Prompt",
        description="What to look for, and the answer format the stage can read.",
    )
    frames_per_second: float = Field(1.0, ge=0.1, le=2.0, title="Frames per second", description="How many frames a second are sent to the model.")
    padding_before: float = Field(0.5, ge=0, le=10, title="Padding before (seconds)", description="Extra time kept before each action.")
    padding_after: float = Field(0.5, ge=0, le=10, title="Padding after (seconds)", description="Extra time kept after each action.")
    merge_gap: float = Field(2.0, ge=0, le=30, title="Join actions closer than (seconds)", description="Actions this close together become one part.")
    min_action: float = Field(0.5, ge=0, le=30, title="Drop actions shorter than (seconds)", description="Very short parts are left out.")
    reuse_results: bool = Field(True, title="Reuse saved results", description="Do not ask the model again about a clip it has already seen with these settings.")


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
            cache_key = detect_cache.cache_key(settings.model, settings.prompt, settings.frames_per_second, piece.clip, stat.st_size, stat.st_mtime, piece.start, piece.end or piece.clip_duration)
            saved = detect_cache.load(ctx.cache_root, cache_key)
            if saved is not None:
                ctx.log(f"Reused the saved result for {os.path.basename(piece.clip)}")
                return saved
        frames_dir = os.path.join(ctx.work_dir, f"frames-{number}")
        os.makedirs(frames_dir, exist_ok=True)
        fps = min(settings.frames_per_second, MAX_FRAMES / piece.length)
        frames = extract_frames(ctx, piece, frames_dir, fps)
        ctx.log(f"Sending {len(frames)} frames of {os.path.basename(piece.clip)} to {settings.model}")
        raw = parse_actions(ask_model(settings.model, settings.prompt, frames, piece.length, key), piece.length)
        if cache_key is not None:
            detect_cache.save(ctx.cache_root, cache_key, raw)
        return raw


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


def extract_frames(ctx: StageContext, piece: Piece, frames_dir: str, fps: float) -> list[str]:
    """Small frames at the given rate, read from the clip part the piece covers."""
    pattern = os.path.join(frames_dir, "frame-%04d.jpg")
    ctx.ffmpeg.run(["-ss", str(piece.start), "-t", str(piece.length), "-i", f"file:{piece.clip}", "-vf", f"fps={fps},scale=-2:360", "-q:v", "6", pattern])
    return sorted(glob.glob(os.path.join(frames_dir, "frame-*.jpg")))


def ask_model(model: str, prompt: str, frames: list[str], length: float, key: str) -> str:
    """The model's answer text. Each frame is sent with its time so the answer can use seconds."""
    step = length / max(1, len(frames))
    content: list[dict[str, Any]] = [{"type": "text", "text": prompt}]
    for index, path in enumerate(frames):
        with open(path, "rb") as image:
            encoded = base64.b64encode(image.read()).decode("ascii")
        content.append({"type": "text", "text": f"Frame at {index * step:.1f} s"})
        content.append({"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{encoded}"}})
    body = json.dumps({"model": model, "messages": [{"role": "user", "content": content}]}).encode("utf-8")
    request = urllib.request.Request(OPENROUTER_URL, data=body, headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            reply = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        raise StageError(f"OpenRouter answered {error.code}. Check the key and the model name") from error
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        raise StageError("Could not reach OpenRouter. Check the connection") from error
    try:
        return str(reply["choices"][0]["message"]["content"])
    except (KeyError, IndexError, TypeError) as error:
        raise StageError("OpenRouter sent an answer the stage could not read") from error


def parse_actions(text: str, length: float) -> list[tuple[float, float]]:
    """(start, end) seconds inside the piece, from the model's JSON. Bad or empty answers give no parts."""
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        return []
    try:
        actions = json.loads(match.group(0)).get("actions", [])
    except (ValueError, AttributeError):
        return []
    parts = []
    for action in actions if isinstance(actions, list) else []:
        try:
            start, end = float(action["start"]), float(action["end"])
        except (KeyError, TypeError, ValueError):
            continue
        start, end = max(0.0, start), min(length, end)
        if end > start:
            parts.append((start, end))
    return parts


STAGE = DetectAction()
