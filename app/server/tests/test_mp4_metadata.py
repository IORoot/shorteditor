from datetime import datetime, timezone

from collector_server import mp4_metadata
from tests.helpers import mp4_bytes

CREATED = datetime(2026, 11, 14, 18, 40, tzinfo=timezone.utc)


def write(tmp_path, data: bytes):
    path = tmp_path / "a.mp4"
    path.write_bytes(data)
    return str(path)


def test_reads_a_version_0_creation_time(tmp_path):
    assert mp4_metadata.creation_time(write(tmp_path, mp4_bytes(CREATED))) == CREATED


def test_reads_a_version_1_creation_time(tmp_path):
    assert mp4_metadata.creation_time(write(tmp_path, mp4_bytes(CREATED, version=1))) == CREATED


def test_finds_moov_after_the_media_data(tmp_path):
    assert mp4_metadata.creation_time(write(tmp_path, mp4_bytes(CREATED, moov_last=True))) == CREATED


def test_zero_creation_time_means_unknown(tmp_path):
    assert mp4_metadata.creation_time(write(tmp_path, mp4_bytes(None))) is None


def test_non_video_truncated_and_missing_files_return_none(tmp_path):
    assert mp4_metadata.creation_time(write(tmp_path, b"hello world, not a video")) is None
    assert mp4_metadata.creation_time(write(tmp_path, mp4_bytes(CREATED)[:20])) is None
    assert mp4_metadata.creation_time(write(tmp_path, b"")) is None
    assert mp4_metadata.creation_time(str(tmp_path / "missing.mp4")) is None
