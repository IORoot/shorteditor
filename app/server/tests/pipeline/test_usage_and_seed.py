import pytest

from collector_server.pipeline.models import PipelineSave
from collector_server.pipeline.repository import PipelineRepository
from collector_server.pipeline.schema import ensure_schema
from collector_server.pipeline.service import PipelineService
from collector_server.pipeline.usage import NoUsage
from collector_server.shared.errors import NotFoundError, StateError
from collector_server.shared.pipeline import OffImpact, PipelineSource, PipelineUsage, StageStep, UsageItem

from .helpers import FakeUsage, real_catalog

NOW = "2026-11-17T10:00:00+00:00"


@pytest.fixture
def parts(db, tmp_path):
    ensure_schema(db)
    repo, usage = PipelineRepository(db), FakeUsage()
    service = PipelineService(repo, real_catalog(db, tmp_path), usage, lambda: NOW)
    return service, repo, usage


def make(service, name="Join", steps=None):
    return service.create(PipelineSave(name=name, steps=steps if steps is not None else service.template()))


def batch(i, name="Coach Saturdays"):
    return UsageItem(kind="batch", id=i, name=f"{name} {i}" if i else name)


@pytest.mark.full
@pytest.mark.full
def test_list_summarises_stage_count_limits_and_usage(parts):
    service, _, usage = parts
    steps = service.template()
    steps[2] = StageStep(key="limit_length", settings={"maxSeconds": 45}, enabled=False)
    steps[4] = StageStep(key="render_output", settings={"maxSizeMb": 80})
    usage.items = [batch(1), batch(2)]
    p = make(service, steps=steps)
    row = service.list()[0]
    assert row.id == p.id and row.stage_count == 4
    assert row.max_seconds is None and row.max_size_mb == 80 and row.used_by == 2


@pytest.mark.full
@pytest.mark.full
def test_summary_falls_back_to_the_stage_default_and_dashes_when_the_stage_is_absent(parts):
    service, _, _ = parts
    bare = [StageStep(key=k) for k in ["scan_folder", "order_clips", "limit_length", "join_pieces", "render_output"]]
    make(service, "A", bare)
    row = service.list()[0]
    assert (row.max_seconds, row.max_size_mb) == (900, 150)
    no_limit = [s for s in service.template() if s.key != "limit_length"]
    make(service, "B", no_limit)
    assert service.list()[1].max_seconds is None


@pytest.mark.full
@pytest.mark.full
def test_a_stored_pipeline_with_an_unknown_stage_still_lists_and_shows_detail(parts):
    service, repo, _ = parts
    p = repo.create("Old", "", [StageStep(key="gone"), StageStep(key="limit_length")], NOW)
    assert service.list()[0].stage_count == 2
    assert service.detail(p.id).id == p.id
    assert any("There is no stage called gone" in e for e in service.check(p.steps))


@pytest.mark.full
@pytest.mark.full
def test_detail_has_users_and_the_five_most_recent_batches(parts):
    service, _, usage = parts
    p = make(service)
    usage.items = [batch(i) for i in range(1, 8)] + [UsageItem(kind="watch", id=1, name="Class folders")]
    d = service.detail(p.id)
    assert len(d.used_by) == 8
    assert [u.id for u in d.recent_batches] == [1, 2, 3, 4, 5]


@pytest.mark.full
@pytest.mark.full
def test_off_impact_passes_through_the_usage_answer(parts):
    service, _, usage = parts
    p = make(service)
    usage.impact = OffImpact(watches=2, waiting_batches=3)
    assert service.off_impact(p.id) == usage.impact
    with pytest.raises(NotFoundError):
        service.off_impact(99)


def test_delete_refuses_a_pipeline_in_use_and_names_what_uses_it(parts):
    service, _, usage = parts
    p = make(service)
    usage.items = [batch(0, "Coach Saturdays")]
    with pytest.raises(StateError, match=r"Coach Saturdays.*Switch it off instead"):
        service.delete(p.id)


@pytest.mark.full
@pytest.mark.full
def test_delete_removes_an_unused_pipeline(parts):
    service, repo, _ = parts
    p = make(service)
    service.delete(p.id)
    assert repo.get(p.id) is None


def test_seed_creates_join_clips_once(parts):
    service, repo, _ = parts
    service.seed()
    service.seed()
    rows = service.list()
    assert [r.name for r in rows] == ["Join clips"] and rows[0].stage_count == 5


def test_seed_does_not_come_back_after_the_user_deletes_it(parts):
    service, _, _ = parts
    service.seed()
    service.delete(service.list()[0].id)
    service.seed()
    assert service.list() == []


@pytest.mark.full
@pytest.mark.full
def test_seed_skips_and_sets_no_marker_when_the_template_is_invalid(db, tmp_path):
    ensure_schema(db)

    class Broken:
        def stages(self):
            return real_catalog(db, tmp_path).stages()

        def check_pipeline(self, steps):
            return ["nope"]

    repo = PipelineRepository(db)
    service = PipelineService(repo, Broken(), NoUsage(), lambda: NOW)
    service.seed()
    assert repo.list() == [] and repo.get_meta("seeded") is None


@pytest.mark.full
@pytest.mark.full
def test_pipeline_source_methods(parts):
    service, _, _ = parts
    a, b = make(service, "A"), make(service, "B")
    service.set_enabled(b.id, False)
    assert isinstance(service, PipelineSource)
    ref = service.get_pipeline(a.id)
    assert ref.enabled is True and ref.name == "A" and ref.steps == a.steps
    assert service.get_pipeline(99) is None
    assert service.get_pipeline(b.id).enabled is False
    assert [r.id for r in service.enabled_pipelines()] == [a.id]


@pytest.mark.full
@pytest.mark.full
def test_no_usage_reports_nothing():
    assert isinstance(NoUsage(), PipelineUsage)
    assert NoUsage().users_of(1) == []
    assert NoUsage().off_impact(1) == OffImpact(watches=0, waiting_batches=0)
