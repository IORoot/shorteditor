import { ChevronRight } from 'lucide-react';
import { Toggle } from '../../../shared/components/ui/Toggle';
import { plural } from '../../../shared/lib/format';
import { formatLength, formatSize, formatUpdated } from '../../lib/format';
import type { PipelineSummary, StageInfo } from '../../lib/types';
import { StageFlow } from './StageFlow';

export interface PipelineRowProps {
  pipeline: PipelineSummary;
  busy: boolean;
  onToggle: (enabled: boolean) => void;
  onOpen: () => void;
  /** The stage library, once loaded. Without it the row shows no stage overview yet. */
  library?: StageInfo[];
  /** A stage box was clicked: opens the editor on that stage. */
  onOpenStage?: (stage: number) => void;
}

export function PipelineRow({ pipeline, busy, onToggle, onOpen, library, onOpenStage }: PipelineRowProps) {
  return (
    <li aria-label={`Pipeline ${pipeline.name}`} className={`group flex flex-col gap-4 rounded-[16px] bg-surface px-5 py-4 transition-shadow hover:shadow-[0_2px_12px_#0000000f] ${pipeline.enabled ? '' : 'opacity-70'}`}>
      <div className="flex items-center gap-5">
        <Toggle label={`Switch ${pipeline.name}`} checked={pipeline.enabled} disabled={busy} onChange={onToggle} />
        <button type="button" aria-label={`Edit ${pipeline.name}`} onClick={onOpen} className="flex min-w-0 flex-1 flex-col items-start gap-0.5 rounded-lg text-left focus-visible:outline-2 focus-visible:outline-primary">
          <span className="flex max-w-full items-center gap-1.5 text-body font-semibold group-hover:text-primary">
            <span className="truncate">{pipeline.name}</span>
            <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-text-3 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
          </span>
          {pipeline.description ? <span className="max-w-full truncate text-small text-text-2">{pipeline.description}</span> : null}
        </button>
        <dl className="flex shrink-0 items-center gap-6 text-small text-text-2">
          <div className="w-20"><dt className="text-label text-text-3">Stages</dt><dd>{pipeline.stageCount}</dd></div>
          <div className="w-20"><dt className="text-label text-text-3">Max length</dt><dd>{formatLength(pipeline.maxSeconds)}</dd></div>
          <div className="w-20"><dt className="text-label text-text-3">Max size</dt><dd>{formatSize(pipeline.maxSizeMb)}</dd></div>
          <div className="w-28"><dt className="text-label text-text-3">Used by</dt><dd>{pipeline.usedBy === 0 ? 'Nothing yet' : plural(pipeline.usedBy, 'use')}</dd></div>
          <div className="w-28"><dt className="text-label text-text-3">Updated</dt><dd>{formatUpdated(pipeline.updatedAt)}</dd></div>
        </dl>
      </div>
      {library ? <StageFlow steps={pipeline.steps} library={library} onOpen={onOpenStage} /> : null}
    </li>
  );
}
