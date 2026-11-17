from collector_server.production.builtin import build_registry
from collector_server.production.catalog import StageLibrary
from collector_server.production.schema import ensure_schema
from collector_server.shared.pipeline import OffImpact, UsageItem


def real_catalog(db, tmp_path) -> StageLibrary:
    ensure_schema(db)
    return StageLibrary(build_registry())


class FakeUsage:
    def __init__(self) -> None:
        self.items: list[UsageItem] = []
        self.impact = OffImpact(watches=0, waiting_batches=0)

    def users_of(self, pipeline_id: int) -> list[UsageItem]:
        return self.items

    def off_impact(self, pipeline_id: int) -> OffImpact:
        return self.impact
