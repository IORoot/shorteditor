import os

import pytest

from collector_server.production.builtin import build_registry
from collector_server.production.pieces import VideoData
from collector_server.production.repositories import BatchRepository, LogRepository, PassRepository
from collector_server.production.schema import ensure_schema
from collector_server.production.service import NotFoundError, ProductionService, StateError
from collector_server.production.stage_api import StageStep

NOW = "2026-11-17T10:00:00+00:00"
JOIN = [StageStep(key=k) for k in ["scan_folder", "order_clips", "limit_length", "join_pieces", "render_output"]]


@pytest.fixture
def parts(db, tmp_path):
    ensure_schema(db)
    inbox = tmp_path / "in"
    inbox.mkdir()
    batches, passes, logs = BatchRepository(db), PassRepository(db), LogRepository(db)
    service = ProductionService(batches, passes, logs, build_registry(), lambda: NOW, str(tmp_path / "out"), ["local", "studio"])
    return service, passes, logs, inbox, tmp_path


def create(service, inbox, **kw):
    args = {"name": "Coach Saturdays", "input_folder": str(inbox), "steps": JOIN, "run_on": "any", "output_root": None}
    return service.create_batch(**{**args, **kw})


def test_create_batch_makes_queued_pass_one(parts):
    service, passes, _, inbox, tmp = parts
    batch = create(service, inbox)
    [only] = passes.for_batch(batch.id)
    assert (only.number, only.status) == (1, "queued")
    assert batch.output_root == str(tmp / "out")  # the default when none is given


@pytest.mark.parametrize(
    "change, message",
    [
        ({"steps": [StageStep(key="join_pieces")]}, "must be first|needs pieces"),
        ({"steps": []}, "no steps"),
        ({"input_folder": "relative/path"}, "absolute"),
        ({"output_root": "relative"}, "absolute"),
        ({"name": "   "}, "name"),
        ({"name": "x" * 121}, "name"),
        ({"run_on": "ghost"}, "worker"),
        ({"steps": [StageStep(key="scan_folder"), StageStep(key="limit_length", settings={"maxSeconds": -1}), StageStep(key="join_pieces"), StageStep(key="render_output")]}, "settings for Limit length"),
    ],
)
def test_create_batch_rejects_bad_input_with_a_plain_message(parts, change, message):
    service, _, _, inbox, _ = parts
    with pytest.raises(ValueError, match=message):
        create(service, inbox, **change)


def test_create_batch_rejects_missing_folder(parts):
    service, _, _, inbox, tmp = parts
    with pytest.raises(ValueError, match="does not exist"):
        create(service, inbox, input_folder=str(tmp / "nope"))


def test_run_again_creates_next_pass_with_same_overrides(parts):
    service, passes, _, inbox, _ = parts
    batch = create(service, inbox)
    first = passes.for_batch(batch.id)[0]
    passes.update(first.id, status="review", overrides={"limit_length": {"choice": "keep_first"}})
    again = service.run_again(batch.id, None)
    assert (again.number, again.status, again.overrides) == (2, "queued", {"limit_length": {"choice": "keep_first"}})


def test_run_again_can_replace_the_pipeline(parts):
    service, passes, _, inbox, _ = parts
    batch = create(service, inbox)
    passes.update(passes.for_batch(batch.id)[0].id, status="review")
    short = [StageStep(key="scan_folder"), StageStep(key="join_pieces"), StageStep(key="render_output")]
    service.run_again(batch.id, short)
    assert [s.key for s in service.detail(batch.id)[0].steps] == ["scan_folder", "join_pieces", "render_output"]


def test_run_again_refuses_while_the_batch_is_waiting_or_running(parts):
    service, _, _, inbox, _ = parts
    batch = create(service, inbox)
    with pytest.raises(StateError):
        service.run_again(batch.id, None)


def test_unknown_batch_and_pass_raise_not_found(parts):
    service, *_ = parts
    for call in (lambda: service.run_again(99, None), lambda: service.detail(99), lambda: service.approve(99), lambda: service.resolve_block(99, "x"), lambda: service.logs(99, "pipeline")):
        with pytest.raises(NotFoundError):
            call()


