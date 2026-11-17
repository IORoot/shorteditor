import pytest
from collector_server.production.wiring import Production


class FlakyQueue:
    def __init__(self):
        self.calls = 0

    def tick(self):
        self.calls += 1
        if self.calls == 1:
            raise RuntimeError("database hiccup")
        return [7]


def test_a_failing_tick_is_survived_and_the_next_one_runs(caplog):
    production = Production(router=None, queue=FlakyQueue())
    production.tick()
    production.tick()
    assert production.queue.calls == 2
    assert "production tick failed" in caplog.text


class CountingPart:
    def __init__(self, fail=False):
        self.calls, self.fail = 0, fail

    def tick(self):
        self.calls += 1
        if self.fail:
            raise RuntimeError("boom")


@pytest.mark.full
@pytest.mark.full
def test_the_queue_and_the_watches_can_be_ticked_separately_and_together():
    production = Production(router=None, queue=CountingPart(), scheduler=CountingPart())
    production.tick_queue()
    assert (production.queue.calls, production.scheduler.calls) == (1, 0)
    production.tick_watches()
    assert (production.queue.calls, production.scheduler.calls) == (1, 1)
    production.tick()
    assert (production.queue.calls, production.scheduler.calls) == (2, 2)


@pytest.mark.full
@pytest.mark.full
def test_a_failing_watch_check_does_not_stop_the_queue_tick(caplog):
    production = Production(router=None, queue=CountingPart(), scheduler=CountingPart(fail=True))
    production.tick()
    assert production.queue.calls == 1 and "production tick failed" in caplog.text


def test_build_production_takes_the_library_and_a_pipeline_source(db, tmp_path):
    from collector_server.production.wiring import build_library, build_production
    from collector_server.shared.pipeline import StageCatalog
    from tests.production.helpers import FakePipelines

    assert isinstance(build_library(), StageCatalog)
    assert build_production(db, str(tmp_path), build_library(), FakePipelines()).router is not None
