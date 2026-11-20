import pytest

from collector_server.production.builtin import build_registry
from collector_server.production.catalog import StageLibrary
from collector_server.production.repositories import BatchRepository, LogRepository, PassRepository
from collector_server.production.schema import ensure_schema
from collector_server.production.service import ProductionService, StateError
from tests.production.helpers import FakePipelines

NOW = "2026-11-17T10:00:00+00:00"


@pytest.fixture
def parts(db, tmp_path):
    ensure_schema(db)
    inbox = tmp_path / "in"
    inbox.mkdir()
    batches, passes = BatchRepository(db), PassRepository(db)
    service = ProductionService(batches, passes, LogRepository(db), StageLibrary(build_registry()), FakePipelines(), lambda: NOW, str(tmp_path / "out"), ["local"])
    return service, passes, inbox


def make(service, inbox, auto_run, *folders):
    for name in folders:
        (inbox / name).mkdir(exist_ok=True)
        (inbox / name / "a.mp4").write_bytes(b"x")
    return service.create_batch("Coach", str(inbox), 1, "any", None, auto_run=auto_run)


def statuses(passes, batch_id):
    return [c.status for c in passes.for_batch(batch_id)]


def test_a_batch_made_without_auto_run_holds_its_cards(parts):
    service, passes, inbox = parts
    batch = make(service, inbox, False, "class-1", "class-2")
    assert batch.auto_run is False
    assert statuses(passes, batch.id) == ["held", "held"]
    assert passes.queued() == []
    assert [i.status for i in service.batch_list() if i.id == batch.id] == ["held"]


def test_a_batch_made_with_auto_run_queues_its_cards(parts):
    service, passes, inbox = parts
    batch = make(service, inbox, True, "class-1")
    assert batch.auto_run is True and statuses(passes, batch.id) == ["queued"]


def test_a_held_card_starts_on_resume_and_can_be_stopped(parts):
    service, passes, inbox = parts
    batch = make(service, inbox, False, "class-1", "class-2")
    a, b = passes.for_batch(batch.id)
    with pytest.raises(StateError):
        service.card_action(a.id, "pause")
    service.card_action(a.id, "resume")
    service.card_action(b.id, "stop")
    assert statuses(passes, batch.id) == ["queued", "stopped"]


def test_turning_auto_run_on_starts_the_held_cards(parts):
    service, passes, inbox = parts
    batch = make(service, inbox, False, "class-1", "class-2")
    service.update_batch(batch.id, None, None, True)
    assert statuses(passes, batch.id) == ["queued", "queued"]
    assert service.detail(batch.id)[0].auto_run is True


def test_turning_auto_run_off_leaves_what_is_already_queued_alone(parts):
    service, passes, inbox = parts
    batch = make(service, inbox, True, "class-1")
    service.update_batch(batch.id, None, None, False)
    assert statuses(passes, batch.id) == ["queued"]
    assert service.detail(batch.id)[0].auto_run is False


def test_a_run_again_follows_the_batch_setting(parts):
    service, passes, inbox = parts
    batch = make(service, inbox, False, "class-1")
    [card] = passes.for_batch(batch.id)
    passes.update(card.id, status="approved")
    service.run_again(batch.id, None)
    assert statuses(passes, batch.id) == ["held"]
