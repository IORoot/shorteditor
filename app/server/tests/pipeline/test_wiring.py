import pytest
from collector_server.pipeline.wiring import build_pipeline
from collector_server.production.wiring import build_library


def test_build_pipeline_seeds_join_clips(db, tmp_path):
    stage = build_pipeline(db, build_library())
    [row] = stage.service.list()
    assert row.name == "Join clips" and row.stage_count == 5


@pytest.mark.full
def test_building_twice_does_not_seed_twice(db, tmp_path):
    catalog = build_library()
    build_pipeline(db, catalog)
    assert len(build_pipeline(db, catalog).service.list()) == 1
