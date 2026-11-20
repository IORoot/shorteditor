import os

import pytest

from collector_server.production.builtin import build_registry
from collector_server.production.pieces import VideoData
from collector_server.production.repositories import BatchRepository, LogRepository, PassRepository
from collector_server.production.schema import ensure_schema
from collector_server.production.service import NotFoundError, ProductionService, StateError
from collector_server.production.stage_api import StageStep
from collector_server.production.catalog import StageLibrary
from tests.production.helpers import FakePipelines

NOW = "2026-11-17T10:00:00+00:00"
JOIN = [StageStep(key=k) for k in ["scan_folder", "order_clips", "limit_length", "join_pieces", "render_output"]]


@pytest.fixture
def parts(db, tmp_path):
    ensure_schema(db)
    inbox = tmp_path / "in"
    inbox.mkdir()
    batches, passes, logs = BatchRepository(db), PassRepository(db), LogRepository(db)
    service = ProductionService(batches, passes, logs, StageLibrary(build_registry()), FakePipelines(), lambda: NOW, str(tmp_path / "out"), ["local", "studio"])
    return service, passes, logs, inbox, tmp_path


def create(service, inbox, **kw):
    args = {"name": "Coach Saturdays", "input_folder": str(inbox), "pipeline_id": 1, "run_on": "any", "output_root": None}
    return service.create_batch(**{**args, **kw})


def test_create_batch_makes_queued_pass_one(parts):
    service, passes, _, inbox, tmp = parts
    batch = create(service, inbox)
    [only] = passes.for_batch(batch.id)
    assert (only.number, only.status) == (1, "queued")
    assert batch.output_root == str(tmp / "out")  # the default when none is given


@pytest.mark.full
@pytest.mark.full
def test_create_batch_rejects_missing_folder(parts):
    service, _, _, inbox, tmp = parts
    with pytest.raises(ValueError, match="does not exist"):
        create(service, inbox, input_folder=str(tmp / "nope"))


@pytest.mark.full
@pytest.mark.full
def test_run_again_creates_next_pass_with_same_overrides(parts):
    service, passes, _, inbox, _ = parts
    batch = create(service, inbox)
    first = passes.for_batch(batch.id)[0]
    passes.update(first.id, status="review", overrides={"limit_length": {"choice": "keep_first"}})
    run = service.run_again(batch.id, None)
    [card] = passes.for_run(run.id)
    assert (run.number, card.status, card.overrides) == (2, "queued", {"limit_length": {"choice": "keep_first"}})


def test_run_again_refuses_while_the_batch_is_waiting_or_running(parts):
    service, _, _, inbox, _ = parts
    batch = create(service, inbox)
    with pytest.raises(StateError):
        service.run_again(batch.id, None)


@pytest.mark.full
@pytest.mark.full
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


@pytest.mark.full
@pytest.mark.full
def test_resolve_block_rejects_a_choice_that_was_not_offered(parts):
    service, passes, _, inbox, _ = parts
    made = blocked(service, passes, inbox)
    with pytest.raises(ValueError):
        service.resolve_block(made.id, "delete_everything")


@pytest.mark.full
@pytest.mark.full
def test_resolve_block_refuses_other_states(parts):
    service, passes, _, inbox, _ = parts
    made = passes.for_batch(create(service, inbox).id)[0]
    with pytest.raises(StateError):
        service.resolve_block(made.id, "keep_first")


@pytest.mark.full
@pytest.mark.full
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


@pytest.mark.full
@pytest.mark.full
def test_approve_refuses_unless_review(parts):
    service, passes, _, inbox, _ = parts
    made = passes.for_batch(create(service, inbox).id)[0]
    with pytest.raises(StateError):
        service.approve(made.id)


@pytest.mark.full
@pytest.mark.full
def test_cards_show_newest_pass_status_stage_and_queue_position(parts):
    service, passes, _, inbox, _ = parts
    first, second = create(service, inbox, name="One"), create(service, inbox, name="Two")
    running = passes.for_batch(first.id)[0]
    passes.update(running.id, status="running", stage_index=3, stage_key="join_pieces")
    cards = {c.name: c for c in service.cards()}
    assert (cards["One"].status, cards["One"].stage_title, cards["One"].stage_position, cards["One"].stage_count) == ("running", "Join in order", 4, 5)
    assert cards["One"].pipeline[0] == "Scan folder" and cards["One"].queue_position is None
    assert (cards["Two"].status, cards["Two"].queue_position) == ("queued", 0)


