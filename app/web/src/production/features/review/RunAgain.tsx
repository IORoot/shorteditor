import { useState } from 'react';
import { Button } from '../../../shared/components/ui/Button';
import type { PipelineChoice } from '../../lib/types';

export interface RunAgainProps {
  /** The pipeline the batch uses now. Null for a batch made before pipelines: it must choose one. */
  currentPipelineId: number | null;
  pipelines: PipelineChoice[];
  busy: boolean;
  onRunAgain: (pipelineId: number) => void;
}

/** Run again with the batch's pipeline, or with another one to compare. A batch from before pipelines must choose. */
export function RunAgain({ currentPipelineId, pipelines, busy, onRunAgain }: RunAgainProps) {
  const [choice, setChoice] = useState(currentPipelineId === null ? '' : String(currentPipelineId));
  const chosen = choice === '' ? null : Number(choice);
  // A batch on a pipeline that is now switched off still shows that pipeline, so the choice is visible.
  const options = currentPipelineId !== null && !pipelines.some((p) => p.id === currentPipelineId)
    ? [{ id: currentPipelineId, name: 'Current pipeline (switched off)', stageCount: 0 }, ...pipelines]
    : pipelines;
  return (
    <div className="flex flex-col gap-2.5">
      {options.length === 0 ? (
        <p className="text-small text-text-2">No pipelines are switched on. Switch one on to run again.</p>
      ) : (
        <label className="flex flex-col gap-1.5 text-caption font-semibold text-text-2">Pipeline for the next pass
          <select aria-label="Pipeline for the next pass" value={choice} onChange={(event) => setChoice(event.target.value)} className="select select-sm rounded-[10px] border-0 bg-fill-2 text-small font-normal text-base-content">
            {currentPipelineId === null ? <option value="">Choose a pipeline</option> : null}
            {options.map((pipeline) => <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>)}
          </select>
        </label>
      )}
      <Button disabled={busy || chosen === null} onClick={() => chosen !== null && onRunAgain(chosen)}>Run again</Button>
    </div>
  );
}
