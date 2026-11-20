import os
import subprocess

import pytest

from collector_server.production.builtin import build_registry
from collector_server.production.catalog import StageLibrary
from collector_server.production.ffmpeg import _binary
from collector_server.production.models import StageRun
from collector_server.production.repositories import BatchRepository, LogRepository, PassRepository
from collector_server.production.schema import ensure_schema
from collector_server.production.service import InvalidInputError, NotFoundError, ProductionService
from collector_server.production import stills
from tests.production.helpers import FakePipelines

NOW = "2026-11-17T10:00:00+00:00"


def test_a_still_has_its_own_file_per_clip_and_time(tmp_path):
    first = stills.still_path(str(tmp_path), 7, "a.mp4", 2.5)
    assert first == stills.still_path(str(tmp_path), 7, "a.mp4", 2.5)
    assert first != stills.still_path(str(tmp_path), 7, "a.mp4", 3.0)
    assert first != stills.still_path(str(tmp_path), 7, "b.mp4", 2.5)
    assert os.path.dirname(first) == os.path.join(str(tmp_path), ".thumbnails")


def test_a_clip_is_found_by_its_name_in_any_subfolder(tmp_path):
    (tmp_path / "day").mkdir()
    (tmp_path / "day" / "IMG_0100.mp4").write_bytes(b"x")
    assert stills.find_clip(str(tmp_path), "IMG_0100.mp4") == str(tmp_path / "day" / "IMG_0100.mp4")
    assert stills.find_clip(str(tmp_path), "missing.mp4") is None


@pytest.mark.full
def test_a_frame_is_written_as_a_jpeg(tmp_path):
    clip = tmp_path / "clip.mp4"
    subprocess.run([_binary("ffmpeg"), "-v", "error", "-f", "lavfi", "-i", "testsrc=duration=3:size=320x240:rate=10", str(clip)], check=True)
    target = tmp_path / ".thumbnails" / "still.jpg"
    assert stills.make_still(str(clip), 1.0, str(target)) is True
    assert target.read_bytes()[:3] == b"\xff\xd8\xff"


@pytest.fixture
def card(db, tmp_path):
    ensure_schema(db)
    inbox = tmp_path / "in"
    inbox.mkdir()
    (inbox / "a.mp4").write_bytes(b"x")
    batches, passes, logs = BatchRepository(db), PassRepository(db), LogRepository(db)
    service = ProductionService(batches, passes, logs, StageLibrary(build_registry()), FakePipelines(), lambda: NOW, str(tmp_path / "out"), ["local"])
    batch = service.create_batch(name="Coach", input_folder=str(inbox), pipeline_id=1, run_on="any", output_root=None)
    [pass_] = passes.for_batch(batch.id)
    scan = StageRun(key="scan_folder", title="Scan folder", status="done", started_at=NOW, finished_at=NOW,
                    details={"kind": "clips", "total": 4.0, "clips": [{"name": "a.mp4", "start": 0, "end": 4.0, "length": 4.0}]})
    passes.update(pass_.id, stages=[scan.model_dump()])
    return service, pass_.id


def test_a_still_is_made_once_and_then_reused(card, monkeypatch):
    service, pass_id = card
    made = []

    def fake_make(clip_path, at, target):
        made.append(target)
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with open(target, "wb") as file:
            file.write(b"\xff\xd8\xff")
        return True

    monkeypatch.setattr(stills, "make_still", fake_make)
    first = service.still_path(pass_id, "a.mp4", 1.0)
    second = service.still_path(pass_id, "a.mp4", 1.0)
    assert first == second and os.path.isfile(first)
    assert len(made) == 1


def test_a_clip_not_in_the_card_is_not_found(card):
    service, pass_id = card
    with pytest.raises(NotFoundError):
        service.still_path(pass_id, "other.mp4", 1.0)


def test_a_time_at_or_past_the_end_of_the_clip_is_refused(card):
    service, pass_id = card
    with pytest.raises(InvalidInputError):
        service.still_path(pass_id, "a.mp4", 4.0)


def test_the_route_serves_a_jpeg_and_refuses_an_unknown_clip(card, monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from collector_server.production.api import build_router

    service, pass_id = card

    def fake_make(clip_path, at, target):
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with open(target, "wb") as file:
            file.write(b"\xff\xd8\xff")
        return True

    monkeypatch.setattr(stills, "make_still", fake_make)
    app = FastAPI()
    app.include_router(build_router(service))
    client = TestClient(app)
    ok = client.get(f"/api/production/passes/{pass_id}/still", params={"clip": "a.mp4", "at": 1.0})
    assert ok.status_code == 200 and ok.headers["content-type"] == "image/jpeg"
    assert client.get(f"/api/production/passes/{pass_id}/still", params={"clip": "../x.mp4", "at": 1.0}).status_code == 404
