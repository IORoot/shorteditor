import threading

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from collector_server.production.api import build_router
from collector_server.production.builtin import build_registry
from collector_server.production.errors import InvalidInputError
from collector_server.production.models import BulkCreate
from collector_server.production.repositories import BatchRepository, LogRepository, PassRepository
from collector_server.production.schema import ensure_schema
from collector_server.production.service import ProductionService
from collector_server.production.stage_api import StageStep
from collector_server.production.catalog import StageLibrary
from tests.production.helpers import FakePipelines

NOW = "2026-11-17T10:00:00+00:00"
STEPS = [StageStep(key=k) for k in ["scan_folder", "order_clips", "limit_length", "join_pieces", "render_output"]]
DATE = r"^\d{4}-\d{2}-\d{2}_.+$"


@pytest.fixture
def world(db, tmp_path):
    ensure_schema(db)
    batches, passes = BatchRepository(db), PassRepository(db)
    service = ProductionService(batches, passes, LogRepository(db), StageLibrary(build_registry()), FakePipelines(), lambda: NOW, str(tmp_path / "out"), ["local", "studio"])
    parent = tmp_path / "collected"
    parent.mkdir()

    class World:
        pass

    w = World()
    w.service, w.batches, w.passes, w.parent, w.tmp = service, batches, passes, parent, tmp_path

    def folder(name, clips=2):
        (parent / name).mkdir(parents=True, exist_ok=True)
        for n in range(clips):
            (parent / name / f"c{n}.mp4").write_bytes(b"x")
        return str(parent / name)

    w.folder = folder
    w.request = lambda **kw: BulkCreate(**{"parent_folder": str(parent), "pattern": DATE, "pipeline_id": 1, **kw})
    return w


@pytest.mark.full
@pytest.mark.full
def test_preview_marks_will_create_already_batched_and_no_videos(world):
    world.folder("2026-11-07_a")
    taken = world.folder("2026-11-08_b")
    world.folder("2026-11-09_c", clips=0)
    world.service.create_batch("Earlier", taken, 1, "any", None)
    preview = world.service.preview_folders(str(world.parent), DATE)
    assert [(i.name, i.status, i.clip_count) for i in preview.matches] == [
        ("2026-11-07_a", "will_create", 2), ("2026-11-08_b", "already_batched", 2), ("2026-11-09_c", "no_videos", 0)]


@pytest.mark.full
@pytest.mark.full
def test_preview_counts_non_matching(world):
    world.folder("2026-11-07_a")
    world.folder("notes")
    assert world.service.preview_folders(str(world.parent), DATE).not_matching == 1


@pytest.mark.full
@pytest.mark.full
def test_preview_refuses_a_bad_pattern_and_a_missing_parent(world):
    with pytest.raises(InvalidInputError, match="far too long"):
        world.service.preview_folders(str(world.parent), "(a+)+")
    with pytest.raises(InvalidInputError, match="does not exist"):
        world.service.preview_folders(str(world.tmp / "nope"), DATE)


def test_bulk_creates_one_batch_per_new_folder_in_name_order(world):
    for name in ("2026-11-09_c", "2026-11-07_a", "2026-11-08_b"):
        world.folder(name)
    result = world.service.create_batches(world.request())
    assert [b.name for b in result.created] == ["2026-11-07_a", "2026-11-08_b", "2026-11-09_c"]
    assert [b.id for b in result.created] == sorted(b.id for b in result.created)
    for batch in result.created:
        assert [p.status for p in world.passes.for_batch(batch.id)] == ["queued"]


@pytest.mark.full
@pytest.mark.full
def test_bulk_names_come_from_the_template(world):
    world.folder("2026-11-07_coach")
    result = world.service.create_batches(world.request(pattern=r"^(\d{4})-(\d{2})-\d{2}_(?P<who>.+)$", name_template="{who} {2}/{1}"))
    assert result.created[0].name == "coach 11/2026"


@pytest.mark.full
@pytest.mark.full
def test_bulk_rejects_an_unknown_placeholder(world):
    world.folder("2026-11-07_a")
    with pytest.raises(InvalidInputError, match="does not have"):
        world.service.create_batches(world.request(name_template="{nope}"))


@pytest.mark.full
def test_bulk_skips_already_batched_and_lists_them(world):
    world.folder("2026-11-07_a")
    taken = world.folder("2026-11-08_b")
    world.service.create_batch("Earlier", taken, 1, "any", None)
    result = world.service.create_batches(world.request())
    assert [b.name for b in result.created] == ["2026-11-07_a"]
    assert [(s.name, s.status) for s in result.skipped] == [("2026-11-08_b", "already_batched")]


