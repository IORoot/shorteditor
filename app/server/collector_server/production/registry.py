from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

from collector_server.shared.camel_model import CamelModel

from .stage_api import Stage

_KINDS = {"none", "pieces", "video"}
_POSITIONS = {"first", "last", "any"}


def _check_shape(stage: Stage) -> None:
    for name in ("key", "title"):
        if not isinstance(getattr(stage, name, None), str) or not getattr(stage, name):
            raise ValueError(f"a stage needs a {name}")
    if getattr(stage, "position", None) not in _POSITIONS:
        raise ValueError("position must be first, last or any")
    transitions = getattr(stage, "transitions", None)
    if not isinstance(transitions, dict) or not transitions or not all(k in _KINDS and v in _KINDS for k, v in transitions.items()):
        raise ValueError("transitions must map none, pieces or video to none, pieces or video")
    model = getattr(stage, "settings_model", None)
    if not (isinstance(model, type) and issubclass(model, CamelModel)):
        raise ValueError("settings_model must be a CamelModel")
    if not callable(getattr(stage, "run", None)):
        raise ValueError("a stage needs a run method")


class StageRegistry:
    def __init__(self) -> None:
        self._stages: dict[str, Stage] = {}
        self.problems: list[str] = []

    def register(self, stage: Stage) -> None:
        _check_shape(stage)
        if stage.key in self._stages:
            raise ValueError(f"A stage called {stage.key} is already registered")
        self._stages[stage.key] = stage

    def get(self, key: str) -> Stage:
        return self._stages[key]

    def all(self) -> list[Stage]:
        return list(self._stages.values())

    def discover_folder(self, path: str) -> None:
        folder = Path(path)
        if not folder.is_dir():
            return
        for file in sorted(folder.glob("*.py")):
            if file.name.startswith("_"):
                continue
            try:
                self.register(self._load(file))
            except (Exception, SystemExit) as error:  # a bad plugin must not stop the others
                self.problems.append(f"{file.name}: {type(error).__name__}: {error}")

    @staticmethod
    def _load(file: Path) -> Stage:
        spec = importlib.util.spec_from_file_location(f"production_plugin_{file.stem}", file)
        module = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = module  # dataclasses and pydantic look their module up here
        try:
            spec.loader.exec_module(module)
        except BaseException:
            sys.modules.pop(spec.name, None)
            raise
        if not hasattr(module, "STAGE"):
            raise ValueError("it does not define STAGE")
        return module.STAGE
