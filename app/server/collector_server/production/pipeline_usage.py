from __future__ import annotations

from collector_server.shared.pipeline import OffImpact, UsageItem

from .repositories import BatchRepository, PassRepository


class ProductionUsage:
    """Which batches use a pipeline, for the Pipeline tab. Implements shared PipelineUsage.

    A batch that is watching counts as a watch in the impact of switching the pipeline off: it stops adding new folders."""

    def __init__(self, batches: BatchRepository, passes: PassRepository) -> None:
        self._batches, self._passes = batches, passes

    def users_of(self, pipeline_id: int) -> list[UsageItem]:
        items = []
        for batch in self._batches.by_pipeline(pipeline_id):
            passes = self._passes.for_batch(batch.id)
            items.append(UsageItem(kind="batch", id=batch.id, name=batch.name, status=passes[-1].status if passes else None, at=batch.created_at))
        return items

    def off_impact(self, pipeline_id: int) -> OffImpact:
        batches = self._batches.by_pipeline(pipeline_id)
        watching = sum(1 for batch in batches if batch.watching)
        waiting = sum(1 for batch in batches if self._newest_queued(batch.id))
        return OffImpact(watches=watching, waiting_batches=waiting)

    def _newest_queued(self, batch_id: int) -> bool:
        passes = self._passes.for_batch(batch_id)
        return bool(passes) and passes[-1].status == "queued"
