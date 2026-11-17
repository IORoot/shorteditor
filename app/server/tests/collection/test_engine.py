import os
from datetime import datetime

import pytest

from collector_server.collection.executor import TransferExecutor
from collector_server.collection.file_transfer import FileTransfer, TransferError
from collector_server.collection.local_mover import LocalMover, plural
from collector_server.collection.move_repository import MoveRepository
from collector_server.collection.planner import TransferPlanner
from collector_server.collection.transfer_plan import PlannedFile, PlannedGroup, TransferPlan
from collector_server.collection.undo import UndoService
from tests.conftest import LONDON
from tests.helpers import config_for, make_clip

SAT = datetime(2026, 11, 14, 18, 40, tzinfo=LONDON)


@pytest.fixture
def engine(db, collectors, runs, clock, tmp_path):
    source, output = tmp_path / "in", tmp_path / "out"
    source.mkdir()
    output.mkdir()
    files, moves = FileTransfer(), MoveRepository(db)
    planner = TransferPlanner(clock)
    return {
        "source": source,
        "output": output,
        "moves": moves,
        "mover": LocalMover(planner, TransferExecutor(files, moves)),
        "undo": UndoService(moves, runs, files),
        "executor": TransferExecutor(files, moves),
        "collectors": collectors,
        "runs": runs,
        "clock": clock,
    }


def new_run(engine, **overrides):
    record = engine["collectors"].add_with_config(config_for(engine["source"], engine["output"], **overrides))
    run = engine["runs"].add(record.id, engine["clock"].now(), "manual", "running", "Starting…")
    return record, run


@pytest.mark.full
@pytest.mark.full
def test_plural_helper():
    assert plural(1, "clip") == "1 clip" and plural(2, "clip") == "2 clips"


def test_move_run_moves_files_and_logs_every_move(engine):
    make_clip(engine["source"] / "a.mp4", SAT)
    make_clip(engine["source"] / "b.mp4", SAT)
    record, run = new_run(engine)
    updates: list[str] = []
    outcome = engine["mover"].move(record, run.id, updates.append)
    assert outcome == "Moved 2 clips into 1 folder"
    assert updates == ["Moving 1 of 2…", "Moving 2 of 2…"]
    assert sorted(os.listdir(engine["output"] / "2026-11-14_Sat_coach")) == ["a.mp4", "b.mp4"]
    assert os.listdir(engine["source"]) == []
    assert engine["moves"].count(run.id) == 2


@pytest.mark.full
@pytest.mark.full
def test_copy_and_link_runs_use_their_own_verbs(engine):
    make_clip(engine["source"] / "a.mp4", SAT)
    record, run = new_run(engine, transfer="copy")
    assert engine["mover"].move(record, run.id, lambda _t: None) == "Copied 1 clip into 1 folder"
    assert (engine["source"] / "a.mp4").exists()
    record, run = new_run(engine, transfer="link", folder_template="links")
    assert engine["mover"].move(record, run.id, lambda _t: None) == "Linked 1 clip into 1 folder"
    assert os.path.islink(engine["output"] / "links" / "a.mp4")


@pytest.mark.full
@pytest.mark.full
def test_nothing_to_do_is_reported_not_failed(engine):
    record, run = new_run(engine)
    assert engine["mover"].move(record, run.id, lambda _t: None) == "No new clips found"
    assert engine["moves"].count(run.id) == 0


def test_a_failure_stops_the_run_and_keeps_the_moves_done_so_far(engine):
    first = make_clip(engine["source"] / "a.mp4", SAT)
    second = make_clip(engine["source"] / "b.mp4", SAT)
    make_clip(engine["output"] / "blocked" / "b.mp4", SAT)
    _, run = new_run(engine)
    plan = TransferPlan(
        groups=[
            PlannedGroup(
                folder="ok",
                path=str(engine["output"] / "ok"),
                renamed=False,
                files=[
                    PlannedFile(str(first), str(engine["output"] / "ok" / "a.mp4"), 4),
                    PlannedFile(str(second), str(engine["output"] / "blocked" / "b.mp4"), 4),
                ],
            )
        ]
    )
    with pytest.raises(TransferError, match="Stopped after 1 of 2"):
        engine["executor"].execute(plan, "move", run.id, lambda _t: None)
    assert engine["moves"].count(run.id) == 1
    assert second.exists()


