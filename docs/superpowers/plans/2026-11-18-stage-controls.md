# Stage controls, FFmpeg stage and drag to reorder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (native, as the user asked) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every pipeline stage the controls in the approved designs, add an optional FFmpeg stage that runs user options per clip or on the joined video, and let stages be dragged into order.

**Architecture:** Stages stay plugin files in `app/server/collector_server/production/stages/`, each exposing `STAGE`. Controls are pydantic settings fields with `title=`; the web draws every form from the JSON schema, so new fields need no web code except the drag list and two display helpers. The FFmpeg stage uses a new pure module `production/ffmpeg_options.py` (check and split options) plus the existing non-shell `FfmpegRunner`. Drag reorder is pointer events in `pipeline/features/edit/StageColumn.tsx` using a pure `moveTo` helper.

**Tech Stack:** Python 3.14, FastAPI, pydantic v2, FFmpeg (already installed); React 19, TypeScript, Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-18-stage-controls-design.md` (controls table, FFmpeg decisions, drag decision). Designs: `designs/video-editor.pen`, frames "Stage – … – Light" and "Pipeline Edit – Drag to reorder – Light".

## Global Constraints

- Stage rule: a stage imports only itself and `shared/`. `production/stages/*.py` may import `production/stage_api.py`, `pieces.py`, `ffmpeg.py`, `ffmpeg_options.py`.
- FFmpeg runs with argument lists only, never a shell (`FfmpegRunner.run(args)`).
- FFmpeg options: at most 1000 characters; placeholders `{input}` and `{output}` only.
- Stage settings limit: 4000 characters of JSON per step (existing rule).
- Pipeline limit: 30 steps (existing rule).
- Tests: only new or changed behaviour. Essential tests are the default run; mark extra tests `@pytest.mark.full` in the same way as before. Web: `npm test` runs essentials (`--tags-filter=!full`).
- Commit messages end with `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`.

## Review Focus

1. An FFmpeg option that reads or writes a file other than the placeholders is refused before FFmpeg runs (`movie=`, `-i`, `-f concat`, `-protocol_whitelist`, a path in a filter).
2. A typo in FFmpeg options fails the pass with the FFmpeg message, never skips clips silently.
3. Detect action padding never takes a part outside its clip.
4. Dragging a stage into a position the check refuses leaves the list unchanged, with the check message shown.
5. Scan folder file name filter with an empty string matches every file.

---

### Task 1: Scan folder controls

**Files:**
- Modify: `app/server/collector_server/production/stages/scan_folder.py`
- Test: `app/server/tests/production/test_scan_and_order.py`

**Interfaces:**
- Consumes: `ScanSettings` (existing).
- Produces: `ScanSettings` gains `name_contains: str = Field("", max_length=100, title="File name contains")`, `name_mode: Literal["contains", "not_contains"] = Field("contains", title="File name rule")`, `skip_hidden_and_duplicates: bool = Field(True, title="Skip hidden and duplicate names")`.

- [ ] **Step 1: Write the failing tests** (add to `test_scan_and_order.py`, mark essential)

```python
def test_scan_name_filter_keeps_matching_names_and_empty_matches_all(tmp_path):
    make_clip_file(tmp_path / "coach_1.mp4")
    make_clip_file(tmp_path / "other.mp4")
    assert [c.clip for c in scan(tmp_path, ScanSettings(name_contains="coach")).items] == [str(tmp_path / "coach_1.mp4")]
    assert len(scan(tmp_path, ScanSettings(name_contains="")).items) == 2
```

- [ ] **Step 2: Run it.** `cd app/server && .venv/bin/python -m pytest tests/production/test_scan_and_order.py -k name_filter -q` → FAIL (field unknown).
- [ ] **Step 3: Add the three fields** above to `ScanSettings`. In `run`, skip a file when `name_contains` is non-empty and the rule fails (case-insensitive substring). Skip hidden files and duplicate basenames in the same folder when `skip_hidden_and_duplicates`.
- [ ] **Step 4: Run the test file.** Expected: all pass.
- [ ] **Step 5: Commit** `git commit -m "Scan folder: name filter and skip hidden and duplicates"`.

### Task 2: Order clips fallback

**Files:**
- Modify: `app/server/collector_server/production/stages/order_clips.py`
- Test: `app/server/tests/production/test_scan_and_order.py`

**Interfaces:**
- Consumes: `OrderSettings` (existing `order_by`, `direction`, `seed`).
- Produces: `fallback: Literal["created", "name", "none"] = Field("created", title="Fallback when there is no capture time")`.

- [ ] **Step 1: Test:** a clip with no capture time, `order_by="capture_time", fallback="name"`, sorts by name among the others; `fallback="created"` uses file time.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the fallback where capture time is `None` (the existing `capture_time falls back to file time` path becomes `created`; `name` uses the file name).
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `"Order clips: fallback when there is no capture time"`.

### Task 3: Limit length trim side

**Files:**
- Modify: `app/server/collector_server/production/stages/limit_length.py`
- Test: `app/server/tests/production/test_limit_and_join.py`

**Interfaces:**
- Produces: `LimitSettings.trim_from: Literal["end", "start"] = Field("end", title="Keep first trims from")`.

- [ ] **Step 1: Test:** with `choice="keep_first", trim_from="start"` over a 20 s clip and a 15 s limit, the kept piece is the last 15 s (`start == 5`).
- [ ] **Step 2: Run** → FAIL. **Step 3:** in `_keep_first`, when `trim_from == "start"`, keep the tail of the last overflowing piece instead of its head. **Step 4:** PASS. **Step 5: Commit** `"Limit length: trim from the start when keeping first"`.

### Task 4: FFmpeg option checks (pure module)

**Files:**
- Create: `app/server/collector_server/production/ffmpeg_options.py`
- Create: `app/server/tests/production/test_ffmpeg_options.py`

**Interfaces:**
- Produces: `split_options(text: str) -> list[str]` (uses `shlex.split(text, posix=True)`, raises `StageError` on unbalanced quotes), `check_options(args: list[str]) -> None` (raises `StageError` with a plain message on the first refused token), `fill_placeholders(args: list[str], input_path: str, output_path: str) -> list[str]`.
- Refused: tokens `-i`, `-f`, `-y`, `-n`, `-protocol_whitelist`, `-filter_script`, `-map_metadata`, `-attach`; any token containing `movie=`, `amovie=`, `subtitles=`, `ass=`, `lut3d=`, `lut=`, `haldclut=`, `sendcmd=`, `drawtext=` with `textfile=`, `concat:`, `file:`, `http:`, `https:`, `pipe:`; any token containing `/` or `\` used as a path in a filter option (`=/`, `=\\`); any `{…}` other than `{input}` and `{output}`; text longer than 1000 characters.

- [ ] **Step 1: Write parametrized failing tests**

```python
@pytest.mark.parametrize("text", ["-i other.mp4", "-f concat", "-vf movie=/etc/passwd", "-vf subtitles=x.srt",
    "-vf lut3d=/tmp/a.cube", "-protocol_whitelist file", "-vf eq=brightness=0.1:textfile=/x", "-map_metadata 0", "-vf {other}"])
def test_refused(text):
    with pytest.raises(StageError):
        check_options(split_options(text))

def test_allowed():
    check_options(split_options("-vf eq=brightness=0.06:contrast=1.1 -c:a copy -crf 20 -preset fast"))
```

- [ ] **Step 2: Run** → FAIL (module missing).
- [ ] **Step 3: Implement** the module per the Interfaces list. Keep it one small file; the blocked-name list is a module constant.
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `"FFmpeg options: split, check and fill placeholders"`.

### Task 5: FFmpeg stage

**Files:**
- Create: `app/server/collector_server/production/stages/ffmpeg_command.py`
- Create: `app/server/tests/production/test_ffmpeg_command.py`

**Interfaces:**
- Consumes: `split_options`, `check_options`, `fill_placeholders` (Task 4); `ctx.ffmpeg.run(args)`, `ctx.ffmpeg.duration(path)`; `PiecesData`, `Piece`, `VideoData`.
- Produces: `FfmpegSettings(run_on: Literal["each_clip", "joined_video"] = "each_clip", options: str = Field("-c:a copy", max_length=1000, title="FFmpeg options"))`; `FfmpegCommand` with `key="ffmpeg"`, `title="FFmpeg"`, `description="Runs your own FFmpeg options on each clip, or on the joined video. Options that read or write other files are refused."`, `transitions={"pieces": "pieces", "video": "video"}`, `position="any"`.
- `run`: parse and check options once (refusal raises `StageError` before any FFmpeg call). For `each_clip` with pieces: for each piece write `work/ffmpeg-N.mp4` by running `-ss start -t length -i {input} <options> {output}` through `fill_placeholders`, and emit a new `Piece(clip=output, clip_duration=ctx.ffmpeg.duration(output))`. For `joined_video` with `VideoData`: run once on `video.path` into `work/ffmpeg-joined.mp4` and return `VideoData` for it (use the same fields as the input, updating `path` and `duration`).

- [ ] **Step 1: Failing tests** with a fake ffmpeg object that records argv and creates the output file (`FakeFfmpeg.run` writes `args[-1]`; `duration` returns 5.0):

```python
def test_each_clip_runs_once_per_piece_and_returns_pieces(tmp_path):
    fake = FakeFfmpeg()
    result = FfmpegCommand().run(PiecesData(items=[Piece(clip="/c/a.mp4", clip_duration=20, start=2, end=7)]), FfmpegSettings(options="-vf eq=brightness=0.06"), ctx_with(fake, tmp_path))
    assert fake.calls[0][:4] == ["-ss", "2.0", "-t", "5.0"] and "/c/a.mp4" in fake.calls[0]
    assert result.items[0].clip.endswith("ffmpeg-0.mp4")

def test_refused_options_never_reach_ffmpeg(tmp_path):
    fake = FakeFfmpeg()
    with pytest.raises(StageError):
        FfmpegCommand().run(PiecesData(items=[...]), FfmpegSettings(options="-i other.mp4"), ctx_with(fake, tmp_path))
    assert fake.calls == []
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** per Interfaces. Use `os.path.join(ctx.work_dir, ...)`. **Step 4: Run** → PASS. **Step 5: Commit** `"FFmpeg stage: raw options per clip or on the joined video"`.

### Task 6: Detect action controls and reuse

**Files:**
- Modify: `app/server/collector_server/production/stages/detect_action.py`
- Create: `app/server/collector_server/production/stages/detect_cache.py`
- Test: `app/server/tests/production/test_detect_action.py`

**Interfaces:**
- Produces on `DetectSettings`: `frames_per_second: float = Field(1.0, ge=0.1, le=2.0, title="Frames per second")`, `padding_before: float = Field(0.5, ge=0, le=10, title="Padding before (s)")`, `padding_after: float = Field(0.5, ge=0, le=10, title="Padding after (s)")`, `merge_gap: float = Field(2.0, ge=0, le=30, title="Merge actions closer than (s)")`, `min_action: float = Field(0.5, ge=0, le=30, title="Drop actions shorter than (s)")`, `reuse_results: bool = Field(True, title="Reuse saved results")`.
- `detect_cache.py` produces `cache_key(model, prompt, clip, size, mtime, start, end) -> str` (sha256 hex) and `load(root, key) -> list[tuple[float,float]] | None`, `save(root, key, parts) -> None`, where `root` is `<output root>/.detect-cache`. The runner passes `cache_root` through `StageContext` (add field `cache_root: str | None = None`, set in `production/runner.py` to `os.path.join(root, ".detect-cache")`).

- [ ] **Step 1: Failing tests:** (a) padding moves a part out by `padding_before/after` but never outside `[0, length]`; (b) two parts 1 s apart with `merge_gap=2` become one; (c) with `reuse_results=True` and a saved entry for the same key, `ask_model` is not called (monkeypatched to fail).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement:** use `frames_per_second` in `extract_frames` (`fps = min(settings.frames_per_second, MAX_FRAMES / length)`), apply padding and merging in a pure function `tidy_parts(parts, length, padding_before, padding_after, merge_gap, min_action)`, and the cache around `ask_model`. Remove the module constant `MIN_ACTION`. **Step 4: Run** → PASS. **Step 5: Commit** `"Detect action: frame rate, padding, merging, saved results"`.

### Task 7: Join in order controls

**Files:**
- Modify: `app/server/collector_server/production/stages/join_pieces.py`
- Test: `app/server/tests/production/test_limit_and_join.py`

**Interfaces:**
- Produces on `JoinSettings`: `loudness: bool = Field(True, title="Level the loudness across clips")`. When true, the audio of the joined file passes through `loudnorm=I=-16:TP=-1.5:LRA=11` (one extra `-af` argument on the existing join call).
- **Deferred (flagged, see Risks):** `transition: Literal["cut", "crossfade"]` and `crossfade_seconds`. This plan does not render crossfades. The UI shows the crossfade choice disabled with the note "Coming soon" until plan 5.

- [ ] **Step 1: Test:** with `loudness=True`, the join call's argument list contains `loudnorm=I=-16:TP=-1.5:LRA=11`; with `False` it does not (fake ffmpeg records argv).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** the setting and the `-af` argument. **Step 4: Run** → PASS. **Step 5: Commit** `"Join: optional loudness levelling"`.

### Task 8: Render output presets and quality

**Files:**
- Modify: `app/server/collector_server/production/stages/render_output.py`
- Test: `app/server/tests/production/test_render_output.py`

**Interfaces:**
- Produces on `RenderSettings`: `preset: Literal["social", "custom"] = Field("social", title="Preset")` (social forces fps 30 and audio 128 kbps; custom keeps the typed values), `quality: Literal["smaller", "balanced", "better"] = Field("balanced", title="Quality")` (multiplies the target video bitrate by 0.7, 1.0, 1.4).

- [ ] **Step 1: Tests:** `target_video_bitrate` for quality `smaller` is 0.7 × balanced; preset `social` ignores a typed fps of 60 and uses 30.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** in `RenderSettings` validation and in `run`. **Step 4: Run** → PASS. **Step 5: Commit** `"Render output: presets and quality"`.

### Task 9: Web: drag to reorder

**Files:**
- Modify: `app/web/src/pipeline/lib/steps.ts` (add `moveTo`)
- Modify: `app/web/src/pipeline/features/edit/StageColumn.tsx` (pointer drag, drop line)
- Modify: `app/web/src/pipeline/features/edit/PipelineEditor.tsx` (pass `onMoveTo`)
- Test: `app/web/src/pipeline/lib/steps.test.ts`, `app/web/src/pipeline/features/edit/edit.test.tsx`

**Interfaces:**
- Produces `moveTo<T>(items: T[], from: number, to: number): T[]` in `steps.ts`: returns a new array with the item at `from` placed at index `to` (clamped to the range; `from === to` returns the same contents).
- `StageColumn` gains `onMoveTo: (from: number, to: number) => void`. Pointer down on the grip starts a drag; pointer move computes the target index from row midpoints; a 3 px accent line (`role="presentation"`, `data-testid="drop-line"`) shows the target; pointer up calls `onMoveTo`. Keyboard: the existing up and down buttons stay.

- [ ] **Step 1: Unit test** `moveTo([a,b,c], 0, 2)` → `[b,c,a]`; `moveTo([a,b,c], 1, 1)` → `[a,b,c]`.
- [ ] **Step 2: Component test (essential):** render the editor with three steps, fire `pointerDown` on the grip of step 1, `pointerMove` to the lower half of step 3, `pointerUp`; expect the stage list order changed and `drop-line` shown during the drag.
- [ ] **Step 3: Run** `npx vitest run src/pipeline` → FAIL. **Step 4: Implement** `moveTo` and the drag handlers (use `setPointerCapture`; no drag library). **Step 5: Run** → PASS. **Step 6: Commit** `"Pipeline editor: drag stages to reorder"`.

### Task 10: Web: summaries and copy for the new stages

**Files:**
- Modify: `app/web/src/pipeline/lib/stageMeta.ts` (icons and summaries for `ffmpeg`, `detect_action` fields)
- Modify: `app/web/src/pipeline/lib/schemaForm.ts` (`textarea` kind for long text: when `maxLength > 200`, `kind` stays `text` and `multiline: true`)
- Modify: `app/web/src/pipeline/features/edit/StageSettings.tsx` (render `multiline` as a textarea; disabled `crossfade` note is not needed because the setting is not in the schema yet)
- Test: `app/web/src/pipeline/lib/schemaForm.test.ts`

**Interfaces:**
- `Field` gains `multiline: boolean` (default false).

- [ ] **Step 1: Test:** a schema property `{type:'string', maxLength:2000}` gives `multiline: true`; `{type:'string', maxLength:100}` gives `false`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** and render a `<textarea>` with `FormField`-matching classes. **Step 4: Run** `npx vitest run src/pipeline` → PASS. **Step 5: Commit** `"Pipeline web: multi-line settings and summaries for new stages"`.

### Task 11: Verify end to end and tidy

- [ ] **Step 1:** `cd app/server && .venv/bin/python -m pytest -q` → essentials pass.
- [ ] **Step 2:** `cd app/web && npx tsc -b --noEmit` → no errors except the known `vite.config.ts` one (report it).
- [ ] **Step 3:** `cd app/web && npx vitest run src/pipeline --tags-filter='!full'` → pass.
- [ ] **Step 4:** Restart uvicorn on port 8000 is the user's job; tell them.
- [ ] **Step 5:** Hand the QA subagent (one, at the end) the spec, this plan and the changed files list. Commit only after QA passes.

---

## Risks and decisions

- **Crossfade is not built in this plan.** The approved design shows it. Rendering crossfades means `xfade` filter chains across clip joins, which breaks the current PCM concat join. It needs its own plan (plan 5). Until then the control is absent from the join stage, not shown disabled.
- **Block list (chosen by you)** is easier to get wrong than an allow list. Task 4 tests the listed cases; review the list whenever FFmpeg changes.
- **Detect action reuse** stores results under the batch output root (`.detect-cache`). Deleting batches does not delete the cache; that is the user's cleanup.
- **Render preset** only changes fps and audio defaults in this plan; it does not change the size logic.

## Self-review

- Spec coverage: every control in the spec table maps to a task (Scan: T1; Order: T2; Limit: T3; Detect: T6; Join: T7 except crossfade, flagged; FFmpeg: T4, T5; Render: T8; drag: T9).
- Names match across tasks: `FfmpegSettings`, `FfmpegCommand`, `split_options`, `check_options`, `fill_placeholders`, `tidy_parts`, `moveTo`, `onMoveTo`.
- Remaining open item: the crossfade decision above.
