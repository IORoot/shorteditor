import pytest

from collector_server.production.pieces import Piece, PiecesData
from collector_server.production.stage_api import StageContext, StageError
from collector_server.production.stages import detect_action as stage


@pytest.fixture(autouse=True)
def text_only_first_message(monkeypatch):
    # the tests use no real frames, so the first message is just the prompt
    monkeypatch.setattr(stage, "first_content", lambda prompt, frames, length: [{"type": "text", "text": prompt}])


def ctx_for(tmp_path, cache=None, key=None):
    return StageContext(str(tmp_path), str(tmp_path), str(tmp_path), None, lambda line: None, cache_root=cache, ai_key=key)


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


def test_a_missing_key_fails_plainly(tmp_path):
    data = PiecesData(items=[Piece(clip="/clips/a.mp4", clip_duration=20)])
    with pytest.raises(StageError, match="OpenRouter key in Settings"):
        stage.DetectAction().run(data, stage.DetectSettings(), ctx_for(tmp_path))


def test_action_parts_are_placed_inside_their_piece(monkeypatch, tmp_path):
    monkeypatch.setattr(stage, "extract_frames", lambda ctx, piece, folder, fps: ["f1.jpg", "f2.jpg"])
    monkeypatch.setattr(stage, "send", lambda model, messages, key: ('{"actions": [{"start": 2, "end": 5}]}', "stop"))
    clip = tmp_path / "a.mp4"
    clip.write_bytes(b"x")
    data = PiecesData(items=[Piece(clip=str(clip), clip_duration=60, start=10, end=30)])
    result = stage.DetectAction().run(data, stage.DetectSettings(padding_before=0, padding_after=0), ctx_for(tmp_path, cache=str(tmp_path / "cache"), key="test-key"))
    assert [(p.clip, p.start, p.end) for p in result.items] == [(str(clip), 12.0, 15.0)]


def test_saved_results_are_reused_without_asking_the_model(monkeypatch, tmp_path):
    monkeypatch.setattr(stage, "extract_frames", lambda ctx, piece, folder, fps: ["f1.jpg"])
    clip = tmp_path / "a.mp4"
    clip.write_bytes(b"x")
    data = PiecesData(items=[Piece(clip=str(clip), clip_duration=60)])
    ctx = ctx_for(tmp_path, cache=str(tmp_path / "cache"), key="test-key")
    monkeypatch.setattr(stage, "send", lambda *args: ('{"actions": [{"start": 2, "end": 5}]}', "stop"))
    first = stage.DetectAction().run(data, stage.DetectSettings(), ctx)
    monkeypatch.setattr(stage, "send", lambda *args: pytest.fail("the model should not be asked again"))
    again = stage.DetectAction().run(data, stage.DetectSettings(), ctx)
    assert [(p.start, p.end) for p in again.items] == [(p.start, p.end) for p in first.items]
    asked = []
    monkeypatch.setattr(stage, "send", lambda *args: asked.append(args) or ('{"actions": [{"start": 1, "end": 3}]}', "stop"))
    stage.DetectAction().run(data, stage.DetectSettings(prompt="Find the goals."), ctx)
    assert len(asked) == 1  # a changed prompt is a different result, so the model is asked again


@pytest.mark.full
def test_the_sections_answer_is_read_and_variables_are_filled():
    assert stage.parse_actions('{"sections": [{"start": 1.0, "end": 4.0, "action": "vault attempt"}]}', 10) == [(1.0, 4.0)]
    values = {"SOURCE_NAME": "a.mov", "DURATION_SECONDS": "12.3", "MAX_CUT_CONTEXT_SECONDS": "0.25", "MAX_CLASS_CUT_SECONDS": "60"}
    assert stage.render("{{SOURCE_NAME}} {{DURATION_SECONDS}} {{MAX_CUT_CONTEXT_SECONDS}} {{MAX_CLASS_CUT_SECONDS}}", values) == "a.mov 12.3 0.25 60"


@pytest.mark.full
def test_a_prompt_naming_an_undefined_variable_fails_before_the_model_is_asked(tmp_path, monkeypatch):
    monkeypatch.setattr(stage, "send", lambda *args: pytest.fail("no clip should be sent"))
    data = PiecesData(items=[Piece(clip="/clips/a.mp4", clip_duration=20)])
    with pytest.raises(StageError, match=r"\{\{CLASS_LIMIT\}\}"):
        stage.DetectAction().run(data, stage.DetectSettings(prompt="Keep clips under {{CLASS_LIMIT}} s."), ctx_for(tmp_path, key="k"))


@pytest.mark.full
def test_a_user_variable_fills_the_prompt_sent_to_the_model(monkeypatch, tmp_path):
    sent = []
    monkeypatch.setattr(stage, "extract_frames", lambda ctx, piece, folder, fps: ["f1.jpg"])
    monkeypatch.setattr(stage, "send", lambda model, messages, key: sent.append(list(messages)) or ('{"actions": [{"start": 1, "end": 2}]}', "stop"))
    clip = tmp_path / "a.mp4"
    clip.write_bytes(b"x")
    data = PiecesData(items=[Piece(clip=str(clip), clip_duration=20)])
    settings = stage.DetectSettings(prompt="Max {{CLASS_LIMIT}} s in {{SOURCE_NAME}}.", variables={"CLASS_LIMIT": "45"}, reuse_results=False)
    with open(tmp_path / "f1.jpg", "wb") as f:
        f.write(b"x")
    stage.DetectAction().run(data, settings, ctx_for(tmp_path, key="k"))
    assert sent[0][0]["content"][0]["text"] == "Max 45 s in a.mp4."


