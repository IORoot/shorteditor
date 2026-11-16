from datetime import datetime, timezone

import pytest

from collector_server.date_source import ClipDateResolver, compile_pattern
from tests.conftest import LONDON
from tests.helpers import make_clip, make_mp4

CREATED = datetime(2026, 11, 14, 18, 40, tzinfo=timezone.utc)
MTIME = datetime(2026, 1, 2, 3, 4, tzinfo=LONDON)


def test_modified_time_is_the_default_source(tmp_path):
    clip = make_clip(tmp_path / "a.mp4", MTIME)
    when, kind = ClipDateResolver(["mtime"], "", LONDON).resolve(str(clip))
    assert (when, kind) == (MTIME, "mtime")


def test_metadata_is_used_first_and_converted_to_the_local_zone(tmp_path):
    clip = make_mp4(tmp_path / "a.mp4", CREATED, MTIME)
    when, kind = ClipDateResolver(["metadata", "mtime"], "", LONDON).resolve(str(clip))
    assert kind == "metadata" and when == CREATED and when.tzinfo == LONDON


def test_missing_metadata_falls_back_to_the_next_source(tmp_path):
    clip = make_clip(tmp_path / "GX_20261114_184000.mp4", MTIME, b"not an mp4")
    when, kind = ClipDateResolver(["metadata", "filename", "mtime"], "GX_YYYYMMDD_HHmmss", LONDON).resolve(str(clip))
    assert kind == "filename" and when == datetime(2026, 11, 14, 18, 40, tzinfo=LONDON)


def test_filename_without_time_tokens_uses_midnight(tmp_path):
    clip = make_clip(tmp_path / "clip-2026-11-14.mp4", MTIME)
    when, kind = ClipDateResolver(["filename"], "clip-YYYY-MM-DD", LONDON).resolve(str(clip))
    assert (kind, when) == ("filename", datetime(2026, 11, 14, 0, 0, tzinfo=LONDON))


def test_unmatched_or_impossible_filename_dates_fall_back_to_modified_time(tmp_path):
    clip = make_clip(tmp_path / "other.mp4", MTIME)
    assert ClipDateResolver(["filename"], "GX_YYYYMMDD", LONDON).resolve(str(clip)) == (MTIME, "mtime")
    bad = make_clip(tmp_path / "GX_20261399.mp4", MTIME)
    assert ClipDateResolver(["filename", "mtime"], "GX_YYYYMMDD", LONDON).resolve(str(bad)) == (MTIME, "mtime")


def test_source_order_matters(tmp_path):
    clip = make_mp4(tmp_path / "GX_20200101.mp4", CREATED, MTIME)
    first = ClipDateResolver(["filename", "metadata"], "GX_YYYYMMDD", LONDON).resolve(str(clip))
    second = ClipDateResolver(["metadata", "filename"], "GX_YYYYMMDD", LONDON).resolve(str(clip))
    assert first[1] == "filename" and second[1] == "metadata"


def test_pattern_compilation_rules():
    assert compile_pattern("VID_YYYYMMDD_HHmmss").search("VID_20261114_184000.mp4")
    with pytest.raises(ValueError, match="YYYY, MM and DD"):
        compile_pattern("VID_HHmm")
    with pytest.raises(ValueError, match="only once"):
        compile_pattern("YYYY-YYYY-MM-DD")


@pytest.mark.parametrize(
    "sources,pattern,message",
    [([], "", "at least one"), (["mtime", "mtime"], "", "each used once"), (["gps"], "", "each used once"), (["filename"], "", "YYYY, MM and DD")],
)
def test_invalid_resolver_configs_raise(sources, pattern, message):
    with pytest.raises(ValueError, match=message):
        ClipDateResolver(sources, pattern, LONDON)
