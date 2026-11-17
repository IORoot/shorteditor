# Stage controls, FFmpeg stage and drag to reorder

Addendum to `2026-11-17-pipeline-stage-design.md`. Designs to react to: `designs/video-editor.pen`, one frame per stage (to be added after this doc is approved).

## Intent

A pipeline is the list of stages that turns folders of clips into one finished video. Today each stage has only a few settings, and the user can't reorder stages except with the up and down buttons. The user wants every stage to have the controls it needs, an optional FFmpeg stage that runs raw FFmpeg options on the clips, and stages that can be dragged into order.

## Decisions (agreed with the user)

1. **FFmpeg stage takes raw options.** The user types FFmpeg options; the app fills in the input and output paths.
2. **Where it runs is set per stage:** on each clip (before joining) or on the joined video (after joining), chosen in the stage's settings.
3. **Safety is a block list, not an allow list.** The user chose to block only dangerous options. The builder must still refuse anything that reads or writes files other than the placeholders (see Risks).
4. **Drag to reorder** the stages in the editor, plus the existing up and down buttons. No drag library.

## Controls per stage (proposed, awaiting approval)

| Stage | Controls (existing in bold) |
|---|---|
| Scan folder | **Include subfolders, Extensions, Max files, Min length**; file name filter (contains / does not contain); skip hidden and duplicate names |
| Order clips | **Order by, Direction, Random seed**; fallback when a clip has no capture time (use created date or name) |
| Limit length | **Max length (seconds), When over the limit (ask me, drop shortest, keep first)**; trim from the end or the start |
| Detect action (AI) | **Model, Prompt**; frames per second; padding before and after each action; merge actions closer than N seconds; drop actions shorter than N seconds; reuse saved results so a re-run doesn't call the AI again |
| Join in order | **Width, Height, FPS, Fit (crop or blurred background)**; transition between clips (cut or crossfade, length in seconds); loudness levelling on or off |
| FFmpeg (optional) | Run on (each clip or joined video); **FFmpeg options** (raw text, with `{input}` and `{output}` placeholders); keep audio on or off |
| Render output | **FPS, Audio bitrate, Max size (MB), File name**; preset (social 9:16 1080×1920, or custom); video quality |

Bold items already exist in the code. Everything else is new and needs building.

## FFmpeg stage: how it works

- The options are split into arguments, not run through a shell (as today's runner does).
- `{input}` and `{output}` are the only paths. The app fills them in; the user can't name other files.
- A block list refuses options and filters that read or write files outside the placeholders, and options that change the protocol. Examples to block: `movie=`, `amovie=`, `subtitles=`, `ass=`, `lut3d=`, `haldclut=`, `sendcmd=` with a file, `drawtext` with `textfile=`, `-f concat`, `-protocol_whitelist`, any second input (`-i`) or output.
- A refused command fails the pass with a plain message before FFmpeg runs.
- On "each clip", the stage runs once per piece. On "joined video", it runs once on the output of Join.

## Drag to reorder

- In the stage list, drag a row up or down. A drop line shows where it will land.
- The up and down buttons stay for keyboard use.
- Reordering is a change to the pipeline's steps, so the live check runs again and Save follows it, as now.

## Goals

- Every stage exposes the controls a user needs to get the result they want.
- An FFmpeg stage can do anything the user can express as options, on clips or on the joined video.
- Reordering stages is quick with a mouse and possible from the keyboard.

## Non-goals

- No visual FFmpeg filter editor. No preview of the result inside the editor.
- No sandbox or container for FFmpeg (rejected as too large a build for now).
- No new drag dependency.

## Anti-goals

- A raw FFmpeg option must never read or write a file the user did not name, or change the input and output paths.
- A typo in FFmpeg options must never silently skip a clip. It fails the pass with the FFmpeg message.
- Reordering must never produce an order the check refuses without saying why.

## Risks

- **Block lists are easy to get wrong.** A new FFmpeg filter that reads files will get through unless it is on the list. The builder should add a test for each blocked item, and the list should be reviewed whenever FFmpeg changes. If that upkeep becomes too much, switch to an allow list.
- The AI stage needs the API key on the host, as before. Nothing new is sent to workers.

## Approaches considered (recap)

1. Raw options with a block list (chosen by the user).
2. Raw options with an allow list (recommended, not chosen).
3. Raw options in a sandbox (rejected: a large new dependency).

## My calls (the user can overrule these)

- The FFmpeg stage's default run location is "each clip".
- Detect action's default model stays `nvidia/nemotron-nano-12b-v2-vl`, editable, to be checked against OpenRouter's list before release.
- Stage order is kept in the same table; reordering doesn't create a new pipeline.

## Left to the builder

Table and column names, the exact list of blocked FFmpeg items, the drag implementation (pointer events with a drop line), the wording of messages, and fixtures.
