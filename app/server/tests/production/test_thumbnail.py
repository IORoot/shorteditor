import subprocess

import pytest

from collector_server.production.ffmpeg import _binary
from collector_server.production.thumbnail import first_clip, make_thumbnail


def test_the_first_video_is_picked_in_scan_order_and_hidden_or_other_files_are_skipped(tmp_path):
    (tmp_path / "sub").mkdir()
    for name in ["IMG_0185.MOV", "notes.txt", ".IMG_0001.MOV", "IMG_0182.mov"]:
        (tmp_path / name).write_bytes(b"x")
    (tmp_path / "sub" / "IMG_0100.mp4").write_bytes(b"x")
    assert first_clip(str(tmp_path)) == str(tmp_path / "IMG_0182.mov")  # sorted by full path, "I" before "s"
    (tmp_path / "IMG_0182.mov").unlink()
    (tmp_path / "IMG_0185.MOV").unlink()
    assert first_clip(str(tmp_path)) == str(tmp_path / "sub" / "IMG_0100.mp4")  # subfolders count too


def test_an_empty_folder_has_no_first_clip(tmp_path):
    assert first_clip(str(tmp_path)) is None


@pytest.mark.full
def test_a_frame_is_written_from_a_real_clip(tmp_path):
    clip = tmp_path / "clip.mp4"
    subprocess.run([_binary("ffmpeg"), "-v", "error", "-f", "lavfi", "-i", "testsrc=duration=3:size=320x240:rate=10", str(clip)], check=True)
    target = tmp_path / ".thumbnails" / "batch-1.jpg"
    assert make_thumbnail(str(clip), str(target)) is True
    assert target.read_bytes()[:3] == b"\xff\xd8\xff"  # a JPEG file


@pytest.mark.full
def test_a_broken_clip_gives_no_thumbnail(tmp_path):
    clip = tmp_path / "broken.mp4"
    clip.write_bytes(b"not a video")
    assert make_thumbnail(str(clip), str(tmp_path / "out.jpg")) is False


NOW = "2026-11-17T10:00:00+00:00"


def _thumbnail_api(db, tmp_path):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from collector_server.production.api import build_router
    from collector_server.production.builtin import build_registry
    from collector_server.production.catalog import StageLibrary
    from collector_server.production.repositories import BatchRepository, LogRepository, PassRepository
    from collector_server.production.schema import ensure_schema
    from collector_server.production.service import ProductionService
    from tests.production.helpers import FakePipelines

    ensure_schema(db)
    service = ProductionService(BatchRepository(db), PassRepository(db), LogRepository(db), StageLibrary(build_registry()), FakePipelines(), lambda: NOW, str(tmp_path / "out"), ["local"])
    app = FastAPI()
    app.include_router(build_router(service))
    return TestClient(app), service


@pytest.mark.full
def test_a_batch_thumbnail_is_served_from_its_first_clip_and_404s_without_one(db, tmp_path):
    client, service = _thumbnail_api(db, tmp_path)
    folder = tmp_path / "in"
    folder.mkdir()
    batch = service._batches.create("Coach", str(folder), None, [], "local", str(tmp_path / "out"), NOW)
    assert client.get(f"/api/production/batches/{batch.id}/thumbnail").status_code == 404  # no clips yet
    subprocess.run([_binary("ffmpeg"), "-v", "error", "-f", "lavfi", "-i", "testsrc=duration=3:size=320x240:rate=10", str(folder / "IMG_0182.mp4")], check=True)
    response = client.get(f"/api/production/batches/{batch.id}/thumbnail")
    assert response.status_code == 200 and response.headers["content-type"] == "image/jpeg"
    assert (tmp_path / "out" / ".thumbnails" / f"batch-{batch.id}.jpg").is_file()
