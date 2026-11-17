import { Toggle } from '../../../shared/components/ui/Toggle';
import { plural } from '../../../shared/lib/format';
import { formatLength, formatSize, formatUpdated } from '../../lib/format';
import type { PipelineSummary } from '../../lib/types';

export interface PipelineRowProps {
  pipeline: PipelineSummary;
  busy: boolean;
  onToggle: (enabled: boolean) => void;
  onOpen: () => void;
}

export function PipelineRow({ pipeline, busy, onToggle, onOpen }: PipelineRowProps) {
  return (
    <li aria-label={`Pipeline ${pipeline.name}`} className={`flex items-center gap-5 rounded-[16px] bg-surface px-5 py-4 ${pipeline.enabled ? '' : 'opacity-70'}`}>
      <Toggle label={`Switch ${pipeline.name}`} checked={pipeline.enabled} disabled={busy} onChange={onToggle} />
      <button type="button" aria-label={`Edit ${pipeline.name}`} onClick={onOpen} className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left">
        <span className="max-w-full truncate text-body font-semibold">{pipeline.name}</span>
        {pipeline.description ? <span className="max-w-full truncate text-small text-text-2">{pipeline.description}</span> : null}
      </button>
      <dl className="flex shrink-0 items-center gap-6 text-small text-text-2">
        <div className="w-20"><dt className="text-label text-text-3">Stages</dt><dd>{pipeline.stageCount}</dd></div>
        <div className="w-20"><dt className="text-label text-text-3">Max length</dt><dd>{formatLength(pipeline.maxSeconds)}</dd></div>
        <div className="w-20"><dt className="text-label text-text-3">Max size</dt><dd>{formatSize(pipeline.maxSizeMb)}</dd></div>
        <div className="w-28"><dt className="text-label text-text-3">Used by</dt><dd>{pipeline.usedBy === 0 ? 'Nothing yet' : plural(pipeline.usedBy, 'use')}</dd></div>
        <div className="w-28"><dt className="text-label text-text-3">Updated</dt><dd>{formatUpdated(pipeline.updatedAt)}</dd></div>
      </dl>
    </li>
  );
}