def blocked(service, passes, inbox):
    batch = create(service, inbox)
    made = passes.for_batch(batch.id)[0]
    passes.update(made.id, status="blocked", stage_key="limit_length", blocked_reason="Over", blocked_choices=["drop_shortest", "keep_first"])
    return made


def test_resolve_block_requeues_with_choice(parts):
    service, passes, _, inbox, _ = parts
    made = blocked(service, passes, inbox)
    after = service.resolve_block(made.id, "keep_first")
    assert after.status == "queued" and after.overrides == {"limit_length": {"choice": "keep_first"}}


def test_resolve_block_rejects_a_choice_that_was_not_offered(parts):
    service, passes, _, inbox, _ = parts
    made = blocked(service, passes, inbox)
    with pytest.raises(ValueError):
        service.resolve_block(made.id, "delete_everything")


def test_resolve_block_refuses_other_states(parts):
    service, passes, _, inbox, _ = parts
    made = passes.for_batch(create(service, inbox).id)[0]
    with pytest.raises(StateError):
        service.resolve_block(made.id, "keep_first")


def test_approve_returns_handoff_with_the_output_file(parts):
    service, passes, _, inbox, tmp = parts
    made = passes.for_batch(create(service, inbox).id)[0]
    out = tmp / "out" / "b-1" / "pass-1"
    out.mkdir(parents=True)
    (out / "output.mp4").write_bytes(b"12345")
    passes.update(made.id, status="review", output=VideoData(path=str(out / "output.mp4"), duration=1, size_bytes=5))
    handoff = service.approve(made.id)
    assert (handoff.stage, handoff.run_id) == ("production", made.id)
    assert handoff.folders[0].path == str(out)
    assert [(c.name, c.size_bytes) for c in handoff.folders[0].clips] == [("output.mp4", 5)]
    assert passes.get(made.id).status == "approved"


def test_approve_refuses_unless_review(parts):
    service, passes, _, inbox, _ = parts
    made = passes.for_batch(create(service, inbox).id)[0]
    with pytest.raises(StateError):
        service.approve(made.id)


def test_cards_show_newest_pass_status_stage_and_queue_position(parts):
    service, passes, _, inbox, _ = parts
    first, second = create(service, inbox, name="One"), create(service, inbox, name="Two")
    running = passes.for_batch(first.id)[0]
    passes.update(running.id, status="running", stage_index=3, stage_key="join_pieces")
    cards = {c.name: c for c in service.cards()}
    assert (cards["One"].status, cards["One"].stage_title, cards["One"].stage_position, cards["One"].stage_count) == ("running", "Join in order", 4, 5)
    assert cards["One"].pipeline[0] == "Scan folder" and cards["One"].queue_position is None
    assert (cards["Two"].status, cards["Two"].queue_position) == ("queued", 0)


def test_cards_are_newest_batch_first(parts):
    service, _, _, inbox, _ = parts
    create(service, inbox, name="Old")
    create(service, inbox, name="New")
    assert [c.name for c in service.cards()] == ["New", "Old"]


def test_logs_come_back_in_order(parts):
    service, passes, logs, inbox, _ = parts
    made = passes.for_batch(create(service, inbox).id)[0]
    logs.add_many(made.id, "pipeline", [(NOW, "a")])
    logs.add_many(made.id, "pipeline", [(NOW, "b")])
    assert service.logs(made.id, "pipeline") == ["a", "b"]


def test_stages_lists_the_library_with_settings_schema(parts):
    service, *_ = parts
    stages = {s.key: s for s in service.stages()}
    assert stages["limit_length"].transitions == {"pieces": "pieces"}
    assert "maxSeconds" in stages["limit_length"].settings_schema["properties"]
    assert stages["scan_folder"].position == "first"