@pytest.mark.full
@pytest.mark.full
def test_undo_restores_files_and_removes_the_empty_folder(engine):
    make_clip(engine["source"] / "a.mp4", SAT)
    record, run = new_run(engine)
    engine["runs"].update(run.id, status="done", outcome=engine["mover"].move(record, run.id, lambda _t: None), can_undo=True)
    result = engine["undo"].undo(run.id)
    assert (engine["source"] / "a.mp4").exists()
    assert not (engine["output"] / "2026-11-14_Sat_coach").exists()
    assert result.can_undo is False
    assert result.outcome.endswith("Undone: restored 1")


@pytest.mark.full
@pytest.mark.full
def test_undo_skips_files_that_cannot_be_restored(engine):
    make_clip(engine["source"] / "a.mp4", SAT)
    record, run = new_run(engine)
    engine["mover"].move(record, run.id, lambda _t: None)
    engine["runs"].update(run.id, status="done", can_undo=True)
    make_clip(engine["source"] / "a.mp4", SAT, b"new clip with the same name")
    result = engine["undo"].undo(run.id)
    assert "1 could not be restored" in result.outcome
    assert (engine["source"] / "a.mp4").read_bytes() == b"new clip with the same name"
    assert (engine["output"] / "2026-11-14_Sat_coach" / "a.mp4").exists()


def test_undoing_a_copy_removes_the_copies_only(engine):
    make_clip(engine["source"] / "a.mp4", SAT)
    record, run = new_run(engine, transfer="copy")
    engine["mover"].move(record, run.id, lambda _t: None)
    engine["runs"].update(run.id, status="done", can_undo=True)
    engine["undo"].undo(run.id)
    assert (engine["source"] / "a.mp4").exists()
    assert not (engine["output"] / "2026-11-14_Sat_coach").exists()


@pytest.mark.full
@pytest.mark.full
def test_undo_errors(engine):
    with pytest.raises(LookupError):
        engine["undo"].undo(999)
    _, run = new_run(engine)
    with pytest.raises(ValueError, match="can't be undone"):
        engine["undo"].undo(run.id)


@pytest.mark.full
@pytest.mark.full
def test_undo_removes_every_folder_the_run_created_even_nested_ones(engine):
    make_clip(engine["source"] / "a.mp4", SAT)
    record, run = new_run(engine, folder_template="2026/{date:YYYY-MM-DD}_{suffix}", group_by="day")
    engine["mover"].move(record, run.id, lambda _t: None)
    assert (engine["output"] / "2026" / "2026-11-14_coach").is_dir()
    (engine["output"] / "2026" / "2026-11-14_coach" / ".DS_Store").write_bytes(b"finder")
    engine["runs"].update(run.id, status="done", can_undo=True)
    engine["undo"].undo(run.id)
    assert (engine["source"] / "a.mp4").exists()
    assert not (engine["output"] / "2026").exists()


@pytest.mark.full
@pytest.mark.full
def test_undo_keeps_a_folder_the_run_did_not_empty(engine):
    make_clip(engine["source"] / "a.mp4", SAT)
    record, run = new_run(engine)
    engine["mover"].move(record, run.id, lambda _t: None)
    (engine["output"] / "2026-11-14_Sat_coach" / "mine.txt").write_text("keep")
    engine["runs"].update(run.id, status="done", can_undo=True)
    engine["undo"].undo(run.id)
    assert (engine["output"] / "2026-11-14_Sat_coach" / "mine.txt").exists()
