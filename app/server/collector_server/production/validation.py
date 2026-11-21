from __future__ import annotations

from pydantic import ValidationError

from collector_server.shared.camel_model import CamelModel

from .pieces import Kind
from .registry import StageRegistry
from .stage_api import Stage, StageError, StageStep

_MAKES = {"video": "a video", "pieces": "pieces", "none": "nothing"}


def _position(registry: StageRegistry, step: StageStep) -> str | None:
    try:
        return registry.get(step.key).position
    except KeyError:
        return None


def validate_pipeline(registry: StageRegistry, steps: list[StageStep]) -> list[str]:
    active = [step for step in steps if step.enabled]
    if not active:
        return ["The pipeline has no steps"]
    errors: list[str] = []
    kind: Kind = "none"
    for index, step in enumerate(active):
        try:
            stage = registry.get(step.key)
        except KeyError:
            errors.append(f"There is no stage called {step.key}")
            continue
        if stage.position == "first" and index != 0:
            errors.append(f"{stage.title} must be first")
        if stage.position == "last" and any(_position(registry, later) != "last" for later in active[index + 1:]):
            errors.append(f"{stage.title} must be last")  # only other last stages (an export after the render) may follow it
        if kind not in stage.transitions:
            needs = " or ".join(stage.transitions)
            before = "nothing comes before it" if kind == "none" else f"the step before it makes {_MAKES[kind]}"
            errors.append(f"{stage.title} needs {needs}; {before}")
            continue
        kind = stage.transitions[kind]
    if kind != "video":
        errors.append("The pipeline must end with a video")
    return errors


def build_settings(stage: Stage, values: dict) -> CamelModel:
    """The stage's settings from raw values, or a StageError saying which setting is wrong."""
    try:
        return stage.settings_model(**values)
    except ValidationError as error:
        first = error.errors()[0]
        where = ".".join(str(part) for part in first["loc"])
        raise StageError(f"The settings for {stage.title} are not valid: {where} {first['msg']}") from error