def test_card_stage_follows_enabled_steps_only(parts):
    service, passes, _, inbox, _ = parts
    steps = [StageStep(key="scan_folder"), StageStep(key="order_clips", enabled=False), StageStep(key="limit_length"), StageStep(key="join_pieces"), StageStep(key="render_output")]
    batch = create(service, inbox, steps=steps)
    passes.update(passes.for_batch(batch.id)[0].id, status="running", stage_index=1, stage_key="limit_length")
    [card] = service.cards()
    assert (card.stage_title, card.stage_position, card.stage_count) == ("Limit length", 2, 4)
    assert card.pipeline == ["Scan folder", "Limit length", "Join in order", "Render"]


def test_run_again_from_two_threads_makes_only_one_pass(parts):
    import threading

    service, passes, _, inbox, _ = parts
    batch = create(service, inbox)
    passes.update(passes.for_batch(batch.id)[0].id, status="approved")
    outcomes = []

    def go():
        try:
            service.run_again(batch.id, None)
            outcomes.append("ok")
        except StateError:
            outcomes.append("refused")

    threads = [threading.Thread(target=go) for _ in range(8)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert outcomes.count("ok") == 1 and len(passes.for_batch(batch.id)) == 2


def test_run_again_is_refused_while_the_latest_pass_is_blocked(parts):
    service, passes, _, inbox, _ = parts
    made = blocked(service, passes, inbox)
    with pytest.raises(StateError, match="blocked"):
        service.run_again(made.batch_id, None)


def test_only_the_latest_pass_can_be_approved_or_resolved(parts):
    service, passes, _, inbox, _ = parts
    batch = create(service, inbox)
    old = passes.for_batch(batch.id)[0]
    passes.update(old.id, status="review", output=VideoData(path="/o/x.mp4", duration=1, size_bytes=1))
    service.run_again(batch.id, None)
    with pytest.raises(StateError, match="newest"):
        service.approve(old.id)
    passes.update(old.id, status="blocked", blocked_choices=["keep_first"], stage_key="limit_length")
    with pytest.raises(StateError, match="newest"):
        service.resolve_block(old.id, "keep_first")


def test_a_batch_without_a_pass_does_not_break_the_board_and_can_run(parts, db):
    service, passes, _, inbox, _ = parts
    good = create(service, inbox, name="Good")
    broken = create(service, inbox, name="Broken")
    db.execute("DELETE FROM production_passes WHERE batch_id = ?", (broken.id,))
    assert [c.name for c in service.cards()] == ["Good"]
    assert service.run_again(broken.id, None).number == 1


def test_steps_are_capped_and_disabled_steps_are_checked_too(parts):
    service, _, _, inbox, _ = parts
    with pytest.raises(ValueError, match="at most"):
        create(service, inbox, steps=[StageStep(key="limit_length")] * 31)
    junk = StageStep(key="order_clips", enabled=False, settings={"x": "y" * 5000})
    with pytest.raises(ValueError, match="too large"):
        create(service, inbox, steps=[JOIN[0], junk, *JOIN[3:]])
    with pytest.raises(ValueError, match="no stage called"):
        create(service, inbox, steps=[JOIN[0], StageStep(key="nope", enabled=False), *JOIN[3:]])


@pytest.mark.parametrize("field", ["input_folder", "output_root", "run_on"])
def test_long_text_fields_are_refused(parts, field):
    service, _, _, inbox, _ = parts
    with pytest.raises(ValueError):
        create(service, inbox, **{field: "/" + "a" * 2000})


def test_output_folder_rules(parts):
    service, _, _, inbox, tmp = parts
    for bad in ("/", str(inbox), str(inbox / "results"), str(tmp), str(tmp / "missing" / "deeper")):
        with pytest.raises(ValueError):
            create(service, inbox, output_root=bad)
    assert create(service, inbox, output_root=str(tmp / "fresh")).output_root == str(tmp / "fresh")


def test_cards_carry_what_the_board_needs_to_act(parts):
    service, passes, _, inbox, _ = parts
    batch = create(service, inbox, run_on="local")
    [card] = service.cards()
    assert card.pass_id == passes.for_batch(batch.id)[0].id and card.run_on == "local" and card.batch_id == batch.id
