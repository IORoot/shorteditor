from __future__ import annotations

from datetime import datetime

from .domain import RunRecord
from .models import PlanGroup, PlanResult, Run
from .transfer_plan import TransferPlan

SAMPLE_SIZE = 5
LEFT_SAMPLE_SIZE = 10


def format_moment(when: datetime) -> str:
    return f"{when:%a} {when.day} {when:%b}, {when:%H:%M}"


def present_run(run: RunRecord) -> Run:
    return Run(
        id=run.id,
        collector_id=run.collector_id,
        started_at=format_moment(run.started_at),
        trigger=run.trigger,  # type: ignore[arg-type]
        status=run.status,  # type: ignore[arg-type]
        outcome=run.outcome,
        can_undo=run.can_undo,
    )


def present_plan(plan: TransferPlan, transfer: str) -> PlanResult:
    groups = [
        PlanGroup(
            folder=group.folder,
            path=group.path,
            renamed=group.renamed,
            count=group.count,
            bytes=group.bytes,
            sample=[item.name for item in group.files[:SAMPLE_SIZE]],
        )
        for group in plan.groups
    ]
    return PlanResult(
        transfer=transfer,  # type: ignore[arg-type]
        total_files=plan.total_files,
        total_bytes=plan.total_bytes,
        folder_count=plan.folder_count,
        groups=groups,
        notes=plan.notes,
        unmatched=len(plan.unmatched),
        not_selected=len(plan.not_selected),
        left_in_place=plan.left_in_place,
        left_sample=(plan.unmatched + plan.not_selected)[:LEFT_SAMPLE_SIZE],
    )
