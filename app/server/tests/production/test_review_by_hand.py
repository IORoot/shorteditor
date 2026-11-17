import pytest

from collector_server.production.pieces import Piece, PiecesData
from collector_server.production.stage_api import BlockedError, StageContext, StageError
from collector_server.production.stages.review_by_hand import STAGE, ReviewSettings


def ctx(tmp_path):
    return StageContext(str(tmp_path), str(tmp_path), str(tmp_path), None, lambda line: None)


def clips():
    return PiecesData(items=[Piece(clip=f"/x/{n}.mp4", clip_duration=5) for n in "abc"])


def test_stops_for_a_pick_then_keeps_only_the_picked_clips(tmp_path):
    with pytest.raises(BlockedError) as stop:
        STAGE.run(clips(), ReviewSettings(), ctx(tmp_path))
    assert stop.value.choices == ["Keep the picked clips"] and stop.value.items == ["a.mp4 (5.0 s)", "b.mp4 (5.0 s)", "c.mp4 (5.0 s)"]
    kept = STAGE.run(clips(), ReviewSettings(picks=[2, 0]), ctx(tmp_path))
    assert [p.clip for p in kept.items] == ["/x/a.mp4", "/x/c.mp4"]


@pytest.mark.full
def test_picking_nothing_says_so(tmp_path):
    with pytest.raises(StageError, match="No clips were picked"):
        STAGE.run(clips(), ReviewSettings(picks=[]), ctx(tmp_path))