@pytest.mark.full
@pytest.mark.full
def test_cards_are_newest_batch_first(parts):
    service, _, _, inbox, _ = parts
    create(service, inbox, name="Old")
    create(service, inbox, name="New")
    assert [c.name for c in service.cards()] == ["New", "Old"]


@pytest.mark.full
@pytest.mark.full
def test_logs_come_back_in_order(parts):
    service, passes, logs, inbox, _ = parts
    made = passes.for_batch(create(service, inbox).id)[0]
    logs.add_many(made.id, "pipeline", [(NOW, "a")])
    logs.add_many(made.id, "pipeline", [(NOW, "b")])
    assert service.logs(made.id, "pipeline") == ["a", "b"]


@pytest.mark.full
@pytest.mark.full
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
    assert outcomes.count("ok") == 1 and len(passes.for_batch(batch.id)) == 1  # the re-run replaced the old card


@pytest.mark.full
@pytest.mark.full
def test_run_again_replaces_a_blocked_run(parts):
    service, passes, runs, inbox, _ = parts
    made = blocked(service, passes, inbox)
    run = service.run_again(made.batch_id, None)
    assert run.number == 2 and [c.status for c in passes.for_run(run.id)] == ["queued"]


@pytest.mark.full
@pytest.mark.full
def test_a_card_of_an_earlier_run_cannot_be_approved_or_resolved(parts):
    service, passes, _, inbox, _ = parts
    batch = create(service, inbox)
    old = passes.for_batch(batch.id)[0]
    passes.update(old.id, status="review", output=VideoData(path="/o/x.mp4", duration=1, size_bytes=1))
    service.run_again(batch.id, None)  # the re-run replaces the old run and its cards
    with pytest.raises(NotFoundError):
        service.approve(old.id)
    with pytest.raises(NotFoundError):
        service.resolve_block(old.id, "keep_first")


@pytest.mark.full
@pytest.mark.full
def test_a_batch_without_a_pass_does_not_break_the_board_and_can_run(parts, db):
    service, passes, _, inbox, _ = parts
    good = create(service, inbox, name="Good")
    broken = create(service, inbox, name="Broken")
    db.execute("DELETE FROM production_runs WHERE batch_id = ?", (broken.id,))
    assert [c.name for c in service.cards()] == ["Good"]
    assert service.run_again(broken.id, None).number == 1


@pytest.mark.full
@pytest.mark.full
@pytest.mark.parametrize("field", ["input_folder", "output_root", "run_on"])
def test_long_text_fields_are_refused(parts, field):
    service, _, _, inbox, _ = parts
    with pytest.raises(ValueError):
        create(service, inbox, **{field: "/" + "a" * 2000})


@pytest.mark.full
@pytest.mark.full
def test_output_folder_rules(parts):
    service, _, _, inbox, tmp = parts
    for bad in ("/", str(inbox), str(inbox / "results"), str(tmp)):
        with pytest.raises(ValueError):
            create(service, inbox, output_root=bad)
    assert create(service, inbox, output_root=str(tmp / "fresh")).output_root == str(tmp / "fresh")
    deep = str(tmp / "missing" / "deeper")
    assert create(service, inbox, output_root=deep).output_root == deep


@pytest.mark.full
@pytest.mark.full
def test_cards_carry_what_the_board_needs_to_act(parts):
    service, passes, _, inbox, _ = parts
    batch = create(service, inbox, run_on="local")
    [card] = service.cards()
    assert card.pass_id == passes.for_batch(batch.id)[0].id and card.run_on == "local" and card.batch_id == batch.id


@pytest.mark.full
@pytest.mark.full
def test_defaults_report_the_output_root_and_workers(parts):
    service, _, _, _, tmp = parts
    defaults = service.defaults()
    assert defaults.output_root == str(tmp / "out")
    assert [(w.id, w.label) for w in defaults.workers] == [("local", "local"), ("studio", "studio")]


