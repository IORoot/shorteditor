import os
import sys

import pytest

from collector_server.production.ffmpeg import FfmpegError, FfmpegRunner
from collector_server.production.worker import LocalWorker
from tests.production.helpers import FakeWorker


def test_local_worker_merges_streams_and_returns_exit_code():
    lines = []
    code = LocalWorker().run(
        [sys.executable, "-c", "import sys; print('out'); print('err', file=sys.stderr); sys.exit(3)"], lines.append
    )
    assert code == 3
    assert sorted(lines) == ["err", "out"]


def test_local_worker_passes_arguments_without_a_shell():
    lines = []
    LocalWorker().run([sys.executable, "-c", "import sys; print(sys.argv[1])", "$(echo hi); `x` 'q'"], lines.append)
    assert lines == ["$(echo hi); `x` 'q'"]


@pytest.mark.full
@pytest.mark.full
def test_local_worker_stops_the_process_when_the_callback_raises():
    pids = []

    def explode(line):
        pids.append(int(line))
        raise RuntimeError("log write failed")

    script = "import os, time\nprint(os.getpid(), flush=True)\ntime.sleep(60)"
    with pytest.raises(RuntimeError, match="log write failed"):
        LocalWorker().run([sys.executable, "-c", script], explode)
    with pytest.raises(ProcessLookupError):
        os.kill(pids[0], 0)


@pytest.mark.full
@pytest.mark.full
def test_missing_binary_becomes_code_127():
    runner = FfmpegRunner(FakeWorker(error=FileNotFoundError()), lambda line: None)
    with pytest.raises(FfmpegError) as error:
        runner.run(["-i", "x"])
    assert error.value.code == 127


@pytest.mark.full
@pytest.mark.full
def test_failure_keeps_only_the_last_five_lines():
    runner = FfmpegRunner(FakeWorker(lines=[f"line {n}" for n in range(8)], code=1), lambda line: None)
    with pytest.raises(FfmpegError) as error:
        runner.run(["-i", "x"])
    assert error.value.tail == [f"line {n}" for n in range(3, 8)]


@pytest.mark.full
@pytest.mark.full
def test_probe_uses_the_last_line_when_warnings_come_first():
    runner = FfmpegRunner(FakeWorker(lines=["warning: truncated", "2.5"]), lambda line: None)
    assert runner.duration("a.mp4") == 2.5


@pytest.mark.full
@pytest.mark.full
def test_unreadable_duration_is_an_ffmpeg_error():
    runner = FfmpegRunner(FakeWorker(lines=["N/A"]), lambda line: None)
    with pytest.raises(FfmpegError):
        runner.duration("a.mp4")


@pytest.mark.full
@pytest.mark.full
def test_ffmpeg_is_run_without_progress_stats():
    worker = FakeWorker()
    FfmpegRunner(worker, lambda line: None).run(["-i", "x"])
    assert "-nostats" in worker.argv


@pytest.mark.full
@pytest.mark.full
def test_long_tail_lines_are_shortened():
    runner = FfmpegRunner(FakeWorker(lines=["x" * 5000], code=1), lambda line: None)
    with pytest.raises(FfmpegError) as error:
        runner.run(["-i", "x"])
    assert len(str(error.value)) < 800


@pytest.mark.full
@pytest.mark.full
def test_error_without_output_has_no_dangling_colon():
    runner = FfmpegRunner(FakeWorker(code=-9), lambda line: None)
    with pytest.raises(FfmpegError) as error:
        runner.run(["-i", "x"])
    assert str(error.value) == "FFmpeg stopped with code -9"
