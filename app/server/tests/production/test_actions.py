import os

import pytest

from collector_server.production.builtin import build_registry
from collector_server.production.catalog import StageLibrary
from collector_server.shared.errors import NotFoundError
from collector_server.production.pieces import VideoData
from collector_server.production.registry import StageRegistry
from collector_server.production.repositories import BatchRepository, LogRepository, PassRepository, RunRepository
from collector_server.production.runner import PassRunner
from collector_server.production.schema import ensure_schema
from collector_server.production.service import ProductionService, StateError
from collector_server.production.stage_api import StageStep
from collector_server.production.worker import LocalWorker
from tests.production.helpers import FakePipelines, FakeStage

NOW = "2026-11-17T10:00:00+00:00"


@pytest.fixture
def parts(db, tmp_path):
    ensure_schema(db)
    inbox = tmp_path / "in"
    inbox.mkdir()
    batches, passes, logs = BatchRepository(db), PassRepository(db), LogRepository(db)
    service = ProductionService(batches, passes, logs, StageLibrary(build_registry()), FakePipelines(), lambda: NOW, str(tmp_path / "out"), ["local"])
    return service, passes, RunRepository(db), logs, inbox, tmp_path


def clip(folder, name="a.mp4"):
    folder.mkdir(parents=True, exist_ok=True)
    (folder / name).write_bytes(b"x")


def make_batch(service, inbox, *folders):
    for name in folders:
        clip(inbox / name)
    return service.create_batch("Coach", str(inbox), 1, "any", None)


def cards_of(passes, batch_id):
    return passes.for_batch(batch_id)


def test_pause_and_resume_a_queued_card(parts):
    service, passes, _, _, inbox, _ = parts
    batch = make_batch(service, inbox, "class-1")
    [card] = cards_of(passes, batch.id)
    assert service.card_action(card.id, "pause") == "Paused"
    assert passes.get(card.id).status == "paused"
    assert service.card_action(card.id, "resume") == "Resumed"
    assert passes.get(card.id).status == "queued"


def test_actions_that_do_not_apply_are_refused_with_a_reason(parts):
    service, passes, _, _, inbox, _ = parts
    batch = make_batch(service, inbox, "class-1")
    [card] = cards_of(passes, batch.id)
    with pytest.raises(StateError, match="A queued card cannot be resumed"):
        service.card_action(card.id, "resume")
    passes.update(card.id, status="approved")
    with pytest.raises(StateError, match="cannot be paused"):
        service.card_action(card.id, "pause")
    with pytest.raises(StateError, match="cannot be stopped"):
        service.card_action(card.id, "stop")


def test_stop_a_card_then_rerun_it_clears_its_result_and_keeps_its_choices(parts):
    service, passes, _, _, inbox, _ = parts
    batch = make_batch(service, inbox, "class-1")
    [card] = cards_of(passes, batch.id)
    passes.update(card.id, status="failed", error="boom", overrides={"limit_length": {"choice": "keep_first"}}, output=VideoData(path="/o.mp4", duration=1, size_bytes=1))
    service.card_action(card.id, "rerun")
    fresh = passes.get(card.id)
    assert (fresh.status, fresh.error, fresh.output, fresh.overrides) == ("queued", None, None, {"limit_length": {"choice": "keep_first"}})


def test_a_card_that_is_waiting_cannot_be_run_again(parts):
    service, passes, _, _, inbox, _ = parts
    [card] = cards_of(passes, make_batch(service, inbox, "class-1").id)
    with pytest.raises(StateError, match="already waiting or running"):
        service.card_action(card.id, "rerun")


def test_delete_a_card_removes_its_logs_and_keeps_its_output_file(parts, tmp_path):
    service, passes, _, logs, inbox, _ = parts
    batch = make_batch(service, inbox, "class-1")
    [card] = cards_of(passes, batch.id)
    video = tmp_path / "out" / "done.mp4"
    video.parent.mkdir(parents=True, exist_ok=True)
    video.write_bytes(b"video")
    passes.update(card.id, output=VideoData(path=str(video), duration=1, size_bytes=5), status="review")
    logs.add_many(card.id, "pipeline", [(NOW, "hello")])
    service.card_action(card.id, "delete")
    assert passes.get(card.id) is None and logs.for_pass(card.id, "pipeline") == []
    assert video.exists()


def test_a_running_card_cannot_be_deleted(parts):
    service, passes, _, _, inbox, _ = parts
    [card] = cards_of(passes, make_batch(service, inbox, "class-1").id)
    passes.update(card.id, status="running")
    with pytest.raises(StateError, match="Stop it first"):
        service.card_action(card.id, "delete")


def test_batch_pause_holds_every_waiting_card_and_resume_releases_them(parts):
    service, passes, _, _, inbox, _ = parts
    batch = make_batch(service, inbox, "class-1", "class-2")
    assert service.batch_action(batch.id, "pause") == "Paused 2 cards"
    assert [c.status for c in cards_of(passes, batch.id)] == ["paused", "paused"]
    assert service.batch_action(batch.id, "resume") == "Resumed 2 cards"
    assert [c.status for c in cards_of(passes, batch.id)] == ["queued", "queued"]


