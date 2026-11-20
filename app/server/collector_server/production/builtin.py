from __future__ import annotations

import importlib
import pkgutil

from .registry import StageRegistry

PACKAGE = "collector_server.production.stages"
# The order the library is shown in. Stage files not listed here are registered after these, by key.
LIBRARY_ORDER = ["scan_folder", "order_clips", "limit_length", "apply_trims", "join_pieces", "render_output"]


def register_package(registry: StageRegistry, package: str, first: list[str] = LIBRARY_ORDER) -> None:
    """Register the STAGE of every module in a package, so a new stage is one new file."""
    found = {}
    for info in pkgutil.iter_modules(importlib.import_module(package).__path__):
        stage = getattr(importlib.import_module(f"{package}.{info.name}"), "STAGE", None)
        if stage is not None:
            found[stage.key] = stage
    for key in [*first, *sorted(found)]:
        if key in found:
            registry.register(found.pop(key))


def build_registry() -> StageRegistry:
    registry = StageRegistry()
    register_package(registry, PACKAGE)
    return registry
