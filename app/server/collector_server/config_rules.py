from __future__ import annotations

from .date_source import ClipDateResolver
from .filter_engine import FilterEngine
from .models import CollectorConfig
from .random_selector import RandomSelector
from .token_template import FolderTemplate


def validate_config(config: CollectorConfig) -> None:
    if not config.name.strip():
        raise ValueError("Name is required")
    if not config.input_folder.strip():
        raise ValueError("Input folder is required")
    if config.source_type == "ssh" and not config.host.strip():
        raise ValueError("SSH sources need a host")
    if not config.output_folder.strip():
        raise ValueError("Output folder is required")
    template = FolderTemplate(config.folder_template)
    if template.uses_window() and config.group_by != "window":
        raise ValueError("{window:...} tokens need Group by: Window")
    FilterEngine(config.filters)
    RandomSelector(config.random_selection)
    ClipDateResolver(config.date_sources, config.filename_pattern, None)