def test_batch_stop_stops_only_cards_that_have_not_finished(parts):
    service, passes, _, _, inbox, _ = parts
    batch = make_batch(service, inbox, "class-1", "class-2")
    a, b = cards_of(passes, batch.id)
    passes.update(a.id, status="approved")
    service.batch_action(batch.id, "stop")
    assert [c.status for c in cards_of(passes, batch.id)] == ["approved", "stopped"]


def test_a_batch_with_nothing_to_act_on_says_so(parts):
    service, passes, _, _, inbox, _ = parts
    batch = make_batch(service, inbox, "class-1")
    [card] = cards_of(passes, batch.id)
    passes.update(card.id, status="approved")
    with pytest.raises(StateError, match="Nothing in this batch can be paused"):
        service.batch_action(batch.id, "pause")


def test_batch_rerun_replaces_the_run_and_batch_delete_keeps_outputs(parts, tmp_path):
    service, passes, runs, _, inbox, _ = parts
    batch = make_batch(service, inbox, "class-1")
    [card] = cards_of(passes, batch.id)
    passes.update(card.id, status="stopped")
    service.batch_action(batch.id, "rerun")
    assert [r.number for r in runs.for_batch(batch.id)] == [2]
    service.batch_action(batch.id, "stop")
    assert service.batch_action(batch.id, "delete") == "Deleted"
    assert service.batch_list() == []


def test_a_batch_with_a_running_card_cannot_be_rerun_or_deleted(parts):
    service, passes, _, _, inbox, _ = parts
    batch = make_batch(service, inbox, "class-1")
    [card] = cards_of(passes, batch.id)
    passes.update(card.id, status="running")
    with pytest.raises(StateError, match="waiting or running"):
        service.batch_action(batch.id, "rerun")
    with pytest.raises(StateError, match="cannot be deleted"):
        service.batch_action(batch.id, "delete")


def test_bulk_actions_report_each_item_and_carry_on_past_a_failure(parts):
    service, passes, _, _, inbox, _ = parts
    a = make_batch(service, inbox, "class-1")
    [card] = cards_of(passes, a.id)
    results = service.card_actions([card.id, 9999], "pause")
    assert [(r.id, r.ok) for r in results] == [(card.id, True), (9999, False)]
    assert "no pass" in results[1].message.lower() or "There is no" in results[1].message
    assert passes.get(card.id).status == "paused"
    batch_results = service.batch_actions([a.id, 9999], "stop")
    assert [r.ok for r in batch_results] == [True, False]


def test_a_card_picture_comes_from_the_first_clip_in_its_own_folder(parts, monkeypatch):
    import collector_server.production.service as service_module

    service, passes, _, _, inbox, tmp = parts
    batch = make_batch(service, inbox, "class-1", "class-2")
    second = [c for c in cards_of(passes, batch.id) if c.folder.endswith("class-2")][0]
    looked_at, made = [], []

    def fake_first(folder):
        looked_at.append(folder)
        return folder + "/first.mp4"

    def fake_make(clip, target):
        made.append((clip, target))
        return True

    monkeypatch.setattr(service_module, "first_clip", fake_first)
    monkeypatch.setattr(service_module, "make_thumbnail", fake_make)
    path = service.card_thumbnail_path(second.id)
    assert looked_at == [second.folder]
    assert path.endswith(f"/.thumbnails/card-{second.id}.jpg") and made == [(second.folder + "/first.mp4", path)]

def test_a_card_from_an_earlier_run_is_gone_once_a_new_run_starts(parts):
    service, passes, _, _, inbox, _ = parts
    batch = make_batch(service, inbox, "class-1")
    [old] = cards_of(passes, batch.id)
    passes.update(old.id, status="stopped")
    service.run_again(batch.id, None)
    with pytest.raises(NotFoundError, match="There is no pass"):
        service.card_action(old.id, "resume")


class Pauser(FakeStage):
    """Pauses its own card while it runs, as a click on Pause would."""

    def __init__(self, passes, seen):
        super().__init__("pauser", "Pauser", {"none": "video"})
        self.passes, self.seen = passes, seen

    def run(self, data, settings, ctx):
        self.passes.update(self.seen["id"], only_if_status="running", status="paused")
        return VideoData(path="/x.mp4", duration=1, size_bytes=1)


class Later(FakeStage):
    def __init__(self, seen):
        super().__init__("later", "Later", {"video": "video"})
        self.seen = seen

    def run(self, data, settings, ctx):
        self.seen["later_ran"] = True
        return data


def test_a_card_paused_while_it_runs_stops_before_its_next_stage(db, tmp_path):
    from tests.production.test_runner import Env

    seen = {}
    registry = StageRegistry()
    registry.register(Pauser(PassRepository(db), seen))
    registry.register(Later(seen))
    env = Env(db, tmp_path, registry)
    queued = env.queue(keys=["pauser", "later"])
    seen["id"] = queued.id
    done = env.run(queued)
    assert done.status == "paused" and done.output is None
    assert "later_ran" not in seen
    assert "Stopped" in "\n".join(env.logs.for_pass(queued.id, "pipeline"))
