import { useId, useState } from 'react';
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import type { FilterPreviewState } from '../../../hooks/useFilterPreview';
import { FileList } from './FileList';
import { ListLegend } from './ListLegend';

export interface FilterPreviewCardProps {
  preview: FilterPreviewState;
  defaultOpen?: boolean;
}

function subtitle(result: FilterPreviewState['result']): string {
  if (!result) return 'Every file in the input folder, run through your filters.';
  if (result.truncated) return `Showing the newest ${result.clips.length} of ${result.total} files. Counts cover all of them.`;
  return `All ${result.total} ${result.total === 1 ? 'file' : 'files'} in the input folder. Shaded files are filtered out.`;
}

export function FilterPreviewCard({ preview, defaultOpen = true }: FilterPreviewCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  const { result, error, pending, reload } = preview;
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <section aria-label="Filter preview" className="flex flex-col gap-4 rounded-[20px] bg-surface p-6">
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => setOpen(!open)}
            className="flex items-center gap-1.5 self-start text-h3 font-semibold"
          >
            <Chevron size={18} aria-hidden="true" className="text-text-2" />
            Filter preview
          </button>
          <p className="text-small text-text-2">{subtitle(result)}</p>
        </div>
        <button
          type="button"
          aria-label="Refresh file list"
          title="Check the input folder again"
          onClick={reload}
          disabled={pending}
          className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-line text-text-2 hover:text-primary disabled:opacity-60"
        >
          <RefreshCw size={15} aria-hidden="true" className={pending ? 'animate-spin' : ''} />
        </button>
      </header>
      <div id={bodyId} className={`${open ? 'flex' : 'hidden'} flex-col gap-4`}>
        {error ? <p role="alert" className="rounded-xl bg-bad-soft p-3 text-small text-bad">{error}</p> : null}
        {result ? (
          <>
            {result.clips.length ? <FileList clips={result.clips} busy={pending} /> : <p className="text-small text-text-3">No files in the input folder.</p>}
            <ListLegend>
              <span data-testid="selected-count" className="rounded-full bg-accent-soft px-2.5 py-1 text-small font-semibold text-primary">
                {result.selectedCount} of {result.total}
              </span>
            </ListLegend>
          </>
        ) : error ? null : (
          <p className="text-small text-text-3">Loading…</p>
        )}
      </div>
    </section>
  );
}
