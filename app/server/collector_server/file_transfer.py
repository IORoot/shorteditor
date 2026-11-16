from __future__ import annotations

import hashlib
import os
import shutil


class TransferError(Exception):
    pass


class FileTransfer:
    def move(self, source: str, destination: str) -> None:
        self._prepare(destination)
        if self._same_device(source, os.path.dirname(destination)):
            os.rename(source, destination)
            return
        self.copy(source, destination)
        os.remove(source)

    def copy(self, source: str, destination: str) -> None:
        self._prepare(destination)
        shutil.copy2(source, destination)
        if self.checksum(source) != self.checksum(destination):
            os.remove(destination)
            raise TransferError(f"Verification failed for {os.path.basename(source)}")

    def link(self, source: str, destination: str) -> None:
        self._prepare(destination)
        os.symlink(source, destination)

    @staticmethod
    def checksum(path: str) -> str:
        digest = hashlib.blake2b()
        with open(path, "rb") as handle:
            for block in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(block)
        return digest.hexdigest()

    @staticmethod
    def _prepare(destination: str) -> None:
        os.makedirs(os.path.dirname(destination), exist_ok=True)
        if os.path.lexists(destination):
            raise FileExistsError(f"Destination already exists: {destination}")

    @staticmethod
    def _same_device(source: str, directory: str) -> bool:
        return os.stat(source).st_dev == os.stat(directory).st_dev
