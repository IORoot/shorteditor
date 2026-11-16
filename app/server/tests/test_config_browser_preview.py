import os

import pytest

from collector_server.browser import FolderBrowser
from collector_server.config_rules import validate_config
from collector_server.models import CollectorConfig, FolderPreviewRequest
from collector_server.preview import FolderPreviewer


def config(**overrides) -> CollectorConfig:
    base = dict(name="Coach", input_folder="/in", output_folder="/out", folder_template="{date}")
    base.update(overrides)
    return CollectorConfig(**base)


def test_valid_config_passes():
    validate_config(config())


@pytest.mark.parametrize(
    "overrides,message",
    [
        ({"name": "  "}, "Name"),
        ({"input_folder": ""}, "Input folder"),
        ({"output_folder": ""}, "Output folder"),
        ({"source_type": "ssh", "host": ""}, "host"),
        ({"folder_template": "{bogus}"}, "Unknown token"),
        ({"folder_template": "{window:name}", "group_by": "day"}, "Group by: Window"),
    ],
)
def test_invalid_configs_raise(overrides, message):
    with pytest.raises(ValueError, match=message):
        validate_config(config(**overrides))


def test_ssh_with_host_and_window_with_window_grouping_are_valid():
    validate_config(config(source_type="ssh", host="nas"))
    validate_config(config(folder_template="{window:name}", group_by="window"))


def test_browser_lists_visible_directories_only_sorted(tmp_path):
    (tmp_path / "beta").mkdir()
    (tmp_path / "Alpha").mkdir()
    (tmp_path / ".hidden").mkdir()
    (tmp_path / "file.txt").write_text("x")
    result = FolderBrowser().list(str(tmp_path))
    assert [e.name for e in result.entries] == ["Alpha", "beta"]
    assert result.path == str(tmp_path)
    assert result.parent == os.path.dirname(str(tmp_path))


def test_browser_root_has_no_parent():
    assert FolderBrowser().list("/").parent is None


def test_browser_uses_the_default_when_no_path_is_given(tmp_path):
    assert FolderBrowser(default=str(tmp_path)).list(None).path == str(tmp_path)


def test_browser_rejects_relative_and_missing_paths(tmp_path):
    with pytest.raises(ValueError, match="absolute"):
        FolderBrowser().list("relative/path")
    with pytest.raises(FileNotFoundError):
        FolderBrowser().list(str(tmp_path / "missing"))


def test_previewer_renders_the_full_path(clock):
    request = FolderPreviewRequest(
        folder_template="{date:YYYY-MM-DD}_{weekday}_{suffix}",
        output_folder="/Volumes/Edit/Collected/",
        suffix="coach",
        sample_date="2026-11-14T18:40:00",
    )
    result = FolderPreviewer().preview(request, clock.now())
    assert result.relative_path == "2026-11-14_Sat_coach"
    assert result.full_path == "/Volumes/Edit/Collected/2026-11-14_Sat_coach"


def test_previewer_falls_back_to_the_clock_and_handles_empty_output(clock):
    result = FolderPreviewer().preview(FolderPreviewRequest(folder_template="{date}"), clock.now())
    assert result.relative_path == "2026-11-16"
    assert result.full_path == "2026-11-16"


def test_previewer_rejects_window_tokens_without_window_grouping(clock):
    with pytest.raises(ValueError, match="Group by: Window"):
        FolderPreviewer().preview(FolderPreviewRequest(folder_template="{window:name}", group_by="day"), clock.now())
