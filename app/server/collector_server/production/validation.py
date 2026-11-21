from __future__ import annotations

from pydantic import ValidationError

from collector_server.shared.camel_model import CamelModel

from .pieces import Kind
from .registry import StageRegistry
from .stage_api import Stage, StageError, StageStep

_MAKES = {"video": "a video", "pieces": "pieces", "none": "nothing"}


def _stage(registry: StageRegistry, step: StageStep):  # noqa: ANN202
    try:
        return registry.get(step.key)
    except KeyError:
        return None


def _may_follow(stage, later) -> bool:  # noqa: ANN001
    """A last stage may be followed only by other last stages. An export stage only by other export stages."""
    if later is None or later.position != "last":
        return False
    return getattr(later, "export", False) if getattr(stage, "export", False) else True


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
        if stage.position == "last" and any(not _may_follow(stage, _stage(registry, later)) for later in active[index + 1:]):
            errors.append(f"{stage.title} must be last")  # only other last stages may follow it, and only exports follow an export
        if getattr(stage, "export", False) and any(earlier.key == step.key for earlier in active[:index]):
            errors.append(f"{stage.title} can only be used once")
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
