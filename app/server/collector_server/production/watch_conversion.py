from __future__ import annotations

import logging
from datetime import datetime, timezone

from .repositories import BatchRepository
from .service import ProductionService
from .watch_repository import WatchRepository

_log = logging.getLogger(__name__)


def convert_watches(watches: WatchRepository, service: ProductionService, batches: BatchRepository) -> int:
    """Turns each separate watch from before batches could watch into a watching batch, then removes the watch.

    The batch keeps the watch's folder, pattern, pipeline, worker, output folder and timing, and starts with no cards: the folders the
    watch already handled stay in the batches it made. A paused watch becomes a batch that is not watching. A watch that cannot be
    converted (its folder is gone, say) is left as it is and tried again next start. Returns how many were converted."""
    converted = 0
    for watch in watches.list():
        batch_id = None
        try:
            batch = service.create_batch(
                watch.name, watch.parent_folder, watch.pipeline_id, watch.run_on, watch.output_root or service.defaults().output_root,
                steps=watch.steps, folders=[], folder_pattern=watch.pattern, auto_run=True, watching=watch.enabled,
                watch_interval_minutes=watch.interval_minutes, watch_settle_minutes=watch.settle_minutes, watch_max_per_check=watch.max_per_check,
            )
            batch_id = batch.id
            batches.mark_seen(batch.id, sorted(watches.seen(watch.id)), datetime.now(timezone.utc).isoformat())
            watches.delete(watch.id)
            converted += 1
        except Exception:  # noqa: BLE001 - one watch that cannot convert must not stop the others, or the server starting
            _log.exception("could not convert watch %s (%s) into a batch; it is left as it was", watch.id, watch.name)
            if batch_id is not None:
                batches.delete(batch_id)  # never leave a second copy that would be made again next start
    return converted
