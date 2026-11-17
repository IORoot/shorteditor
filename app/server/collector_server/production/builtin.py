from __future__ import annotations

from .registry import StageRegistry
from .stages import join_pieces, limit_length, order_clips, render_output, scan_folder


def build_registry() -> StageRegistry:
    registry = StageRegistry()
    for module in (scan_folder, order_clips, limit_length, join_pieces, render_output):
        registry.register(module.STAGE)
    return registry
