import { ChevronRight } from 'lucide-react';
import { iconOf, summaryFor } from '../../lib/stageMeta';
import { isMissing, titleOf } from '../../lib/steps';
import type { StageInfo, StageStep } from '../../lib/types';

export interface StageFlowProps {
  steps: StageStep[];
  library: StageInfo[];
  /** Clicking a stage opens the editor on it. */
  onOpen?: (stage: number) => void;
}

/** The stages of a pipeline in order, as a row of boxes with a chevron between each: what happens to the clips, at a glance. */
export function StageFlow({ steps, library, onOpen }: StageFlowProps) {
  return (
    <ol aria-label="Stages" className="flex min-w-0 items-stretch gap-1 overflow-x-auto pb-1">
      {steps.map((step, index) => {
        const Icon = iconOf(step.key);
        const missing = isMissing(step, library);
        const summary = summaryFor(step.key, library.find((info) => info.key === step.key), step);
        return (
          <li key={`${index}-${step.key}`} className="flex shrink-0 items-stretch gap-1">
            <button
              type="button"
              title={summary}
              aria-label={`Edit ${titleOf(step, library)} stage`}
              onClick={() => onOpen?.(index)}
              className={`flex w-[190px] flex-col gap-1 rounded-[12px] px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-primary ${missing ? 'bg-bad-soft hover:bg-bad-soft' : 'bg-fill-2 hover:bg-fill-3'} ${step.enabled ? '' : 'opacity-50'}`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <Icon size={14} aria-hidden="true" className="shrink-0 text-text-2" />
                <span className="truncate text-small font-semibold">{titleOf(step, library)}</span>
                {step.enabled ? null : <span className="shrink-0 text-caption text-text-3">Off</span>}
              </span>
              <span className="truncate text-caption text-text-2">{summary}</span>
            </button>
            {index < steps.length - 1 ? <ChevronRight size={16} aria-hidden="true" className="mt-3 shrink-0 text-text-3" /> : null}
          </li>
        );
      })}
    </ol>
  );
}