@pytest.mark.full
def test_an_unreadable_answer_is_asked_again_with_the_retry_prompt(monkeypatch, tmp_path):
    answers = iter([("I cannot say.", "stop"), ('{"sections": [{"start": 1, "end": 3}]}', "stop")])
    sent = []

    def fake_send(model, messages, key):
        sent.append(list(messages))
        return next(answers)

    monkeypatch.setattr(stage, "send", fake_send)
    settings = stage.DetectSettings(retry_prompt="Try again, JSON only.")
    raw = stage.ask_until_usable(ctx_for(tmp_path, key="k"), settings, {}, [{"type": "text", "text": "go"}], 10, "k")
    assert raw == [(1.0, 3.0)]
    assert sent[1][-1] == {"role": "user", "content": "Try again, JSON only."}


@pytest.mark.full
def test_a_cut_off_answer_gets_the_output_limit_prompt(monkeypatch, tmp_path):
    answers = iter([('{"sections": [{"start": 1', "length"), ('{"sections": [{"start": 1, "end": 2}]}', "stop")])
    sent = []
    monkeypatch.setattr(stage, "send", lambda model, messages, key: sent.append(list(messages)) or next(answers))
    settings = stage.DetectSettings(output_limit_retry_prompt="Shorter please.")
    assert stage.ask_until_usable(ctx_for(tmp_path, key="k"), settings, {}, [{"type": "text", "text": "go"}], 10, "k") == [(1.0, 2.0)]
    assert sent[1][-1]["content"] == "Shorter please."


@pytest.mark.full
def test_invalid_timestamps_are_named_in_the_invalid_timestamp_prompt(monkeypatch, tmp_path):
    answers = iter([('{"sections": [{"start": 6, "end": 2}, {"start": 1, "end": 3}]}', "stop"), ('{"sections": [{"start": 1, "end": 3}]}', "stop")])
    sent = []
    monkeypatch.setattr(stage, "send", lambda model, messages, key: sent.append(list(messages)) or next(answers))
    settings = stage.DetectSettings(invalid_timestamp_prompt="Bad: {{PROBLEMS}} within {{DURATION_SECONDS}}.")
    assert stage.ask_until_usable(ctx_for(tmp_path, key="k"), settings, {"DURATION_SECONDS": "10.0"}, [{"type": "text", "text": "go"}], 10, "k") == [(1.0, 3.0)]
    assert sent[1][-1]["content"] == "Bad: 6 to 2 ends before it starts within 10.0."


@pytest.mark.full
def test_a_variable_cannot_take_a_built_in_name():
    with pytest.raises(ValueError, match="built in"):
        stage.DetectSettings(variables={"SOURCE_NAME": "x"})


@pytest.mark.full
def test_a_clip_openrouter_refuses_is_skipped_and_not_saved(monkeypatch, tmp_path):
    def refuse(*args):
        raise stage.ClipRefused()

    monkeypatch.setattr(stage, "send", refuse)
    monkeypatch.setattr(stage, "extract_frames", lambda ctx, piece, folder, fps: ["f1.jpg"])
    clip = tmp_path / "a.mp4"
    clip.write_bytes(b"x")
    cache = tmp_path / "cache"
    logs = []
    ctx = StageContext(str(tmp_path), str(tmp_path), str(tmp_path), None, logs.append, cache_root=str(cache), ai_key="k")
    data = PiecesData(items=[Piece(clip=str(clip), clip_duration=20)])
    with pytest.raises(StageError, match="no action"):
        stage.DetectAction().run(data, stage.DetectSettings(), ctx)
    assert any("Skipped a.mp4" in line for line in logs)
    assert not cache.exists() or not any(cache.rglob("*.json"))


@pytest.mark.full
def test_http_errors_name_their_cause(monkeypatch):
    import io
    import urllib.error

    def failing(code):
        def opener(*args, **kwargs):
            raise urllib.error.HTTPError("u", code, "x", {}, io.BytesIO(b""))
        return opener

    monkeypatch.setattr(stage.urllib.request, "urlopen", failing(401))
    with pytest.raises(StageError, match="did not accept the key"):
        stage.send("m", [], "k")
    monkeypatch.setattr(stage.urllib.request, "urlopen", failing(404))
    with pytest.raises(StageError, match="does not know the model m"):
        stage.send("m", [], "k")
    monkeypatch.setattr(stage.urllib.request, "urlopen", failing(422))
    with pytest.raises(stage.ClipRefused):
        stage.send("m", [], "k")


@pytest.mark.full
def test_the_time_the_model_took_to_answer_is_logged(monkeypatch, tmp_path):
    monkeypatch.setattr(stage, "send", lambda *args: ('{"sections": []}', "stop"))
    logs = []
    ctx = StageContext(str(tmp_path), str(tmp_path), str(tmp_path), None, logs.append, cache_root=None, ai_key="k", ai_model="m/one")
    stage.ask_until_usable(ctx, stage.DetectSettings(), {}, [{"type": "text", "text": "go"}], 10, "k")
    assert any(line.startswith("Answer from m/one after 0 s") and "stopped because stop" in line for line in logs)
