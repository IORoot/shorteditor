import pytest

from collector_server.production.pieces import VideoData
from collector_server.production.repositories import BatchRepository, LogRepository, PassRepository
from collector_server.production.schema import ensure_schema
from collector_server.production.stage_api import StageStep

NOW = "2026-11-17T10:00:00+00:00"
STEPS = [StageStep(key="scan_folder"), StageStep(key="limit_length", settings={"maxSeconds": 45})]


@pytest.fixture
def repos(db):
    ensure_schema(db)
    return BatchRepository(db), PassRepository(db), LogRepository(db)


def make_batch(batches, name="Coach Saturdays", run_on="any"):
    return batches.create(name, "/clips/a", STEPS, run_on, "/out", NOW)


def test_schema_is_idempotent(db):
    ensure_schema(db)
    ensure_schema(db)


def test_batch_round_trips_steps_and_settings(repos):
    batches, _, _ = repos
    made = make_batch(batches, run_on="studio")
    got = batches.get(made.id)
    assert got == made
    assert got.steps[1].settings == {"maxSeconds": 45}
    assert got.run_on == "studio" and got.created_at == NOW


def test_unknown_batch_is_none_and_list_is_in_creation_order(repos):
    batches, _, _ = repos
    assert batches.get(99) is None
    first, second = make_batch(batches, "A"), make_batch(batches, "B")
    assert [b.id for b in batches.list()] == [first.id, second.id]


def test_pass_numbers_increase_per_batch(repos):
    batches, passes, _ = repos
    a, b = make_batch(batches, "A"), make_batch(batches, "B")
    assert [passes.create(a.id, NOW).number, passes.create(a.id, NOW).number, passes.create(b.id, NOW).number] == [1, 2, 1]
    assert [p.number for p in passes.for_batch(a.id)] == [1, 2]


def test_new_pass_starts_queued_and_can_carry_overrides(repos):
    batches, passes, _ = repos
    batch = make_batch(batches)
    fresh = passes.create(batch.id, NOW, overrides={"limit_length": {"choice": "keep_first"}})
    assert fresh.status == "queued" and fresh.overrides == {"limit_length": {"choice": "keep_first"}}
    assert fresh.output is None and fresh.error is None and fresh.blocked_choices == []


def test_queued_is_oldest_first_and_running_lists_running(repos):
    batches, passes, _ = repos
    batch = make_batch(batches)
    one, two, three = (passes.create(batch.id, NOW) for _ in range(3))
    passes.update(two.id, status="running")
    assert [p.id for p in passes.queued()] == [one.id, three.id]
    assert [p.id for p in passes.running()] == [two.id]


def test_update_sets_blocked_fields_and_output(repos):
    batches, passes, _ = repos
    made = passes.create(make_batch(batches).id, NOW)
    passes.update(made.id, status="blocked", stage_index=2, stage_key="limit_length", blocked_reason="Over", blocked_choices=["a", "b"])
    blocked = passes.get(made.id)
    assert (blocked.status, blocked.stage_index, blocked.blocked_choices) == ("blocked", 2, ["a", "b"])
    passes.update(made.id, status="review", blocked_reason=None, blocked_choices=[], output=VideoData(path="/o/x.mp4", duration=3.5, size_bytes=9))
    done = passes.get(made.id)
    assert done.output == VideoData(path="/o/x.mp4", duration=3.5, size_bytes=9) and done.blocked_reason is None


def test_update_rejects_unknown_fields_and_statuses(repos):
    batches, passes, _ = repos
    made = passes.create(make_batch(batches).id, NOW)
    with pytest.raises(ValueError):
        passes.update(made.id, colour="red")
    with pytest.raises(ValueError):
        passes.update(made.id, status="sleeping")


def test_logs_keep_order_and_separate_kinds(repos):
    batches, passes, logs = repos
    made = passes.create(make_batch(batches).id, NOW)
    logs.add_many(made.id, "pipeline", [(NOW, "Scan folder started")])
    logs.add_many(made.id, "ffmpeg", [(NOW, "frame=1")])
    logs.add_many(made.id, "pipeline", [(NOW, "Scan folder done")])
    assert logs.for_pass(made.id, "pipeline") == ["Scan folder started", "Scan folder done"]
    assert logs.for_pass(made.id, "ffmpeg") == ["frame=1"]
    assert logs.for_pass(999, "pipeline") == []


def test_add_many_keeps_order(repos):
    batches, passes, logs = repos
    made = passes.create(make_batch(batches).id, NOW)
    logs.add_many(made.id, "ffmpeg", [(NOW, "one"), (NOW, "two"), (NOW, "three")])
    logs.add_many(made.id, "ffmpeg", [(NOW, "four")])
    assert logs.for_pass(made.id, "ffmpeg") == ["one", "two", "three", "four"]


def test_pass_numbers_stay_distinct_across_threads(repos):
    import threading

    batches, passes, _ = repos
    batch = make_batch(batches)
    threads = [threading.Thread(target=lambda: [passes.create(batch.id, NOW) for _ in range(10)]) for _ in range(4)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert sorted(p.number for p in passes.for_batch(batch.id)) == list(range(1, 41))


def test_duplicate_pass_number_is_refused_by_the_database(db, repos):
    batches, passes, _ = repos
    batch = make_batch(batches)
    passes.create(batch.id, NOW)
    with pytest.raises(Exception):
        db.execute("INSERT INTO production_passes (batch_id, number, created_at) VALUES (?, 1, ?)", (batch.id, NOW))


def test_deleting_a_batch_removes_its_passes_and_logs(db, repos):
    batches, passes, logs = repos
    batch = make_batch(batches)
    made = passes.create(batch.id, NOW)
    logs.add_many(made.id, "pipeline", [(NOW, "x")])
    db.execute("DELETE FROM production_batches WHERE id = ?", (batch.id,))
    assert passes.get(made.id) is None and logs.for_pass(made.id, "pipeline") == []


def test_update_of_a_missing_pass_raises(repos):
    _, passes, _ = repos
    with pytest.raises(KeyError):
        passes.update(999, status="running")


def test_update_with_no_fields_changes_nothing(repos):
    batches, passes, _ = repos
    made = passes.create(make_batch(batches).id, NOW)
    assert passes.update(made.id) == made


def test_update_only_if_status_matches(repos):
    batches, passes, _ = repos
    made = passes.create(make_batch(batches).id, NOW)
    assert passes.update(made.id, only_if_status="queued", status="running").status == "running"
    assert passes.update(made.id, only_if_status="queued", status="review") is None
    assert passes.get(made.id).status == "running"


def test_update_steps_replaces_the_pipeline(repos):
    batches, _, _ = repos
    made = make_batch(batches)
    batches.update_steps(made.id, [StageStep(key="render_output")])
    assert [s.key for s in batches.get(made.id).steps] == ["render_output"]


def test_clear_removes_only_that_passes_logs(repos):
    batches, passes, logs = repos
    batch = make_batch(batches)
    one, two = passes.create(batch.id, NOW), passes.create(batch.id, NOW)
    logs.add_many(one.id, "pipeline", [(NOW, "a")])
    logs.add_many(two.id, "pipeline", [(NOW, "b")])
    logs.clear(one.id)
    assert logs.for_pass(one.id, "pipeline") == [] and logs.for_pass(two.id, "pipeline") == ["b"]
