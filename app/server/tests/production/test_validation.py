from collector_server.production.stage_api import StageStep
from collector_server.production.validation import validate_pipeline
from tests.production.helpers import fake_registry


def steps(*keys, disabled=()):
    return [StageStep(key=k, enabled=k not in disabled) for k in keys]


def check(*keys, disabled=()):
    return validate_pipeline(fake_registry(), steps(*keys, disabled=disabled))


def test_valid_join_pipeline():
    assert check("scan", "order", "join", "render") == []


def test_scan_must_be_first():
    assert any("Scan folder must be first" in m for m in check("order", "scan", "join", "render"))


def test_render_must_be_last():
    assert any("Render must be last" in m for m in check("scan", "join", "render", "order"))


def test_stage_needs_matching_input():
    errors = check("scan", "join", "join", "render")
    assert "Join in order needs pieces; the step before it makes a video" in errors


def test_unknown_stage_reported():
    assert any("nope" in m for m in check("scan", "nope", "join", "render"))


def test_disabled_steps_are_skipped():
    assert check("scan", "join", "join", "render", disabled=()) != []
    assert check("scan", "join", "order", "render", disabled=("order",)) == []


def test_pipeline_must_end_with_video():
    assert "The pipeline must end with a video" in check("scan")


def test_empty_pipeline_reported():
    assert validate_pipeline(fake_registry(), []) == ["The pipeline has no steps"]


def test_first_step_that_needs_pieces_says_nothing_comes_before_it():
    assert "Order clips needs pieces; nothing comes before it" in check("order", "join", "render")


def test_one_typo_gives_one_chain_message():
    errors = check("scan", "nope", "join", "render")
    assert errors == ["There is no stage called nope"]


def test_build_settings_returns_a_validated_model():
    from collector_server.production.validation import build_settings

    stage = fake_registry().get("scan")
    assert build_settings(stage, {}).model_dump() == {}


def test_build_settings_says_which_stage_and_field():
    import pytest

    from collector_server.production.builtin import build_registry
    from collector_server.production.stage_api import StageError
    from collector_server.production.validation import build_settings

    with pytest.raises(StageError, match="settings for Limit length are not valid: maxSeconds|max_seconds"):
        build_settings(build_registry().get("limit_length"), {"maxSeconds": -5})