def finished(service, passes, inbox, tmp, name="output.mp4", data=b"0123456789"):
    batch = create(service, inbox, output_root=str(tmp / "results"))
    made = passes.for_batch(batch.id)[0]
    folder = tmp / "results" / "b-1" / "pass-1"
    folder.mkdir(parents=True)
    (folder / name).write_bytes(data)
    passes.update(made.id, status="review", output=VideoData(path=str(folder / name), duration=1, size_bytes=len(data)))
    return made


@pytest.mark.full
@pytest.mark.full
def test_output_path_of_a_finished_pass(parts):
    service, passes, _, inbox, tmp = parts
    made = finished(service, passes, inbox, tmp)
    assert service.output_path(made.id) == str(tmp / "results" / "b-1" / "pass-1" / "output.mp4")


@pytest.mark.full
@pytest.mark.full
def test_output_path_refuses_a_pass_without_output(parts):
    service, passes, _, inbox, _ = parts
    made = passes.for_batch(create(service, inbox).id)[0]
    with pytest.raises(NotFoundError, match="no video"):
        service.output_path(made.id)


@pytest.mark.full
@pytest.mark.full
def test_output_path_refuses_a_missing_file(parts):
    service, passes, _, inbox, tmp = parts
    made = finished(service, passes, inbox, tmp)
    os.remove(tmp / "results" / "b-1" / "pass-1" / "output.mp4")
    with pytest.raises(NotFoundError, match="no video"):
        service.output_path(made.id)


@pytest.mark.full
@pytest.mark.full
def test_output_path_refuses_a_file_outside_the_output_root(parts):
    service, passes, _, inbox, tmp = parts
    made = passes.for_batch(create(service, inbox).id)[0]
    secret = tmp / "secret.mp4"
    secret.write_bytes(b"x")
    passes.update(made.id, status="review", output=VideoData(path=str(secret), duration=1, size_bytes=1))
    with pytest.raises(NotFoundError, match="no video"):
        service.output_path(made.id)


@pytest.mark.full
@pytest.mark.full
def test_output_path_refuses_a_link_inside_the_root_that_points_outside(parts):
    service, passes, _, inbox, tmp = parts
    made = finished(service, passes, inbox, tmp)
    secret = tmp / "secret.mp4"
    secret.write_bytes(b"x")
    link = tmp / "results" / "b-1" / "pass-1" / "link.mp4"
    os.symlink(secret, link)
    passes.update(made.id, output=VideoData(path=str(link), duration=1, size_bytes=1))
    with pytest.raises(NotFoundError, match="no video"):
        service.output_path(made.id)


@pytest.mark.full
@pytest.mark.full
def test_output_path_refuses_a_sibling_folder_with_the_same_prefix(parts):
    service, passes, _, inbox, tmp = parts
    made = finished(service, passes, inbox, tmp)
    sibling = tmp / "results2"
    sibling.mkdir()
    (sibling / "x.mp4").write_bytes(b"x")
    passes.update(made.id, output=VideoData(path=str(sibling / "x.mp4"), duration=1, size_bytes=1))
    with pytest.raises(NotFoundError, match="no video"):
        service.output_path(made.id)


def test_output_path_returns_the_checked_real_path(parts):
    service, passes, _, inbox, tmp = parts
    made = finished(service, passes, inbox, tmp)
    real = tmp / "results" / "b-1" / "pass-1" / "output.mp4"
    detour = tmp / "results" / "b-1" / "pass-1" / ".." / "pass-1" / "output.mp4"
    passes.update(made.id, output=VideoData(path=str(detour), duration=1, size_bytes=1))
    assert service.output_path(made.id) == os.path.realpath(real)


@pytest.mark.full
def test_picks_are_refused_when_empty_and_do_not_carry_into_the_next_pass(parts):
    service, passes, _, inbox, _ = parts
    made = blocked(service, passes, inbox)
    with pytest.raises(ValueError):
        service.resolve_block(made.id, "Keep the picked clips", [])
    passes.update(made.id, status="failed", overrides={"review_by_hand": {"picks": [0]}})
    run = service.run_again(made.batch_id, None)
    [card] = passes.for_run(run.id)
    assert card.overrides == {}
