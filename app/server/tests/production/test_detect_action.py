import pytest

from collector_server.production.pieces import Piece, PiecesData
from collector_server.production.stage_api import StageContext, StageError
from collector_server.production.stages import detect_action as stage


def ctx_for(tmp_path, cache=None):
    return StageContext(str(tmp_path), str(tmp_path), str(tmp_path), None, lambda line: None, cache_root=cache)


def test_only_real_actions_inside_the_clip_are_kept():
    text = 'Sure: {"actions": [{"start": 1, "end": 4}, {"start": -2, "end": 99}, {"start": "x"}, {"start": 6, "end": 6}]}'
    assert stage.parse_actions(text, 10) == [(1.0, 4.0), (0.0, 10.0)]
    assert stage.parse_actions("no json here", 10) == []


def test_padding_merging_and_short_drops_stay_inside_the_clip():
    parts = [(0.2, 1.0), (2.5, 4.0), (9.0, 9.2)]
    # padding 0.5 each side clamps to [0, 10]; the first two are close so they join; the last stays separate
    assert stage.tidy_parts(parts, 10, 0.5, 0.5, 2.0, 0.5) == [(0.0, 4.5), (8.5, 9.7)]
    assert stage.tidy_parts([(5.0, 5.1)], 10, 0, 0, 2.0, 0.5) == []
    assert stage.tidy_parts([(12, 13), (4, 4)], 10, 0, 0, 0, 0) == []


def test_a_missing_key_fails_plainly(monkeypatch, tmp_path):
    monkeypatch.delenv(stage.KEY_VARIABLE, raising=False)
    data = PiecesData(items=[Piece(clip="/clips/a.mp4", clip_duration=20)])
    with pytest.raises(StageError, match="OPENROUTER_API_KEY"):
        stage.DetectAction().run(data, stage.DetectSettings(), ctx_for(tmp_path))


def test_action_parts_are_placed_inside_their_piece(monkeypatch, tmp_path):
    monkeypatch.setenv(stage.KEY_VARIABLE, "test-key")
    monkeypatch.setattr(stage, "extract_frames", lambda ctx, piece, folder, fps: ["f1.jpg", "f2.jpg"])
    monkeypatch.setattr(stage, "ask_model", lambda model, prompt, frames, length, key: '{"actions": [{"start": 2, "end": 5}]}')
    clip = tmp_path / "a.mp4"
    clip.write_bytes(b"x")
    data = PiecesData(items=[Piece(clip=str(clip), clip_duration=60, start=10, end=30)])
    result = stage.DetectAction().run(data, stage.DetectSettings(padding_before=0, padding_after=0), ctx_for(tmp_path, cache=str(tmp_path / "cache")))
    assert [(p.clip, p.start, p.end) for p in result.items] == [(str(clip), 12.0, 15.0)]


def test_saved_results_are_reused_without_asking_the_model(monkeypatch, tmp_path):
    monkeypatch.setenv(stage.KEY_VARIABLE, "test-key")
    monkeypatch.setattr(stage, "extract_frames", lambda ctx, piece, folder, fps: ["f1.jpg"])
    clip = tmp_path / "a.mp4"
    clip.write_bytes(b"x")
    data = PiecesData(items=[Piece(clip=str(clip), clip_duration=60)])
    ctx = ctx_for(tmp_path, cache=str(tmp_path / "cache"))
    monkeypatch.setattr(stage, "ask_model", lambda *args: '{"actions": [{"start": 2, "end": 5}]}')
    first = stage.DetectAction().run(data, stage.DetectSettings(), ctx)
    monkeypatch.setattr(stage, "ask_model", lambda *args: pytest.fail("the model should not be asked again"))
    again = stage.DetectAction().run(data, stage.DetectSettings(), ctx)
    assert [(p.start, p.end) for p in again.items] == [(p.start, p.end) for p in first.items]
