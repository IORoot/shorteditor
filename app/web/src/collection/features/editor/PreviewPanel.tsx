import { ArrowDown, Film, Info } from 'lucide-react';
import type { FolderPreview } from '../../lib/types';
import type { LoadState } from '../../../hooks/useLoad';
import { TOKENS } from '../../lib/tokens';

export const SAMPLE_FILE = 'GX011234.MP4';
export const SAMPLE_DATE = '2026-11-14T18:40:00';
const SAMPLE_LABEL = 'Sat 14 Nov 2026, 18:40';

export interface PreviewPanelProps {
  state: LoadState<FolderPreview>;
  outputFolder: string;
}

export function PreviewPanel({ state, outputFolder }: PreviewPanelProps) {
  const base = outputFolder ? `${outputFolder.replace(/\/$/, '')}/` : '';
  return (
    <aside aria-label="Live preview" className="flex flex-col gap-5 rounded-[20px] bg-surface p-6">
      <header className="flex flex-col gap-1">
        <h2 className="text-h3 font-semibold">Live preview</h2>
        <p className="text-small text-text-2">What this Collector would do with a sample clip.</p>
      </header>
      <div className="flex items-center gap-3 rounded-[14px] bg-fill-2 p-3.5">
        <Film size={18} aria-hidden="true" className="text-text-2" />
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-small font-semibold">{SAMPLE_FILE}</span>
          <span className="text-caption text-text-2">{SAMPLE_LABEL}</span>
        </div>
      </div>
      <ArrowDown size={18} aria-hidden="true" className="self-center text-text-3" />
      {state.status === 'error' ? (
        <p role="alert" className="rounded-[14px] bg-bad-soft p-4 text-small text-bad">{state.message}</p>
      ) : (
        <div className="flex flex-col gap-1.5 rounded-[14px] bg-accent-soft p-4" aria-busy={state.status === 'loading'}>
          <span className="text-label font-semibold uppercase tracking-[0.6px] text-primary">Moves to</span>
          <span className="break-all font-mono text-caption text-text-2">{base}</span>
          <span data-testid="preview-folder" className="break-all font-mono text-body font-semibold text-primary">
            {state.status === 'ready' ? state.data.relativePath : '…'}
          </span>
          <span className="font-mono text-caption">{SAMPLE_FILE}</span>
        </div>
      )}
      <p className="flex items-start gap-2 text-caption leading-snug text-text-2">
        <Info size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-text-3" />
        If the folder already exists, a -2 suffix is added to the folder name.
      </p>
      <div className="flex flex-col gap-2.5 border-t border-line pt-4">
        <h3 className="text-label font-semibold uppercase tracking-[0.8px] text-text-3">Tokens</h3>
        {TOKENS.map(({ token, example }) => (
          <div key={token} className="flex items-center justify-between text-caption">
            <span className="font-mono font-medium">{token}</span>
            <span className="text-text-2">{example}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}
