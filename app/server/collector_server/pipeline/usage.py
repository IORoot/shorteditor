from __future__ import annotations

from collector_server.shared.pipeline import OffImpact, UsageItem


class NoUsage:
    """Nothing depends on a pipeline yet. Production replaces this."""

    def users_of(self, pipeline_id: int) -> list[UsageItem]:
        return []

    def off_impact(self, pipeline_id: int) -> OffImpact:
        return OffImpact(watches=0, waiting_batches=0)
