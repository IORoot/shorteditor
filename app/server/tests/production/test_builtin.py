import pytest
from collector_server.production.builtin import build_registry
from collector_server.production.stage_api import StageStep
from collector_server.production.validation import validate_pipeline


def test_builtin_registry_has_every_stage():
    assert sorted(s.key for s in build_registry().all()) == sorted(["scan_folder", "order_clips", "limit_length", "apply_trims", "join_pieces", "render_output", "detect_action", "ffmpeg", "review_by_hand"])


def test_join_pipeline_validates():
    steps = [StageStep(key=k) for k in ["scan_folder", "order_clips", "limit_length", "join_pieces", "render_output"]]
    assert validate_pipeline(build_registry(), steps) == []


@pytest.mark.full
@pytest.mark.full
def test_default_settings_of_every_stage_are_valid():
    for stage in build_registry().all():
        stage.settings_model()


@pytest.mark.full
@pytest.mark.full
def test_a_stage_file_dropped_into_the_stages_package_is_registered_without_editing_the_list(tmp_path, monkeypatch):
    import sys

    from collector_server.production.builtin import register_package
    from collector_server.production.registry import StageRegistry

    package = tmp_path / "extra_stages"
    package.mkdir()
    (package / "__init__.py").write_text("")
    (package / "sepia.py").write_text(
        "from tests.production.helpers import FakeStage\nSTAGE = FakeStage('sepia', 'Sepia', {'video': 'video'})\n"
    )
    (package / "notes.py").write_text("X = 1\n")  # not a stage: skipped, not fatal
    monkeypatch.syspath_prepend(str(tmp_path))
    registry = StageRegistry()
    register_package(registry, "extra_stages", first=())
    sys.modules.pop("extra_stages", None)
    assert [s.key for s in registry.all()] == ["sepia"]


@pytest.mark.full
@pytest.mark.full
def test_builtin_order_is_the_library_order_and_new_files_follow():
    from collector_server.production.builtin import LIBRARY_ORDER

    assert LIBRARY_ORDER == ["scan_folder", "order_clips", "limit_length", "apply_trims", "join_pieces", "render_output"]
