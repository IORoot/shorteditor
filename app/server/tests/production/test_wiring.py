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