@pytest.mark.full
@pytest.mark.full
def test_include_creates_an_already_batched_folder_again(world):
    taken = world.folder("2026-11-08_b")
    world.service.create_batch("Earlier", taken, 1, "any", None)
    result = world.service.create_batches(world.request(include=["2026-11-08_b"]))
    assert [b.name for b in result.created] == ["2026-11-08_b"]
    assert len(world.batches.list()) == 2


@pytest.mark.full
@pytest.mark.full
def test_bulk_never_creates_for_a_folder_without_videos(world):
    world.folder("2026-11-07_a")
    world.folder("2026-11-08_empty", clips=0)
    result = world.service.create_batches(world.request(include=["2026-11-08_empty"]))
    assert [b.name for b in result.created] == ["2026-11-07_a"]
    assert [s.status for s in result.skipped] == ["no_videos"]


@pytest.mark.full
@pytest.mark.full
def test_bulk_refuses_when_run_on_or_output_folder_is_bad(world):
    world.folder("2026-11-07_a")
    with pytest.raises(InvalidInputError, match="no worker"):
        world.service.create_batches(world.request(run_on="ghost"))
    with pytest.raises(InvalidInputError):
        world.service.create_batches(world.request(output_root=str(world.parent)))
    assert world.batches.list() == []


@pytest.mark.full
@pytest.mark.full
def test_bulk_refuses_more_than_200(world):
    for n in range(201):
        world.folder(f"2026-11-07_{n:03d}", clips=1)
    with pytest.raises(InvalidInputError, match="200"):
        world.service.create_batches(world.request())
    assert world.batches.list() == []


@pytest.mark.full
@pytest.mark.full
def test_bulk_with_nothing_to_create_is_a_plain_error(world):
    world.folder("2026-11-07_a", clips=0)
    with pytest.raises(InvalidInputError, match="Nothing to create"):
        world.service.create_batches(world.request())


