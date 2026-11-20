import os
import sqlite3

import pytest

from collector_server.production.builtin import build_registry
from collector_server.production.catalog import StageLibrary
from collector_server.production.repositories import BatchRepository, LogRepository, PassRepository, RunRepository
from collector_server.production.pieces import VideoData
from collector_server.production.schema import ensure_schema
from collector_server.production.service import ProductionService, StateError
from collector_server.production.stage_api import StageStep
from collector_server.shared.database import Database
from tests.production.helpers import FakePipelines

NOW = "2026-11-17T10:00:00+00:00"


@pytest.fixture
def parts(db, tmp_path):
    ensure_schema(db)
    inbox = tmp_path / "in"
    inbox.mkdir()
    batches, passes, logs = BatchRepository(db), PassRepository(db), LogRepository(db)
    service = ProductionService(batches, passes, logs, StageLibrary(build_registry()), FakePipelines(), lambda: NOW, str(tmp_path / "out"), ["local"])
    return service, passes, RunRepository(db), inbox, tmp_path


def clip(folder, name="a.mp4"):
    folder.mkdir(parents=True, exist_ok=True)
    (folder / name).write_bytes(b"x")


def create(service, inbox, **kw):
    args = {"name": "Coach Saturdays", "input_folder": str(inbox), "pipeline_id": 1, "run_on": "any", "output_root": None}
    return service.create_batch(**{**args, **kw})


def test_a_folder_with_no_sub_folders_is_one_card(parts):
    service, passes, runs, inbox, _ = parts
    clip(inbox)
    batch = create(service, inbox)
    [card] = passes.for_batch(batch.id)
    assert (card.folder, card.status) == (str(inbox), "queued")
    assert runs.latest(batch.id).number == 1


def test_each_sub_folder_with_videos_is_one_card(parts):
    service, passes, _, inbox, _ = parts
    clip(inbox / "class-1")
    clip(inbox / "class-2")
    (inbox / "empty").mkdir()
    (inbox / ".hidden").mkdir()
    clip(inbox / ".hidden")
    batch = create(service, inbox)
    assert sorted(os.path.basename(c.folder) for c in passes.for_batch(batch.id)) == ["class-1", "class-2"]


def test_re_run_replaces_the_previous_run_and_keeps_outputs_on_disk(parts):
    service, passes, runs, inbox, tmp = parts
    clip(inbox / "class-1")
    batch = create(service, inbox)
    first = passes.for_batch(batch.id)[0]
    output = tmp / "out" / "file.mp4"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(b"video")
    passes.update(first.id, status="approved", overrides={"limit_length": {"choice": "keep_first"}})
    detail = service.run_again(batch.id, None)
    assert detail.number == 2
    assert [r.number for r in runs.for_batch(batch.id)] == [2]
    [card] = passes.for_batch(batch.id)
    assert (card.status, card.overrides) == ("queued", {"limit_length": {"choice": "keep_first"}})
    assert output.exists()


def test_re_run_refuses_while_a_card_is_waiting(parts):
    service, passes, _, inbox, _ = parts
    clip(inbox / "class-1")
    clip(inbox / "class-2")
    create(service, inbox)
    with pytest.raises(StateError, match="waiting"):
        service.run_again(1, None)


def test_batch_status_follows_its_cards(parts):
    service, passes, _, inbox, _ = parts
    clip(inbox / "class-1")
    clip(inbox / "class-2")
    batch = create(service, inbox)
    a, b = passes.for_batch(batch.id)
    [item] = [i for i in service.batch_list() if i.id == batch.id]
    assert (item.status, item.folder_count) == ("queued", 2)
    passes.update(a.id, status="approved")
    passes.update(b.id, status="review")
    [item] = [i for i in service.batch_list() if i.id == batch.id]
    assert item.status == "review" and item.approved_count == 1
    passes.update(b.id, status="approved")
    [item] = [i for i in service.batch_list() if i.id == batch.id]
    assert item.status == "approved"


def test_board_shows_only_the_newest_runs_cards(parts):
    service, passes, _, inbox, _ = parts
    clip(inbox / "class-1")
    batch = create(service, inbox)
    passes.update(passes.for_batch(batch.id)[0].id, status="approved")
    service.run_again(batch.id, None)
    [card] = [c for c in service.cards() if c.batch_id == batch.id]
    assert card.status == "queued" and card.pass_number == 2


def test_old_passes_migrate_to_one_run_each_and_keep_their_logs(tmp_path):
    path = str(tmp_path / "old.db")
    raw = sqlite3.connect(path)
    raw.executescript("""
        CREATE TABLE production_batches (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, input_folder TEXT NOT NULL,
            steps TEXT NOT NULL, run_on TEXT NOT NULL DEFAULT 'any', output_root TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE production_passes (id INTEGER PRIMARY KEY AUTOINCREMENT, batch_id INTEGER NOT NULL REFERENCES production_batches(id) ON DELETE CASCADE,
            number INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'queued', stage_index INTEGER NOT NULL DEFAULT 0, stage_key TEXT NOT NULL DEFAULT '',
            blocked_reason TEXT, blocked_choices TEXT NOT NULL DEFAULT '[]', overrides TEXT NOT NULL DEFAULT '{}', error TEXT, output TEXT,
            created_at TEXT NOT NULL, started_at TEXT, finished_at TEXT, UNIQUE (batch_id, number));
        CREATE TABLE production_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, pass_id INTEGER NOT NULL REFERENCES production_passes(id) ON DELETE CASCADE,
            kind TEXT NOT NULL, at TEXT NOT NULL, text TEXT NOT NULL);
        INSERT INTO production_batches (id, name, input_folder, steps, output_root, created_at) VALUES (1, 'Old', '/in', '[]', '/out', '2026-01-01');
        INSERT INTO production_passes (id, batch_id, number, status, created_at) VALUES (1, 1, 1, 'approved', '2026-01-01'), (2, 1, 2, 'review', '2026-01-02');
        INSERT INTO production_logs (pass_id, kind, at, text) VALUES (2, 'pipeline', '2026-01-02', 'hello');
    """)
    raw.commit()
    raw.close()
    db = Database(path)
    ensure_schema(db)
    ensure_schema(db)  # a second start changes nothing
    passes, runs = PassRepository(db), RunRepository(db)
    cards = passes.for_batch(1)
    assert [(c.id, c.status, c.folder, c.run_id is not None) for c in cards] == [(1, "approved", "/in", True), (2, "review", "/in", True)]
    assert [r.number for r in runs.for_batch(1)] == [1, 2]
    assert LogRepository(db).for_pass(2, "pipeline") == ["hello"]
    assert runs.latest(1).id == cards[1].run_id


def test_a_batch_can_be_renamed_and_its_output_folder_changed_before_any_video_is_finished(parts, tmp_path):
    service, passes, _, inbox, tmp = parts
    clip(inbox / "class-1")
    batch = create(service, inbox)
    renamed = service.update_batch(batch.id, "Tuesday class", str(tmp / "other"))
    assert (renamed.name, renamed.output_root) == ("Tuesday class", str(tmp / "other"))
    passes.update(passes.for_batch(batch.id)[0].id, output=VideoData(path=str(tmp / "other" / "x.mp4"), duration=1, size_bytes=1))
    with pytest.raises(StateError, match="finished video"):
        service.update_batch(batch.id, None, str(tmp / "third"))
    assert service.update_batch(batch.id, "Still renamed", None).name == "Still renamed"
