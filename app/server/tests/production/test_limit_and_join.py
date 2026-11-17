import pytest

from collector_server.production.pieces import Piece, PiecesData, VideoData
from collector_server.production.stage_api import BlockedError, StageError
from collector_server.production.stages.join_pieces import STAGE as JOIN
from collector_server.production.stages.limit_length import STAGE as LIMIT
import os

from tests.production.helpers import make_clip, make_ctx, probe, requires_ffmpeg, rotate_metadata


def pieces(*lengths):
    return PiecesData(items=[Piece(clip=f"/x/{n}.mp4", clip_duration=length) for n, length in enumerate(lengths)])


def limit(data, tmp_path, **settings):
    return LIMIT.run(data, LIMIT.settings_model(**settings), make_ctx(tmp_path))


def test_within_limit_is_unchanged(tmp_path):
    data = pieces(20, 30)
    assert limit(data, tmp_path, max_seconds=60) == data


def test_over_limit_blocks_with_choices(tmp_path):
    with pytest.raises(BlockedError) as blocked:
        limit(pieces(40, 40), tmp_path, max_seconds=60)
    assert blocked.value.choices == ["drop_shortest", "keep_first"]
    assert "80 s" in blocked.value.reason and "20 s over" in blocked.value.reason


def test_drop_shortest_keeps_order_and_fits(tmp_path):
    data = limit(pieces(30, 5, 20, 8), tmp_path, max_seconds=60, choice="drop_shortest")
    assert [p.clip for p in data.items] == ["/x/0.mp4", "/x/2.mp4", "/x/3.mp4"]
    assert data.total <= 60


def test_drop_shortest_trims_a_single_piece_that_is_still_too_long(tmp_path):
    data = limit(pieces(90), tmp_path, max_seconds=60, choice="drop_shortest")
    assert len(data.items) == 1 and abs(data.total - 60) < 0.001


def test_keep_first_trims_last_piece_to_fit(tmp_path):
    data = limit(pieces(40, 40), tmp_path, max_seconds=60, choice="keep_first")
    assert [round(p.length) for p in data.items] == [40, 20]


def test_keep_first_drops_a_sliver_instead_of_a_tiny_piece(tmp_path):
    data = limit(pieces(60, 10), tmp_path, max_seconds=60.02, choice="keep_first")
    assert len(data.items) == 1


def test_limit_must_be_positive():
    with pytest.raises(ValueError):
        LIMIT.settings_model(max_seconds=0)


def join(tmp_path, data, **settings):
    log = []
    ctx = make_ctx(tmp_path, log=log)
    return JOIN.run(data, JOIN.settings_model(**settings), ctx), ctx, log


def clips_to_pieces(*clips, **trim):
    return PiecesData(items=[Piece(clip=c, clip_duration=d, **trim) for c, d in clips])


@requires_ffmpeg
def test_join_makes_one_video_of_summed_length(tmp_path):
    a = make_clip(tmp_path / "a.mp4", seconds=2)
    b = make_clip(tmp_path / "b.mp4", seconds=2)
    video, ctx, _ = join(tmp_path, clips_to_pieces((a, 2), (b, 2)))
    assert isinstance(video, VideoData) and video.size_bytes > 0
    assert abs(video.duration - 4.0) < 0.3
    assert probe(video.path, "stream=width,height", "v:0") == "1080,1920"


@requires_ffmpeg
def test_join_clip_without_audio_has_audio_track(tmp_path):
    a = make_clip(tmp_path / "a.mp4", seconds=2, audio=False)
    b = make_clip(tmp_path / "b.mp4", seconds=2, audio=True)
    video, _, _ = join(tmp_path, clips_to_pieces((a, 2), (b, 2)))
    assert probe(video.path, "stream=codec_type", "a") == "audio"
    assert abs(video.duration - 4.0) < 0.3


@requires_ffmpeg
def test_join_mixed_shapes(tmp_path):
    wide = make_clip(tmp_path / "wide.mp4", seconds=2, width=320, height=180)
    tall = make_clip(tmp_path / "tall.mp4", seconds=2, width=180, height=320)
    video, _, _ = join(tmp_path, clips_to_pieces((wide, 2), (tall, 2)))
    assert probe(video.path, "stream=width,height", "v:0") == "1080,1920"


@requires_ffmpeg
def test_join_trimmed_piece_uses_start_and_end(tmp_path):
    clip = make_clip(tmp_path / "a.mp4", seconds=4)
    data = PiecesData(items=[Piece(clip=clip, clip_duration=4, start=1, end=3)])
    video, _, _ = join(tmp_path, data)
    assert abs(video.duration - 2.0) < 0.3


