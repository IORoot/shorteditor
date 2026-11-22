# Collector auto-collect

Status: proposed. Not yet in an issue tracker: none is configured (run `/setup-matt-pocock-skills`), so this file is the spec.

## Problem Statement

A collector moves matching clips out of a source folder, but only when it is run by hand or at a fixed time of day. Clips arrive whenever the camera or sync tool finishes, so I either run it over and over, or a clip waits for the next slot. I want the collector to notice new clips and collect them by itself.

## Solution

Each collector gets a mode: **Schedule** (today's cron, unchanged) or **Auto-collect**. An auto-collecting collector checks its source folder every so often. When the collector's own filters match files that have not been moved yet, and the folder has stopped changing, it runs by itself. Collecting is all it does; it never starts Production. The collector list shows that it is alive and when it last looked.

"Auto-collect" is a new term and is not the Production watch, which creates batches from a folder.

## User Stories

1. As a collector owner, I want to switch a collector to Auto-collect, so that new clips are collected without my clicking Run.
2. As a collector owner, I want Schedule and Auto-collect to be one choice per collector, so that two triggers never run the same collector at once.
3. As a collector owner, I want existing scheduled collectors to behave exactly as before, so that nothing changes until I opt in.
4. As a collector owner, I want the collector's filters to decide what is collected, so that Auto-collect never takes a file a manual run would not.
5. As a collector owner, I want a run to start only when matching files not yet moved exist, so that an idle folder causes no runs.
6. As a collector owner, I want a run to wait until the folder has stopped changing, so that a clip still being copied is never moved half-written.
7. As a collector owner, I want the settle time to be adjustable per collector with a 2-minute default, so that slow sources can wait longer.
8. As a collector owner, I want "stopped changing" to mean two polls in a row show the same names, sizes and modified times, so that the check does not depend on guessing.
9. As a collector owner, I want the poll interval to be adjustable with a 60-second default and a 30-second minimum, so that I cannot hammer the source.
10. As a collector owner with a remote source, I want a longer default interval, so that listing a networked folder is not done every minute.
11. As a collector owner, I want the first poll after a server restart to count as unsettled, so that a restart in the middle of a copy cannot trigger a run.
12. As a collector owner, I want Auto-collect to keep running with the browser closed, so that it works unattended.
13. As a collector owner, I want the mode, interval and settle time saved on the collector, so that they survive a restart.
14. As a collector owner, I want the first poll after switching to Auto-collect to run on files already waiting, so that the collector's filters alone decide what is taken.
15. As a collector owner, I want to see "N matching files waiting" before I switch to Auto-collect, so that the first run is not a surprise.
16. As a collector owner, I want each run capped at a number of files (default 50, adjustable), so that a filter that matches too much cannot move everything in one go.
17. As a collector owner, I want files over the cap taken on later polls, so that nothing is lost, only spread out.
18. As a collector owner, I want runs started by Auto-collect shown as "watched" in the run history, so that I can tell them from scheduled and manual runs.
19. As a collector owner, I want Undo to work on a watched run, so that I can reverse a bad one.
20. As a collector owner, I want a poll that finds the source unreachable to skip quietly, so that the run history is not filled with failures.
21. As a collector owner, I want "Source unreachable" shown in the collector's status while it lasts, so that I know why nothing is happening.
22. As a collector owner, I want a run to be recorded only when files are actually moved, so that the history is useful.
23. As a collector owner, I want a poll to skip when a manual or earlier run is still moving files, so that two runs never move the same files.
24. As a collector owner, I want to be able to still press Run by hand on an auto-collecting collector, so that I am not locked out.
25. As a collector owner, I want a "Schedule / Auto-collect" toggle in the existing schedule section, so that the one choice is in one place.
26. As a collector owner, I want interval, settle time and the cap shown only under Auto-collect, so that the form is not cluttered.
27. As a collector owner, I want the collector list to show "Auto-collecting · last checked 12s ago", so that I can see it is alive.
28. As a collector owner, I want entries that are out of range (interval under 30s) refused with a clear message, so that I can fix them.
29. As a collector owner, I want a collector that is turned off to stop polling, so that off means off.
30. As a collector owner, I want a failed run not to stop later polls, so that one bad file does not end Auto-collect.

## Implementation Decisions

- **Mode lives on the collector record**, next to the schedule: a mode (schedule or auto-collect), a poll interval in seconds, a settle time in seconds and a per-run file cap. Existing collectors default to Schedule, with the other values at their defaults, so the change is additive.
- **The scheduler's tick gains a second decision.** For each active collector in Auto-collect mode it decides whether a poll is due (interval since the last look), lists the source, and compares the listing snapshot with the previous one. A snapshot is names, sizes and modified times. The collector runs when the snapshot has been identical for the settle time (at least two polls), and the existing planner reports matching unmoved files.
- **Poll state is in memory only.** The last snapshot, when it last changed and when it last looked are not stored. After a restart the state is empty, so the first poll is unsettled, which is the behaviour wanted for story 11. The "last checked" time is shown from this state.
- **"Is anything waiting" reuses the planner (dry run)**, which already applies the collector's filters and date and random-selection rules. Auto-collect adds no filter logic of its own. The same count feeds the "N matching files waiting" shown in the editor.
- **The file cap** is applied when planning a run. Files over it stay in the source and are taken on later polls.
- **Runs** reuse the existing run record, mover and Undo. A new trigger value "watched" is added beside scheduled, caught up and manual. A run record is written only when the mover is started, so unreachable polls and idle polls write nothing.
- **Unreachable source:** the existing reachability check is used, but in auto-collect mode a failure sets a transient status and writes no run. Scheduled runs keep their current behaviour of recording the failure.
- **Overlap** uses the existing per-collector guard. A poll that finds a run in progress simply waits for the next one.
- **No new thread type.** The existing server loop that calls the scheduler tick is used, with the same tick cadence fine enough for the 30-second minimum.
- **Validation:** the interval must be 30 seconds or more, the settle time at least one interval, and the cap at least 1; invalid values are refused with a message, as the schedule fields are today.
- **API:** the collector's schedule/config endpoints carry the mode and its three numbers, plus read-only fields for the waiting count and the last checked time and status. The existing collector-list response gains the status line's data.
- **Web:** a segmented control "Schedule / Auto-collect" in the schedule section of the collector editor; interval, settle time and cap under Auto-collect; the waiting count; and a status line in the collector list.
- **Glossary:** `CONTEXT.md` gets **Auto-collect** (a collector mode that runs the collector when files matching its filters appear and have stopped changing), and a note that it is not the Production watch.

## Testing Decisions

- A good test drives behaviour from outside: given a fake clock, a source listing and a fake mover, what runs and what is recorded. Tests do not look at the snapshot structure or other private state.
- **Seam 1, the scheduler tick** (`tests/collection/test_scheduler.py`, using the existing `FakeChecker`, `FakeMover` and clock fixtures). Cases: nothing before two identical polls and the settle time; runs once matching unmoved files exist and the folder has settled; a changing listing keeps it waiting; idle folder writes no run; the per-run cap; unreachable source writes no run and sets the status; the first poll after a restart is unsettled; runs are recorded as watched; an in-progress run is skipped; Schedule-mode collectors are untouched; a collector turned off is not polled.
- **Seam 2, the planner** (existing planner tests): the waiting count and the cap, through the existing dry run.
- **Seam 3, the collector API** (`tests/collection/test_api_config.py` style): the mode and numbers save and read back, and the minimum interval and other bounds are enforced.
- **Web**, in the existing editor and list test style: the toggle shows and hides the extra fields, entries are sent, the waiting count and status line show.
- Tests marked `full` follow the repo's existing tag convention; the default run stays quick.

## Out of Scope

- Starting a Production batch after a collect.
- Filesystem events (inotify and similar); this is polling only.
- Per-file notifications or any alerting.
- Choosing between "ignore existing files" and "run on the backlog": the backlog always runs.
- Changes to the Production watch.
- Changing the cron schedule behaviour.

## Further Notes

- Polling a remote source costs a listing each time. The longer remote default and the 30-second floor are the only protection in this version.
- If a source is unreachable for a long time the status line is the only sign; there are no alerts.
