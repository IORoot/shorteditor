import os

import pytest

from collector_server.production.batch_watch import BatchWatcher
from collector_server.production.builtin import build_registry
from collector_server.production.catalog import StageLibrary
from collector_server.production.repositories import BatchRepository, LogRepository, PassRepository
from collector_server.production.schema import ensure_schema
from collector_server.production.service import ProductionService
from collector_server.production.stage_api import StageStep
from collector_server.production.watch_conversion import convert_watches
from collector_server.production.watch_repository import WatchRepository
from collector_server.shared.pipeline import PipelineRef
from tests.production.helpers import FakePipelines

DATE = r"^\d{4}-\d{2}-\d{2}_.+$"
STEPS = [StageStep(key=k) for k in ["scan_folder", "order_clips", "limit_length", "join_pieces", "render_output"]]
START = 1_800_000_000.0


@pytest.fixture
def world(db, tmp_path):
    ensure_schema(db)
    batches, passes = BatchRepository(db), PassRepository(db)
    service = ProductionService(batches, passes, LogRepository(db), StageLibrary(build_registry()), FakePipelines({1: PipelineRef(id=1, name="Join", enabled=True, steps=STEPS)}),
                                lambda: "t", str(tmp_path / "out"), ["local", "studio"], clock=lambda: START)
    watches = WatchRepository(db)

    class World:
        pass

    w = World()
    w.db, w.batches, w.passes, w.service, w.watches, w.tmp = db, batches, passes, service, watches, tmp_path
    w.parent = tmp_path / "collected"
    w.parent.mkdir()

    def folder(name, clips=2):
        base = w.parent / name
        base.mkdir(parents=True, exist_ok=True)
        for n in range(clips):
            (base / f"c{n}.mp4").write_bytes(b"x")
        for path in [base, *base.iterdir()]:
            os.utime(path, (START - 3600, START - 3600))
        return str(base)

    def old_watch(name="Coach", parent=None, enabled=True, output_root=None, pipeline_id=1, run_on="any", interval=7, settle=3, per_check=4, seen=()):
        cursor = db.execute(
            "INSERT INTO production_watches (name, parent_folder, pattern, name_template, steps, run_on, output_root, interval_minutes, settle_minutes, max_per_check, pipeline_id, enabled, created_at) "
            "VALUES (?, ?, ?, '{name}', '[]', ?, ?, ?, ?, ?, ?, ?, 't')",
            (name, str(parent or w.parent), DATE, run_on, output_root, interval, settle, per_check, pipeline_id, int(enabled)),
        )
        watches.mark_seen(cursor.lastrowid, list(seen), "t")
        return cursor.lastrowid

    w.folder, w.old_watch = folder, old_watch
    w.convert = lambda: convert_watches(watches, service, batches)
    w.cards = lambda batch: sorted(c.folder for c in passes.for_batch(batch.id))
    return w


def test_a_watch_becomes_a_watching_batch_with_its_settings_and_no_cards_and_the_watch_is_gone(world):
    world.old_watch(run_on="studio", output_root=str(world.tmp / "reels"))
    assert world.convert() == 1
    [batch] = world.batches.list()
    assert (batch.name, batch.input_folder, batch.folder_pattern, batch.pipeline_id, batch.run_on, batch.output_root) == ("Coach", str(world.parent), DATE, 1, "studio", str(world.tmp / "reels"))
    assert (batch.watching, batch.auto_run, batch.watch_interval_minutes, batch.watch_settle_minutes, batch.watch_max_per_check) == (True, True, 7, 3, 4)
    assert world.cards(batch) == []
    assert world.watches.list() == []


def test_a_watch_without_an_output_folder_keeps_writing_where_its_batches_did(world):
    world.old_watch()
    world.convert()
    assert world.batches.list()[0].output_root == str(world.tmp / "out")


def test_a_paused_watch_becomes_a_batch_that_is_not_watching(world):
    world.old_watch(enabled=False)
    world.convert()
    assert world.batches.list()[0].watching is False


def test_what_the_watch_had_already_dealt_with_is_not_added_but_a_new_folder_is(world):
    old = world.folder("2026-11-07_old")
    world.old_watch(seen=[old])
    world.convert()
    [batch] = world.batches.list()
    new = world.folder("2026-11-14_new")
    BatchWatcher(world.service, world.batches, world.passes, lambda: START).check(batch.id)
    assert world.cards(batch) == [new]


def test_a_watch_that_cannot_be_converted_is_left_alone_and_the_others_still_are(world):
    world.old_watch(name="Gone", parent=world.tmp / "missing")
    world.old_watch(name="Fine")
    assert world.convert() == 1
    assert [b.name for b in world.batches.list()] == ["Fine"]
    assert [w.name for w in world.watches.list()] == ["Gone"]


def test_converting_twice_makes_no_second_batch(world):
    world.old_watch()
    world.convert()
    assert world.convert() == 0
    assert len(world.batches.list()) == 1
