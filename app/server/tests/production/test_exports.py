import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from collector_server.production.api import build_router
from collector_server.production.builtin import build_registry
from collector_server.production.catalog import StageLibrary
from collector_server.production.export_repository import ExportRepository
from collector_server.production.repositories import BatchRepository, LogRepository, PassRepository
from collector_server.production.schema import ensure_schema
from collector_server.production.service import ProductionService
from tests.production.helpers import FakePipelines

NOW = "2026-11-21T10:00:00+00:00"
LATER = "2026-11-21T11:00:00+00:00"


@pytest.fixture
def world(db, tmp_path):
    ensure_schema(db)
    batches, passes, logs = BatchRepository(db), PassRepository(db), LogRepository(db)
    batch = batches.create("Saturday class", str(tmp_path), 1, [], "any", str(tmp_path / "out"), NOW)
    card = passes.create(batch.id, NOW)
    clock = {"now": NOW}
    exports = ExportRepository(db, lambda: clock["now"])
    service = ProductionService(batches, passes, logs, StageLibrary(build_registry()), FakePipelines(), lambda: NOW, str(tmp_path / "out"), ["local"], exports=exports)
    app = FastAPI()
    app.include_router(build_router(service))

    class World:
        pass

    w = World()
    w.exports, w.passes, w.batch, w.card, w.clock, w.client = exports, passes, batch, card, clock, TestClient(app)
    return w


def test_start_then_update_round_trips(world):
    record_id = world.exports.start(world.card.id, "abc", "Hello")
    world.clock["now"] = LATER
    world.exports.update(record_id, status="queued", media_id="m1", queue_id="q1", pipeline_id="p1", folder="f1", post_type="draft")
    record = world.exports.for_card(world.card.id)
    assert (record.status, record.media_id, record.queue_id, record.caption) == ("queued", "m1", "q1", "Hello")
    assert (record.created_at, record.updated_at) == (NOW, LATER)


def test_by_sha_ignores_unclear_and_failed(world):
    first = world.exports.start(world.card.id, "abc", "")
    world.exports.update(first, status="unclear")
    second = world.exports.start(world.card.id, "abc", "")
    world.exports.update(second, status="failed")
    assert world.exports.by_sha("abc") is None
    third = world.exports.start(world.card.id, "abc", "")
    world.exports.update(third, status="uploaded")
    assert world.exports.by_sha("abc").id == third


def test_for_card_returns_newest(world):
    world.exports.start(world.card.id, "one", "")
    newest = world.exports.start(world.card.id, "two", "")
    assert world.exports.for_card(world.card.id).id == newest
    assert world.exports.for_card(9999) is None


def test_delete_removes_a_record(world):
    record_id = world.exports.start(world.card.id, "abc", "")
    world.exports.delete(record_id)
    assert world.exports.for_card(world.card.id) is None


def test_list_all_has_batch_name_and_card_number(world):
    world.exports.start(world.card.id, "abc", "Hello")
    [record] = world.exports.list_all()
    assert (record.batch_name, record.card_number) == ("Saturday class", world.card.number)


def test_deleting_a_card_removes_its_records(world):
    world.exports.start(world.card.id, "abc", "")
    world.passes.delete(world.card.id)
    assert world.exports.list_all() == []


def test_exports_endpoint_lists_records(world):
    record_id = world.exports.start(world.card.id, "abc", "Hello")
    world.exports.update(record_id, status="queued", queue_id="q1")
    body = world.client.get("/api/production/exports").json()
    assert len(body) == 1
    assert body[0]["status"] == "queued" and body[0]["queueId"] == "q1" and body[0]["batchName"] == "Saturday class"
