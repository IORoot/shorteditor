import pytest

from collector_server.production.stage_api import StageContext, StageError
from collector_server.production.stages.scan_folder import ScanFolder, ScanSettings


def test_an_empty_scan_says_what_it_looked_at(tmp_path):
    logs = []
    ctx = StageContext(str(tmp_path), str(tmp_path), str(tmp_path), None, logs.append)
    with pytest.raises(StageError, match="No clips found"):
        ScanFolder().run(None, ScanSettings(), ctx)
    assert any(line.startswith(f"Looking in {tmp_path}: it exists, 0 entries at the top level") for line in logs)
    assert "Found 0 files in the folder and its subfolders" in logs
