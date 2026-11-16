from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from collector_server.collection.api import create_app
from collector_server.collection.clip_types import is_video
from collector_server.collection.filter_preview import MAX_ROWS, NO_MATCH, NOT_PICKED, FilterPreviewer
from collector_server.collection.models import FilterGroup, FilterRule, RandomSelection
from collector_server.collection.planner import TransferPlanner
from collector_server.collection.service import CollectorService
from tests.conftest import LONDON
from tests.helpers import config_for, make_clip

FILES = {  # name -> (day, hour, minute), all November 2026 (14th is a Saturday)
    "GX010412.MP4": (14, 9, 12), "GX010413.MP4": (14, 9, 48), "GX010414.MP4": (14, 14, 5),
    "my raw clip.mov": (14, 10, 20), "edit v2.mp4": (7, 9, 30), "DJI_0087.MP4": (13, 19, 40),
    "notes.md": (9, 8, 30), "styles.css": (9, 8, 41), "IMG 2210.JPG": (14, 10, 5),
}


@pytest.fixture
def source(tmp_path):
    folder = tmp_path / "in"
    for name, (day, hour, minute) in FILES.items():
        make_clip(folder / name, datetime(2026, 11, day, hour, minute, tzinfo=LONDON))
    return folder


@pytest.fixture
def previewer(clock):
    return FilterPreviewer(TransferPlanner(clock), clock)


def run(previewer, source, tmp_path, *groups: list[FilterRule], **overrides):
    config = config_for(source, tmp_path / "out", filters=[FilterGroup(rules=list(g)) for g in groups], **overrides)
    return previewer.preview(config)


def selected(result) -> set[str]:
    return {clip.name for clip in result.clips if clip.selected}


def reasons(result) -> dict[str, str]:
    return {clip.name: clip.reason for clip in result.clips}


def test_is_video_checks_extension_case_insensitively_and_ignores_dotfiles():
    assert is_video("a.MP4") and is_video("my clip.mov")
    assert not is_video("notes.md") and not is_video(".hidden.mp4") and not is_video("noextension")


def test_lists_every_file_newest_first(previewer, source, tmp_path):
    result = run(previewer, source, tmp_path)
    assert result.total == len(FILES) and len(result.clips) == len(FILES)
    assert result.clips[0].name == "GX010414.MP4"
    assert [c.when for c in result.clips] == sorted((c.when for c in result.clips), reverse=True)


def test_no_filters_collects_every_file(previewer, source, tmp_path):
    result = run(previewer, source, tmp_path)
    assert selected(result) == set(FILES)
    assert result.selected_count == len(FILES)


def test_name_rule_matches_substring_including_spaces(previewer, source, tmp_path):
    result = run(previewer, source, tmp_path, [FilterRule(kind="name", value="raw clip")])
    assert selected(result) == {"my raw clip.mov"}
    assert reasons(result)["GX010412.MP4"] == NO_MATCH


def test_rules_pick_non_video_files_too(previewer, source, tmp_path):
    result = run(previewer, source, tmp_path, [FilterRule(kind="glob", value="*.css")])
    assert selected(result) == {"styles.css"}


def test_groups_are_ored_and_rules_anded(previewer, source, tmp_path):
    saturday_morning = [FilterRule(kind="weekday", days=[6]), FilterRule(kind="window", days=[6], start="09:00", end="12:00")]
    djis = [FilterRule(kind="glob", value="DJI_*")]
    result = run(previewer, source, tmp_path, saturday_morning, djis)
    assert selected(result) == {"GX010412.MP4", "GX010413.MP4", "my raw clip.mov", "edit v2.mp4", "DJI_0087.MP4", "IMG 2210.JPG"}


def test_exclude_rule_removes_matches(previewer, source, tmp_path):
    rules = [FilterRule(kind="weekday", days=[6]), FilterRule(kind="name", value="v2", exclude=True)]
    assert "edit v2.mp4" not in selected(run(previewer, source, tmp_path, rules))


def test_label_formats_day_date_and_time(previewer, source, tmp_path):
    clip = next(c for c in run(previewer, source, tmp_path).clips if c.name == "GX010412.MP4")
    assert clip.label == "Sat 14 Nov · 09:12" and clip.when.startswith("2026-11-14T09:12")


