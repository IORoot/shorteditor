from collector_server.production.builtin import build_registry
from collector_server.production.stage_api import StageStep
from collector_server.production.validation import validate_pipeline


def test_builtin_registry_has_the_five_stages():
    assert [s.key for s in build_registry().all()] == ["scan_folder", "order_clips", "limit_length", "join_pieces", "render_output"]


def test_join_pipeline_validates():
    steps = [StageStep(key=k) for k in ["scan_folder", "order_clips", "limit_length", "join_pieces", "render_output"]]
    assert validate_pipeline(build_registry(), steps) == []


def test_default_settings_of_every_stage_are_valid():
    for stage in build_registry().all():
        stage.settings_model()
