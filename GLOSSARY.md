# Glossary

**Pipeline**: an ordered list of stages that every card in a batch goes through. Use this for the v3 Pipeline tab only.

**Export stage**: a pipeline stage that sends the finished video out of the app. It passes the video on unchanged and sits last in the pipeline. The first one is Post-iz.

**Postiz pipeline**: Postiz's own queue of scheduled posts, with its channels. Always say "Postiz pipeline", never plain "pipeline", when you mean this.

**Caption**: the text sent with a post to Postiz. Avoid "description".

**Approval mode**: a setting on an export stage. In *manual* mode the card waits for a person to approve the post. In *auto* mode the stage posts when the card reaches it. Default: auto.

**Channel**: a social account in Postiz that a post goes to. Chosen from Postiz's full list, independent of the Postiz pipeline.

**Post type**: whether the Postiz pipeline schedules a post in its next free slot, or saves it as a draft. Default: schedule.

**Output (tab)**: where the results of export stages are shown.

**Auto-collect**: a collector mode, chosen instead of a schedule, that runs the collector when files matching its filters appear in the source and have stopped changing. It only collects; it does not start Production. Not the same as a Production watch, which creates batches from a folder.

**Watching batch**: a batch made from subfolders with watching on. It checks its input folder every few minutes, and each new matching folder that has stopped changing becomes a new card in the same batch. Separate watches from before were converted into watching batches at startup.
