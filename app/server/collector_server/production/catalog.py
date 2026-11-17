from __future__ import annotations

import json

from collector_server.shared.pipeline import StageInfo, StageStep

from .registry import StageRegistry
from .stage_api import StageError
from .validation import build_settings, validate_pipeline

_MAX_STEPS = 30
_MAX_SETTINGS_JSON = 4000


class StageLibrary:
    """The stages Production can run, and the checks on a list of steps. Implements shared StageCatalog."""

    def __init__(self, registry: StageRegistry) -> None:
        self.registry = registry

    def stages(self) -> list[StageInfo]:
        return [
            StageInfo(key=s.key, title=s.title, description=getattr(s, "description", ""), transitions=dict(s.transitions), position=s.position, settings_schema=s.settings_model.model_json_schema(by_alias=True))
            for s in self.registry.all()
        ]

    def known(self, key: str) -> bool:
        try:
            self.registry.get(key)
            return True
        except KeyError:
            return False

    def check_pipeline(self, steps: list[StageStep]) -> list[str]:
        if len(steps) > _MAX_STEPS:
            return [f"A pipeline can have at most {_MAX_STEPS} steps"]
        for step in steps:  # disabled steps are stored too, so they are held to the same limits
            if len(step.key) > 100 or len(json.dumps(step.settings)) > _MAX_SETTINGS_JSON:
                return [f"The settings of {step.key[:40]} are too large"]
            if not step.enabled and not self.known(step.key):
                return [f"There is no stage called {step.key[:40]}"]
        errors = validate_pipeline(self.registry, steps)
        if errors:
            return errors
        for step in (s for s in steps if s.enabled):
            try:
                build_settings(self.registry.get(step.key), step.settings)
            except StageError as error:
                errors.append(str(error))
        return errors
