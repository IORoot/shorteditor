from __future__ import annotations

from collections.abc import Callable

from .collector_repository import CollectorRepository
from .models import CollectorConfig, ScheduleDraft

_DEMO = [
    (
        CollectorConfig(
            name="Coach Saturdays",
            source_type="ssh",
            host="coach-nas",
            user="andy",
            key_path="~/.ssh/id_ed25519",
            input_folder="/volume1/clips",
            output_folder="/Volumes/Edit/Collected",
            folder_template="{date:YYYY-MM-DD}_{weekday}_{suffix}",
            suffix="coach",
        ),
        ScheduleDraft(enabled=True, kind="weekly", time="02:00", weekdays=[0]),
    ),
    (
        CollectorConfig(name="Camera A – Daily", input_folder="/Volumes/CamA", output_folder="/Volumes/Edit/CamA", folder_template="{date:YYYY}/{date:MM}/{date:DD}"),
        ScheduleDraft(enabled=True, kind="daily", time="23:00"),
    ),
    (
        CollectorConfig(name="Phone Uploads", source_type="local", input_folder="/Volumes/Phones", output_folder="/Volumes/Edit/Phones", transfer="copy", group_by="none", folder_template="phones"),
        ScheduleDraft(enabled=True, kind="cron", time="00:00", cron="0 */6 * * *"),
    ),
    (
        CollectorConfig(name="Jams – Monthly", input_folder="/Volumes/Jams", output_folder="/Volumes/Edit/Jams", group_by="month", folder_template="{date:YYYY-MM}_jam"),
        ScheduleDraft(enabled=False, kind="monthly", time="03:00", day_of_month=1),
    ),
]


def seed_demo(collectors: CollectorRepository, save_schedule: Callable[[int, ScheduleDraft], object]) -> int:
    if collectors.list():
        return 0
    for config, draft in _DEMO:
        record = collectors.add_with_config(config)
        save_schedule(record.id, draft)
    return len(_DEMO)
