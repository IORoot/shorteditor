from __future__ import annotations

from .pieces import Kind
from .registry import StageRegistry
from .stage_api import StageStep

_MAKES = {"video": "a video", "pieces": "pieces", "none": "nothing"}


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
        if stage.position == "last" and index != len(active) - 1:
            errors.append(f"{stage.title} must be last")
        if kind not in stage.transitions:
            needs = " or ".join(stage.transitions)
            before = "nothing comes before it" if kind == "none" else f"the step before it makes {_MAKES[kind]}"
            errors.append(f"{stage.title} needs {needs}; {before}")
            continue
        kind = stage.transitions[kind]
    if kind != "video":
        errors.append("The pipeline must end with a video")
    return errors