@pytest.mark.full
@pytest.mark.full
def test_two_bulk_requests_at_once_create_each_folder_once(world):
    for n in range(6):
        world.folder(f"2026-11-0{n}_x")
    outcomes = []

    def go():
        try:
            outcomes.append(len(world.service.create_batches(world.request()).created))
        except InvalidInputError:
            outcomes.append(0)

    threads = [threading.Thread(target=go) for _ in range(4)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert sum(outcomes) == 6 and len(world.batches.list()) == 6


@pytest.fixture
def client(world):
    app = FastAPI()
    app.include_router(build_router(world.service))
    return TestClient(app)


@pytest.mark.full
@pytest.mark.full
def test_preview_route(world, client):
    world.folder("2026-11-07_a")
    body = client.post("/api/production/folders/preview", json={"parentFolder": str(world.parent), "pattern": DATE}).json()
    assert body == {"matches": [{"name": "2026-11-07_a", "path": str(world.parent / "2026-11-07_a"), "clipCount": 2, "status": "will_create"}], "notMatching": 0, "truncated": False}


@pytest.mark.full
@pytest.mark.full
def test_bulk_route_201_422_and_shape(world, client):
    world.folder("2026-11-07_a")
    ok = client.post("/api/production/batches/bulk", json={"parentFolder": str(world.parent), "pattern": DATE, "pipelineId": 1})
    assert ok.status_code == 201
    assert [b["name"] for b in ok.json()["created"]] == ["2026-11-07_a"] and ok.json()["skipped"] == []
    again = client.post("/api/production/batches/bulk", json={"parentFolder": str(world.parent), "pattern": DATE, "pipelineId": 1})
    assert again.status_code == 422 and "Nothing to create" in again.json()["detail"]
    bad = client.post("/api/production/folders/preview", json={"parentFolder": str(world.parent), "pattern": "(a+)+"})
    assert bad.status_code == 422 and "far too long" in bad.json()["detail"]


@pytest.mark.full
@pytest.mark.full
def test_a_relative_parent_folder_is_refused_everywhere(world):
    with pytest.raises(InvalidInputError, match="absolute"):
        world.service.preview_folders(".", DATE)
    with pytest.raises(InvalidInputError, match="absolute"):
        world.service.create_batches(world.request(parent_folder="."))


@pytest.mark.full
@pytest.mark.full
def test_preview_warns_about_an_output_folder_that_overlaps_the_parent(world):
    world.folder("2026-11-07_a")
    for root in (str(world.parent), str(world.parent / "results"), str(world.parent / ".." / "collected" / "later")):
        with pytest.raises(InvalidInputError, match="must not overlap"):
            world.service.preview_folders(str(world.parent), DATE, root)
    link = world.tmp / "into_parent"
    link.symlink_to(world.parent)
    with pytest.raises(InvalidInputError, match="must not overlap"):
        world.service.preview_folders(str(world.parent), DATE, str(link / "results"))
    world.service.preview_folders(str(world.parent), DATE, str(world.tmp / "elsewhere"))


@pytest.mark.full
@pytest.mark.full
def test_preview_route_takes_an_optional_output_folder(world, client):
    world.folder("2026-11-07_a")
    bad = client.post("/api/production/folders/preview", json={"parentFolder": str(world.parent), "pattern": DATE, "outputRoot": str(world.parent / "x")})
    assert bad.status_code == 422 and "must not overlap" in bad.json()["detail"]


@pytest.mark.full
@pytest.mark.full
def test_two_links_to_one_folder_create_one_batch(world):
    world.folder("2026-11-07_a")
    (world.parent / "2026-11-08_alias").symlink_to(world.parent / "2026-11-07_a")
    result = world.service.create_batches(world.request())
    assert [b.name for b in result.created] == ["2026-11-07_a"]


@pytest.mark.full
@pytest.mark.full
def test_include_ignores_unknown_and_repeated_names(world):
    taken = world.folder("2026-11-08_b")
    world.service.create_batch("Earlier", taken, 1, "any", None)
    world.folder("2026-11-07_a")
    result = world.service.create_batches(world.request(include=["nope", "nope", "2026-11-08_b", "2026-11-08_b"]))
    assert sorted(b.name for b in result.created) == ["2026-11-07_a", "2026-11-08_b"]


@pytest.mark.full
@pytest.mark.full
def test_an_unreadable_folder_is_shown_as_such_and_never_created(world):
    inside = world.folder("2026-11-07_a")
    (world.parent / "2026-11-07_a" / "sub").mkdir()
    (world.parent / "2026-11-07_a" / "sub" / "x.mp4").write_bytes(b"x")
    (world.parent / "2026-11-07_a" / "sub").chmod(0)
    try:
        preview = world.service.preview_folders(str(world.parent), DATE)
        assert preview.matches[0].status == "unreadable"
        with pytest.raises(InvalidInputError, match="Nothing to create"):
            world.service.create_batches(world.request())
    finally:
        (world.parent / "2026-11-07_a" / "sub").chmod(0o755)
    assert inside


@pytest.mark.full
@pytest.mark.full
def test_preview_says_when_the_folder_list_was_cut(world, monkeypatch):
    import collector_server.production.folder_scan as folder_scan

    monkeypatch.setattr(folder_scan, "MAX_FOLDERS", 2)
    for n in range(4):
        world.folder(f"2026-11-0{n}_x")
    assert world.service.preview_folders(str(world.parent), DATE).truncated is True


@pytest.mark.full
@pytest.mark.full
def test_the_lock_is_not_held_while_a_big_folder_is_scanned(world, monkeypatch):
    import collector_server.production.service as service_module

    world.folder("2026-11-07_a")
    real = service_module.scan_parent
    seen = {}

    def spy(parent, pattern):
        def probe():
            seen["free"] = world.service._lock.acquire(timeout=1)
            if seen["free"]:
                world.service._lock.release()

        thread = threading.Thread(target=probe)
        thread.start()
        thread.join()
        return real(parent, pattern)

    monkeypatch.setattr(service_module, "scan_parent", spy)
    world.service.create_batches(world.request())
    assert seen["free"] is True


@pytest.mark.full
@pytest.mark.full
def test_a_failure_halfway_says_how_many_were_made_and_leaves_no_dead_card(world, monkeypatch):
    for n in range(4):
        world.folder(f"2026-11-0{n}_x")
    real = world.passes.create
    calls = {"n": 0}

    def flaky(batch_id, now, overrides=None):
        calls["n"] += 1
        if calls["n"] == 3:
            raise RuntimeError("disk is full")
        return real(batch_id, now, overrides)

    monkeypatch.setattr(world.passes, "create", flaky)
    with pytest.raises(InvalidInputError, match="Created 2 of 4.*disk is full"):
        world.service.create_batches(world.request())
    batches = world.batches.list()
    assert len(batches) == 2 and all(world.passes.for_batch(b.id) for b in batches)
