import os

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from collector_server.production.wiring import build_production
from tests.production.helpers import make_clip, requires_ffmpeg

pytestmark = requires_ffmpeg

SMALL = {"join_pieces": {"width": 160, "height": 284}, "render_output": {"maxSizeMb": 5}}


def steps(limit=60):
    keys = ["scan_folder", "order_clips", "limit_length", "join_pieces", "render_output"]
    return [{"key": k, "settings": {"maxSeconds": limit} if k == "limit_length" else SMALL.get(k, {})} for k in keys]


@pytest.fixture
def system(db, tmp_path):
    production = build_production(db, str(tmp_path / "out"))
    app = FastAPI()
    app.include_router(production.router)
    inbox = tmp_path / "in"
    inbox.mkdir()

    class System:
        client = TestClient(app)
        queue = production.queue
        folder = inbox

        def go(self):
            self.queue.tick()
            self.queue.wait_idle(60)

        def board(self):
            return self.client.get("/api/production/batches").json()

    return System()


def add_clips(system, seconds=2):
    make_clip(system.folder / "a.mp4", seconds=seconds)
    make_clip(system.folder / "b.mp4", seconds=seconds)
    make_clip(system.folder / "c.mp4", seconds=seconds, audio=False)


def test_a_join_batch_runs_to_review_is_approved_and_can_run_again(system):
    add_clips(system)
    created = system.client.post("/api/production/batches", json={"name": "Coach Saturdays", "inputFolder": str(system.folder), "steps": steps()})
    assert created.status_code == 201
    batch_id = created.json()["id"]
    assert system.board()[0]["status"] == "queued"

    system.go()
    [card] = system.board()
    assert card["status"] == "review", card
    assert os.path.getsize(card["output"]["path"]) <= 5_000_000
    assert abs(card["output"]["duration"] - 6.0) < 0.5
    log = system.client.get("/api/production/passes/1/logs?kind=pipeline").json()["lines"]
    assert sum(line.endswith(" done") for line in log) == 5

    handoff = system.client.post("/api/production/passes/1/approve").json()
    assert handoff["stage"] == "production" and handoff["folders"][0]["clips"][0]["name"] == "output.mp4"
    assert system.board()[0]["status"] == "approved"

    again = system.client.post(f"/api/production/batches/{batch_id}/passes", json={})
    assert again.status_code == 201 and again.json()["number"] == 2 and again.json()["status"] == "queued"
    system.go()
    assert system.board()[0]["passNumber"] == 2 and system.board()[0]["status"] == "review"


def test_an_over_length_batch_blocks_and_resolves(system):
    add_clips(system, seconds=2)
    system.client.post("/api/production/batches", json={"name": "Long", "inputFolder": str(system.folder), "steps": steps(limit=3)})
    system.go()
    [card] = system.board()
    assert card["status"] == "blocked" and card["blockedChoices"] == ["drop_shortest", "keep_first"]

    assert system.client.post("/api/production/passes/1/resolve", json={"choice": "keep_first"}).status_code == 200
    system.go()
    [card] = system.board()
    assert card["status"] == "review" and abs(card["output"]["duration"] - 3.0) < 0.4


def test_several_batches_run_one_after_another(system):
    add_clips(system)
    for name in ("One", "Two"):
        system.client.post("/api/production/batches", json={"name": name, "inputFolder": str(system.folder), "steps": steps()})
    first = system.queue.tick()
    assert len(first) == 1  # the local worker takes one job at a time
    system.queue.wait_idle(60)
    system.go()
    assert sorted(c["status"] for c in system.board()) == ["review", "review"]


def test_an_empty_folder_fails_with_a_readable_message(system):
    system.client.post("/api/production/batches", json={"name": "Empty", "inputFolder": str(system.folder), "steps": steps()})
    system.go()
    [card] = system.board()
    assert card["status"] == "failed" and card["error"].startswith("No clips found")
