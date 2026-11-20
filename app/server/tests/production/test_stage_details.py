from types import SimpleNamespace

from collector_server.production.ffmpeg import FfmpegRunner
from collector_server.production.pieces import Piece, PiecesData, VideoData
from collector_server.production.stage_details import describe
from collector_server.production.stages.limit_length import LimitSettings


class FakeWorker:
    def __init__(self, lines):
        self.lines = lines

    def run(self, argv, on_line):
        for line in self.lines:
            on_line(line)
        return 0


def test_clips_are_listed_in_their_final_order_with_their_times():
    data = PiecesData(items=[Piece(clip="/in/b.mov", clip_duration=60, start=5, end=20), Piece(clip="/in/a.mov", clip_duration=30)])
    details = describe("order_clips", None, data, None, None)
    assert details["kind"] == "clips"
    assert details["clips"][0] == {"name": "b.mov", "start": 5, "end": 20, "length": 15}
    assert details["total"] == 45


def test_limit_length_says_what_it_was_before_and_what_it_was_cut_to():
    before = PiecesData(items=[Piece(clip="/in/a.mov", clip_duration=600), Piece(clip="/in/b.mov", clip_duration=600)])
    after = PiecesData(items=[Piece(clip="/in/a.mov", clip_duration=600), Piece(clip="/in/b.mov", clip_duration=300, end=300)])
    details = describe("limit_length", before, after, LimitSettings(max_seconds=900, choice="keep_first"), None)
    assert (details["before"], details["total"], details["limit"], details["choice"]) == (1200, 900, 900, "keep_first")


def test_a_video_is_described_with_its_picture_and_the_join_target():
    ffmpeg = SimpleNamespace(video_info=lambda path: {"width": 720, "height": 1280, "fps": 30.0})
    settings = SimpleNamespace(width=1080, height=1920, fps=30)
    details = describe("join_pieces", None, VideoData(path="/work/joined.mp4", duration=14.5, size_bytes=1000), settings, ffmpeg)
    assert details == {"kind": "video", "name": "joined.mp4", "duration": 14.5, "sizeBytes": 1000, "width": 720, "height": 1280, "fps": 30.0,
                       "target": {"width": 1080, "height": 1920, "fps": 30}}


def test_video_info_reads_the_picture_size_and_frame_rate():
    runner = FfmpegRunner(FakeWorker(["1080,1920,30000/1001"]), lambda line: None)
    assert runner.video_info("/x.mp4") == {"width": 1080, "height": 1920, "fps": 29.97}
    assert FfmpegRunner(FakeWorker([]), lambda line: None).video_info("/x.mp4") == {"width": None, "height": None, "fps": None}
