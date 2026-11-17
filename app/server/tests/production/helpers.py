from __future__ import annotations

from collector_server.shared.camel_model import CamelModel


class NoSettings(CamelModel):
    pass


class FakeStage:
    settings_model = NoSettings

    def __init__(self, key, title, transitions, position="any"):
        self.key = key
        self.title = title
        self.transitions = transitions
        self.position = position

    def run(self, data, settings, ctx):
        return data


def fake_registry():
    from collector_server.production.registry import StageRegistry

    registry = StageRegistry()
    registry.register(FakeStage("scan", "Scan folder", {"none": "pieces"}, "first"))
    registry.register(FakeStage("order", "Order clips", {"pieces": "pieces"}))
    registry.register(FakeStage("join", "Join in order", {"pieces": "video"}))
    registry.register(FakeStage("render", "Render", {"video": "video"}, "last"))
    return registry
