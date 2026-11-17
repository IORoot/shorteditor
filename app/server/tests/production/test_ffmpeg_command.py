import os

import pytest

from collector_server.production.pieces import Piece, PiecesData, VideoData
from collector_server.production.stage_api import StageContext, StageError
from collector_server.production.stages.ffmpeg_command import FfmpegSettings, STAGE


class FakeFfmpeg:
    def __init__(self):
        self.calls = []

    def run(self, args):
        self.calls.append(args)
        with open(args[-1], "wb") as out:
            out.write(b"x")

    def duration(self, path):
        return 5.0


def ctx_with(fake, tmp_path):
    return StageContext(str(tmp_path), str(tmp_path), str(tmp_path), fake, lambda line: None)


def test_each_clip_runs_once_per_piece_and_returns_pieces(tmp_path):
    fake = FakeFfmpeg()
    piece = Piece(clip="/c/a.mp4", clip_duration=20, start=2, end=7)
    result = STAGE.run(PiecesData(items=[piece]), FfmpegSettings(options="-vf eq=brightness=0.06"), ctx_with(fake, tmp_path))
    assert fake.calls[0][:4] == ["-ss", "2.0", "-t", "5.0"] and "/c/a.mp4" in fake.calls[0]
    assert result.items[0].clip.endswith("ffmpeg-0.mp4") and result.items[0].clip_duration == 5.0


def test_refused_options_never_reach_ffmpeg(tmp_path):
    fake = FakeFfmpeg()
    piece = Piece(clip="/c/a.mp4", clip_duration=20)
    with pytest.raises(StageError):
        STAGE.run(PiecesData(items=[piece]), FfmpegSettings(options="-i other.mp4"), ctx_with(fake, tmp_path))
    assert fake.calls == []


@pytest.mark.full
def test_joined_video_runs_once_on_the_video(tmp_path):
    fake = FakeFfmpeg()
    video = VideoData(path="/out/joined.mp4", duration=30, size_bytes=100)
    result = STAGE.run(video, FfmpegSettings(run_on="joined_video", options="-c:a copy"), ctx_with(fake, tmp_path))
    assert len(fake.calls) == 1 and fake.calls[0][:2] == ["-i", "/out/joined.mp4"]
    assert result.path == os.path.join(str(tmp_path), "ffmpeg-joined.mp4") and result.size_bytes == 1