def test_dates_follow_the_configured_date_source(previewer, source, tmp_path):
    make_clip(source / "GX_20250102_030405.mp4", datetime(2026, 11, 1, 0, 0, tzinfo=LONDON))
    result = run(previewer, source, tmp_path, date_source="filename", filename_pattern="GX_YYYYMMDD_HHmmss")
    clip = next(c for c in result.clips if c.name.startswith("GX_2025"))
    assert clip.when.startswith("2025-01-02T03:04:05")


def sample(**overrides) -> FilterRule:
    return FilterRule(kind="random", random=RandomSelection(**{"enabled": True, "mode": "count", "value": 2, "scope": "overall", "seed": 5, **overrides}))


def test_random_rule_is_seeded_and_only_samples_what_the_rules_before_it_matched(previewer, source, tmp_path):
    rules = [FilterRule(kind="name", value="GX01"), sample()]
    first, again = run(previewer, source, tmp_path, rules), run(previewer, source, tmp_path, rules)
    assert first.selected_count == 2 and selected(first) == selected(again)
    assert all(name.startswith("GX01") for name in selected(first))
    assert NOT_PICKED in reasons(first).values()


def test_random_rule_per_folder_picks_from_each_day(previewer, source, tmp_path):
    result = run(previewer, source, tmp_path, [sample(value=1, scope="folder", seed=1)])
    days = {c.when[:10] for c in result.clips if c.selected}
    assert result.selected_count == len(days) and days


def test_subfolders_are_listed_and_the_output_folder_is_skipped(previewer, source, tmp_path):
    make_clip(source / "day 2" / "nested-clip.mp4", datetime(2026, 11, 3, 8, 0, tzinfo=LONDON))
    make_clip(source / "out" / "already.mp4", datetime(2026, 11, 3, 9, 0, tzinfo=LONDON))
    result = previewer.preview(config_for(source, source / "out"))
    names = {c.name for c in result.clips}
    assert "day 2/nested-clip.mp4" in names and "out/already.mp4" not in names


def test_long_folders_are_capped_but_counted(previewer, tmp_path, monkeypatch):
    folder = tmp_path / "many"
    for n in range(5):
        make_clip(folder / f"c{n}.mp4", datetime(2026, 11, 1 + n, 8, 0, tzinfo=LONDON))
    monkeypatch.setattr("collector_server.collection.filter_preview.MAX_ROWS", 3)
    result = previewer.preview(config_for(folder, tmp_path / "out"))
    assert (len(result.clips), result.total, result.selected_count, result.truncated) == (3, 5, 5, True)
    assert MAX_ROWS == 500


@pytest.mark.parametrize(
    "overrides,error,message",
    [
        ({"input_folder": ""}, ValueError, "Pick an input folder"),
        ({"input_folder": "/nowhere/at/all"}, FileNotFoundError, "not found"),
        ({"source_type": "ssh"}, ValueError, "SSH"),
    ],
)
def test_unusable_sources_raise(previewer, tmp_path, overrides, error, message):
    config = config_for(tmp_path, tmp_path / "out").model_copy(update=overrides)
    with pytest.raises(error, match=message):
        previewer.preview(config)


@pytest.mark.parametrize("rule,message", [(FilterRule(kind="regex", value="("), "Invalid regex"), (FilterRule(kind="weekday", days=[]), "weekday")])
def test_invalid_rules_raise(previewer, source, tmp_path, rule, message):
    with pytest.raises(ValueError, match=message):
        run(previewer, source, tmp_path, [rule])


@pytest.fixture
def client(collectors, runs, clock):
    return TestClient(create_app(CollectorService(collectors, runs, clock)))


def test_endpoint_returns_verdicts(client, source, tmp_path):
    body = config_for(source, tmp_path / "out", filters=[FilterGroup(rules=[FilterRule(kind="name", value="raw clip")])]).model_dump(by_alias=True)
    data = client.post("/api/preview/filters", json=body).json()
    assert data["total"] == len(FILES) and data["selectedCount"] == 1 and data["truncated"] is False


def test_endpoint_explains_a_missing_folder(client, tmp_path):
    body = config_for(tmp_path / "missing", tmp_path / "out").model_dump(by_alias=True)
    response = client.post("/api/preview/filters", json=body)
    assert response.status_code == 422 and "not found" in response.json()["detail"]


def test_case_sensitive_rule_changes_what_is_collected(previewer, source, tmp_path):
    loose = run(previewer, source, tmp_path, [FilterRule(kind="name", value="raw CLIP")])
    strict = run(previewer, source, tmp_path, [FilterRule(kind="name", value="raw CLIP", case_sensitive=True)])
    assert selected(loose) == {"my raw clip.mov"} and selected(strict) == set()
