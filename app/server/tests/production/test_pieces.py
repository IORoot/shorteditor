import pytest
from pydantic import ValidationError

from collector_server.production.pieces import Piece, PiecesData, VideoData


@pytest.mark.full
@pytest.mark.full
def test_piece_length_whole_clip():
    assert Piece(clip="a.mp4", clip_duration=10).length == 10


@pytest.mark.full
@pytest.mark.full
def test_piece_length_trimmed():
    assert Piece(clip="a.mp4", clip_duration=10, start=2, end=5).length == 3


@pytest.mark.full
@pytest.mark.full
def test_pieces_total_adds_lengths():
    items = [Piece(clip="a.mp4", clip_duration=3), Piece(clip="b.mp4", clip_duration=4)]
    assert PiecesData(items=items).total == 7


def test_piece_rejects_end_before_start():
    with pytest.raises(ValidationError):
        Piece(clip="a.mp4", clip_duration=10, start=5, end=2)


@pytest.mark.full
@pytest.mark.full
def test_video_data_is_tagged_and_camel_case():
    data = VideoData(path="/o/x.mp4", duration=1.5, size_bytes=10)
    assert data.kind == "video"
    assert data.model_dump(by_alias=True)["sizeBytes"] == 10


@pytest.mark.full
@pytest.mark.full
def test_piece_rejects_zero_length():
    with pytest.raises(ValidationError):
        Piece(clip="a.mp4", clip_duration=10, start=3, end=3)


@pytest.mark.full
@pytest.mark.full
@pytest.mark.parametrize(
    "fields",
    [
        {"clip_duration": 0},
        {"clip_duration": 10, "start": -1},
        {"clip_duration": 10, "start": 12},
        {"clip_duration": 10, "start": 0, "end": 11},
        {"clip_duration": 10, "end": float("nan")},
    ],
)
def test_piece_rejects_impossible_ranges(fields):
    with pytest.raises(ValidationError):
        Piece(clip="a.mp4", **fields)


@pytest.mark.full
@pytest.mark.full
@pytest.mark.parametrize("fields", [{"duration": -1, "size_bytes": 1}, {"duration": 1, "size_bytes": -5}])
def test_video_data_rejects_negative_values(fields):
    with pytest.raises(ValidationError):
        VideoData(path="x.mp4", **fields)
