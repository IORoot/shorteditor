from __future__ import annotations

from collector_server.shared.pipeline import OffImpact, UsageItem

from .repositories import BatchRepository, PassRepository
from .watch_repository import WatchRepository


class ProductionUsage:
    """Which batches and watches use a pipeline, for the Pipeline tab. Implements shared PipelineUsage."""

    def __init__(self, batches: BatchRepository, passes: PassRepository, watches: WatchRepository) -> None:
        self._batches, self._passes, self._watches = batches, passes, watches

    def users_of(self, pipeline_id: int) -> list[UsageItem]:
        items = []
        for batch in self._batches.by_pipeline(pipeline_id):
            passes = self._passes.for_batch(batch.id)
            items.append(UsageItem(kind="batch", id=batch.id, name=batch.name, status=passes[-1].status if passes else None, at=batch.created_at))
        for watch in self._watches.list():
            if watch.pipeline_id == pipeline_id:
                items.append(UsageItem(kind="watch", id=watch.id, name=watch.name, status="on" if watch.enabled else "off", at=watch.last_checked_at))
        return items

    def off_impact(self, pipeline_id: int) -> OffImpact:
        watches = sum(1 for watch in self._watches.list() if watch.pipeline_id == pipeline_id and watch.enabled)
        waiting = sum(1 for batch in self._batches.by_pipeline(pipeline_id) if self._newest_queued(batch.id))
        return OffImpact(watches=watches, waiting_batches=waiting)

    def _newest_queued(self, batch_id: int) -> bool:
        passes = self._passes.for_batch(batch_id)
        return bool(passes) and passes[-1].status == "queued"
