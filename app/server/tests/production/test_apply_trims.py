import pytest

from collector_server.production.builtin import build_registry
from collector_server.production.pieces import Piece, PiecesData
from collector_server.production.runner import with_trims_step
from collector_server.production.stage_api import StageContext, StageError, StageStep
from collector_server.production.stages.apply_trims import STAGE, TrimSettings


def ctx(tmp_path, lines):
    return StageContext(str(tmp_path), str(tmp_path), str(tmp_path), None, lines.append)


def clips():
    return PiecesData(items=[Piece(clip=f"/x/{n}.mp4", clip_duration=10, start=0, end=10) for n in "abc"])


def test_with_no_trims_the_pieces_come_out_as_they_went_in(tmp_path):
    out = STAGE.run(clips(), TrimSettings(), ctx(tmp_path, []))
    assert [(p.clip, p.start, p.end) for p in out.items] == [("/x/a.mp4", 0, 10), ("/x/b.mp4", 0, 10), ("/x/c.mp4", 0, 10)]


def test_a_clip_with_trims_becomes_one_piece_per_trim_and_the_others_stay(tmp_path):
    settings = TrimSettings(trims={"b.mp4": [{"start": 6, "end": 9}, {"start": 1, "end": 2}]})
    out = STAGE.run(clips(), settings, ctx(tmp_path, []))
    assert [(p.clip, p.start, p.end) for p in out.items] == [
        ("/x/a.mp4", 0, 10), ("/x/b.mp4", 1, 2), ("/x/b.mp4", 6, 9), ("/x/c.mp4", 0, 10),
    ]


def test_a_trim_for_a_clip_not_in_the_card_is_logged_and_skipped(tmp_path):
    lines = []
    out = STAGE.run(clips(), TrimSettings(trims={"gone.mp4": [{"start": 1, "end": 2}]}), ctx(tmp_path, lines))
    assert len(out.items) == 3
    assert any("gone.mp4" in line for line in lines)


def test_trims_that_leave_nothing_stop_the_pass_with_a_reason(tmp_path):
    settings = TrimSettings(trims={n + ".mp4": [] for n in "abc"})
    with pytest.raises(StageError) as stop:
        STAGE.run(PiecesData(items=[]), settings, ctx(tmp_path, []))
    assert "No clips" in str(stop.value)


def test_the_stage_is_in_the_library_between_limit_and_join():
    keys = [stage.key for stage in build_registry().all()]
    assert keys.index("limit_length") < keys.index("apply_trims") < keys.index("join_pieces")


def test_a_pass_gets_the_trims_step_before_join_when_its_pipeline_has_none():
    steps = [StageStep(key="scan_folder"), StageStep(key="order_clips"), StageStep(key="join_pieces"), StageStep(key="render_output")]
    assert [s.key for s in with_trims_step(steps)] == ["scan_folder", "order_clips", "apply_trims", "join_pieces", "render_output"]


def test_a_pipeline_that_already_has_the_trims_step_is_left_alone():
    steps = [StageStep(key="scan_folder"), StageStep(key="apply_trims"), StageStep(key="join_pieces")]
    assert with_trims_step(steps) == steps