@requires_ffmpeg
def test_join_blur_fit_runs(tmp_path):
    tall = make_clip(tmp_path / "tall.mp4", seconds=2, width=180, height=320)
    wide = make_clip(tmp_path / "wide.mp4", seconds=2, width=320, height=180)
    video, _, _ = join(tmp_path, clips_to_pieces((tall, 2), (wide, 2)), fit="blur", width=360, height=640)
    assert probe(video.path, "stream=width,height", "v:0") == "360,640"


@requires_ffmpeg
def test_join_same_clip_twice_and_odd_names(tmp_path):
    clip = make_clip(tmp_path / "it's a \"clip\" é.mp4", seconds=2)
    video, _, _ = join(tmp_path, clips_to_pieces((clip, 2), (clip, 2)))
    assert abs(video.duration - 4.0) < 0.3


@requires_ffmpeg
def test_join_handles_forty_pieces_one_at_a_time(tmp_path):
    clip = make_clip(tmp_path / "a.mp4", seconds=1)
    video, _, log = join(tmp_path, clips_to_pieces(*[(clip, 1)] * 40), width=160, height=284)
    assert abs(video.duration - 40.0) < 1.5
    assert any("40/40" in line for line in log)


@requires_ffmpeg
def test_join_cleans_up_segment_files(tmp_path):
    clip = make_clip(tmp_path / "a.mp4", seconds=1)
    video, ctx, _ = join(tmp_path, clips_to_pieces((clip, 1), (clip, 1)))
    assert sorted(os.listdir(ctx.work_dir)) == ["joined.mp4"]


def test_join_with_no_pieces_fails_plainly(tmp_path):
    with pytest.raises(StageError):
        join(tmp_path, PiecesData(items=[]))


@requires_ffmpeg
def test_join_works_when_the_work_folder_has_a_quote_in_its_name(tmp_path):
    home = tmp_path / "Coach's Saturdays"
    home.mkdir()
    clip = make_clip(home / "a.mp4", seconds=1)
    video, _, _ = join(home, clips_to_pieces((clip, 1), (clip, 1)))
    assert abs(video.duration - 2.0) < 0.3


def stream_seconds(path, kind):
    """How much the stream really holds. Container durations hide extra audio packets, so count them."""
    if kind == "v":
        return float(probe(path, "format=duration"))
    return len(probe(path, "packet=pts_time", "a").splitlines()) * 1024 / 48000


@requires_ffmpeg
def test_join_keeps_audio_and_video_the_same_length_over_many_pieces(tmp_path):
    clip = make_clip(tmp_path / "a.mp4", seconds=1)
    video, _, _ = join(tmp_path, clips_to_pieces(*[(clip, 1)] * 20), width=160, height=284)
    assert abs(stream_seconds(video.path, "a") - stream_seconds(video.path, "v")) < 0.05


@requires_ffmpeg
def test_join_clip_whose_audio_is_shorter_than_its_video(tmp_path):
    short = make_clip(tmp_path / "short.mp4", seconds=4, audio_seconds=1.5)
    normal = make_clip(tmp_path / "normal.mp4", seconds=2)
    data = PiecesData(
        items=[
            Piece(clip=short, clip_duration=4, start=2, end=4),  # lies entirely in the silent tail
            Piece(clip=normal, clip_duration=2),
            Piece(clip=short, clip_duration=4, start=1, end=3),  # runs past the end of its audio
        ]
    )
    video, _, _ = join(tmp_path, data)
    assert probe(video.path, "stream=codec_type", "a") == "audio"
    assert abs(stream_seconds(video.path, "a") - stream_seconds(video.path, "v")) < 0.05
    assert abs(video.duration - 6.0) < 0.3


@requires_ffmpeg
def test_join_clip_tagged_as_rotated(tmp_path):
    plain = make_clip(tmp_path / "plain.mp4", seconds=2, width=320, height=180)
    rotated = rotate_metadata(plain, tmp_path / "rotated.mp4")
    video, _, _ = join(tmp_path, clips_to_pieces((rotated, 2)))
    assert probe(video.path, "stream=width,height", "v:0") == "1080,1920"


@requires_ffmpeg
def test_join_does_not_leave_the_final_file_depending_on_segments(tmp_path):
    clip = make_clip(tmp_path / "a.mp4", seconds=1)
    video, _, _ = join(tmp_path, clips_to_pieces((clip, 1)))
    assert probe(video.path, "stream=codec_name", "a") == "aac"


def test_limit_has_a_sensible_minimum():
    with pytest.raises(ValueError):
        LIMIT.settings_model(max_seconds=0.5)
