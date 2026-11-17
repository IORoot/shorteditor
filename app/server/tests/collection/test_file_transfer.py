import os

import pytest

from collector_server.collection.file_transfer import FileTransfer, TransferError


@pytest.fixture
def files():
    return FileTransfer()


def write(path, content=b"data"):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    return str(path)


@pytest.mark.full
@pytest.mark.full
def test_move_renames_on_the_same_device_and_creates_folders(files, tmp_path):
    source = write(tmp_path / "in" / "a.mp4")
    destination = str(tmp_path / "out" / "day" / "a.mp4")
    files.move(source, destination)
    assert not os.path.exists(source)
    assert open(destination, "rb").read() == b"data"


@pytest.mark.full
@pytest.mark.full
def test_move_refuses_to_overwrite(files, tmp_path):
    source = write(tmp_path / "a.mp4")
    destination = write(tmp_path / "out" / "a.mp4", b"other")
    with pytest.raises(FileExistsError):
        files.move(source, destination)
    assert os.path.exists(source)
    assert open(destination, "rb").read() == b"other"


def test_cross_device_move_copies_verifies_then_deletes(files, tmp_path, monkeypatch):
    monkeypatch.setattr(FileTransfer, "_same_device", staticmethod(lambda source, directory: False))
    source = write(tmp_path / "a.mp4", b"x" * 5000)
    destination = str(tmp_path / "out" / "a.mp4")
    files.move(source, destination)
    assert not os.path.exists(source)
    assert open(destination, "rb").read() == b"x" * 5000


@pytest.mark.full
@pytest.mark.full
def test_copy_keeps_the_source(files, tmp_path):
    source = write(tmp_path / "a.mp4")
    destination = str(tmp_path / "out" / "a.mp4")
    files.copy(source, destination)
    assert os.path.exists(source) and os.path.exists(destination)


def test_failed_verification_removes_the_copy_and_raises(files, tmp_path, monkeypatch):
    source = write(tmp_path / "a.mp4")
    destination = str(tmp_path / "out" / "a.mp4")
    calls = iter(["one", "two"])
    monkeypatch.setattr(FileTransfer, "checksum", staticmethod(lambda path: next(calls)))
    with pytest.raises(TransferError, match="Verification failed"):
        files.copy(source, destination)
    assert not os.path.exists(destination)
    assert os.path.exists(source)


@pytest.mark.full
@pytest.mark.full
def test_failed_cross_device_move_never_deletes_the_source(files, tmp_path, monkeypatch):
    monkeypatch.setattr(FileTransfer, "_same_device", staticmethod(lambda source, directory: False))
    source = write(tmp_path / "a.mp4")
    calls = iter(["one", "two"])
    monkeypatch.setattr(FileTransfer, "checksum", staticmethod(lambda path: next(calls)))
    with pytest.raises(TransferError):
        files.move(source, str(tmp_path / "out" / "a.mp4"))
    assert os.path.exists(source)


@pytest.mark.full
@pytest.mark.full
def test_link_creates_a_symlink(files, tmp_path):
    source = write(tmp_path / "a.mp4")
    destination = str(tmp_path / "out" / "a.mp4")
    files.link(source, destination)
    assert os.path.islink(destination) and os.path.realpath(destination) == os.path.realpath(source)


@pytest.mark.full
@pytest.mark.full
def test_checksum_is_stable_and_content_sensitive(files, tmp_path):
    first = write(tmp_path / "1", b"abc")
    second = write(tmp_path / "2", b"abc")
    third = write(tmp_path / "3", b"abd")
    assert files.checksum(first) == files.checksum(second) != files.checksum(third)
