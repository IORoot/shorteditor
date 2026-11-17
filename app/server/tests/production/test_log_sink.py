from collector_server.production.log_sink import LogSink

NOW = "2026-11-17T10:00:00+00:00"


class CountingLogs:
    def __init__(self):
        self.writes = []

    def add_many(self, pass_id, kind, rows):
        self.writes.append(list(rows))


def sink_of(logs, **kw):
    ticks = iter(range(10**6))
    return LogSink(logs, 1, "ffmpeg", lambda: f"t{next(ticks)}", **kw)


def test_log_lines_are_written_in_groups():
    logs = CountingLogs()
    sink = sink_of(logs, batch=50)
    for n in range(120):
        sink(f"line {n}")
    sink.flush()
    assert [len(w) for w in logs.writes] == [50, 50, 20]


def test_a_batch_of_one_writes_every_line_at_once():
    logs = CountingLogs()
    sink_of(logs, batch=1)("x")
    assert len(logs.writes) == 1


def test_each_line_keeps_its_own_time():
    logs = CountingLogs()
    sink = sink_of(logs, batch=50)
    sink("a")
    sink("b")
    sink.flush()
    assert [at for at, _ in logs.writes[0]] == ["t0", "t1"]


def test_ffmpeg_log_keeps_a_limited_number_of_lines():
    logs = CountingLogs()
    sink = sink_of(logs, batch=50, keep=100)
    for n in range(5000):
        sink(f"line {n}")
    sink.flush()
    written = [text for group in logs.writes for _, text in group]
    assert len(written) == 101 and written[-1] == "(more lines were not kept)" and written[99] == "line 99"


def test_very_long_log_lines_are_shortened():
    logs = CountingLogs()
    sink = sink_of(logs, batch=1)
    sink("x" * 50_000)
    text = logs.writes[0][0][1]
    assert len(text) <= 2100 and text.endswith("…")
