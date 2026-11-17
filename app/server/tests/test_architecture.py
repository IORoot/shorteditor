import pytest
import ast
from pathlib import Path

PKG = Path(__file__).resolve().parent.parent / "collector_server"
STAGES = ["collection", "production", "output", "pipeline", "shared"]


def violations(files):
    """files: (path relative to the package, source). Returns one message per bad import."""
    out = []
    for path, source in files:
        parts = path.split("/")
        own = parts[0]
        for node in ast.walk(ast.parse(source)):
            targets = []
            if isinstance(node, ast.ImportFrom):
                if node.level:
                    base = parts[:-1][: len(parts) - 1 - (node.level - 1)]
                    targets.append(base + (node.module or "").split(".") if node.module else base)
                    if not node.module:  # `from .. import x`: x names the folder
                        targets = [base + [a.name] for a in node.names] if not base else [base]
                else:
                    mod = node.module or ""
                    if mod == "collector_server":  # `from collector_server import production`
                        targets += [[a.name] for a in node.names]
                    elif mod.startswith("collector_server."):
                        targets.append(mod.split(".")[1:])
            elif isinstance(node, ast.Import):
                targets += [a.name.split(".")[1:] for a in node.names if a.name.startswith("collector_server")]
            for t in targets:
                if t and t[0] != own and t[0] != "shared":
                    out.append(f"{path} imports {'.'.join(t)} ({t[0]})")
    return out


def _files():
    return [
        (str(p.relative_to(PKG)), p.read_text())
        for stage in STAGES
        if (PKG / stage).is_dir()
        for p in (PKG / stage).rglob("*.py")
    ]


def test_no_stage_imports_another_stage():
    assert violations([f for f in _files() if not f[0].startswith("shared/")]) == []


def test_shared_imports_no_stage():
    assert violations([f for f in _files() if f[0].startswith("shared/")]) == []


@pytest.mark.full
@pytest.mark.full
def test_flags_a_collection_module_importing_production():
    assert len(violations([("collection/a.py", "from ..production import x")])) == 1
    assert len(violations([("collection/a.py", "from collector_server.production.x import y")])) == 1
    assert len(violations([("collection/a.py", "import collector_server.production.x")])) == 1
    assert len(violations([("collection/a.py", "from collector_server import production")])) == 1
    assert violations([("collection/a.py", "from collector_server import shared")]) == []
    assert violations([("collection/a.py", "from ..shared.x import y\nfrom .x import z\nimport os")]) == []


def test_flags_a_pipeline_module_importing_production():
    assert len(violations([("pipeline/a.py", "from ..production import x")])) == 1
    assert len(violations([("pipeline/a.py", "from collector_server.production.x import y")])) == 1


@pytest.mark.full
@pytest.mark.full
def test_scan_finds_files():
    assert len(_files()) > 30
    assert len([f for f in _files() if f[0].startswith("shared/")]) > 3
