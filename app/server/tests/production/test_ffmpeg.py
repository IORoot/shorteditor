import pytest

from collector_server.production.ffmpeg import FfmpegError, FfmpegRunner
from collector_server.production.worker import LocalWorker
from tests.production.helpers import make_clip, requires_ffmpeg

pytestmark = requires_ffmpeg


@pytest.fixture
def lines():
    return []


@pytest.fixture
def runner(lines):
    return FfmpegRunner(LocalWorker(), lines.append)


def test_duration_of_generated_clip(tmp_path, runner):
    clip = make_clip(tmp_path / "a.mp4", seconds=2)
    assert abs(runner.duration(clip) - 2.0) < 0.2


def test_has_audio_true_and_false(tmp_path, runner):
    assert runner.has_audio(make_clip(tmp_path / "a.mp4", audio=True)) is True
    assert runner.has_audio(make_clip(tmp_path / "b.mp4", audio=False)) is False


def test_capture_time_from_tag(tmp_path, runner):
    clip = make_clip(tmp_path / "a.mp4", creation_time="2026-11-10T07:02:11Z")
    assert runner.capture_time(clip) == 1794294131.0


def test_capture_time_none_when_missing(tmp_path, runner):
    assert runner.capture_time(make_clip(tmp_path / "a.mp4")) is None


def test_failure_raises_with_tail(tmp_path, runner):
    with pytest.raises(FfmpegError) as error:
        runner.run(["-i", str(tmp_path / "missing.mp4"), str(tmp_path / "out.mp4")])
    assert "missing.mp4" in str(error.value)


def test_every_line_is_logged(tmp_path, runner, lines):
    runner.run(["-i", make_clip(tmp_path / "a.mp4"), "-c", "copy", str(tmp_path / "b.mp4")])
    assert any("Input #0" in line for line in lines)


def test_path_with_spaces_and_quotes(tmp_path, runner):
    clip = make_clip(tmp_path / "it's a \"clip\" é.mp4")
    assert runner.duration(clip) > 1


def test_probe_failure_raises(tmp_path, runner):
    with pytest.raises(FfmpegError):
        runner.duration(str(tmp_path / "nope.mp4"))


@pytest.mark.parametrize("name", ["-i.mp4", "-version", "-f"])
def test_probe_handles_names_that_look_like_options(tmp_path, runner, monkeypatch, name):
    make_clip(tmp_path / "real.mp4", seconds=2)
    (tmp_path / name).write_bytes((tmp_path / "real.mp4").read_bytes())
    monkeypatch.chdir(tmp_path)  # a relative name is what can be mistaken for an option
    assert abs(runner.duration(name) - 2.0) < 0.2
    assert runner.has_audio(name) is True
    assert runner.capture_time(name) is None
