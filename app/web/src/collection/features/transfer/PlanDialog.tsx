import { Check, Folder, Info, X } from 'lucide-react';
import type { PlanResult, Transfer } from '../../lib/types';
import type { LoadState } from '../../../hooks/useLoad';
import { formatBytes, plural, suffixAdded } from '../../../lib/format';
import { Button } from '../../../components/ui/Button';
import { StatusChip } from '../../../components/ui/StatusChip';

export type PlanMode = 'dry' | 'run';

const VERB: Record<Transfer, string> = { move: 'Move', copy: 'Copy', link: 'Link' };

export interface PlanDialogProps {
  mode: PlanMode;
  collectorName: string;
  state: LoadState<PlanResult>;
  confirming: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

export function PlanDialog({ mode, collectorName, state, confirming, error, onConfirm, onClose }: PlanDialogProps) {
  const plan = state.status === 'ready' ? state.data : null;
  const verb = plan ? VERB[plan.transfer] : 'Move';
  const isRun = mode === 'run';
  return (
    <dialog open aria-label={isRun ? 'Run now' : 'Dry run'} className="modal modal-open">
      <div className="modal-box flex max-h-[88vh] w-[820px] max-w-full flex-col gap-5 rounded-3xl bg-surface p-7">
        <header className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-h2 font-bold tracking-[-0.4px]">{isRun ? 'Run now' : 'Dry run'} · {collectorName}</h2>
            <p className="text-small text-text-2">
              {isRun ? 'Review the plan. Clips are moved when you confirm.' : 'This is a preview. Nothing has been moved or changed.'}
            </p>
          </div>
          <StatusChip tone={isRun ? 'warn' : 'ok'}>{isRun ? `Will ${verb.toLowerCase()} files` : 'Preview only'}</StatusChip>
        </header>
        {state.status === 'loading' ? <p role="status" className="text-small text-text-3">Scanning the input folder…</p> : null}
        {state.status === 'error' ? <p role="alert" className="rounded-xl bg-bad-soft px-4 py-3 text-small text-bad">{state.message}</p> : null}
        {plan ? (
          <>
            <div className="grid grid-cols-4 gap-3">
              <Stat value={String(plan.totalFiles)} label={plan.totalFiles === 1 ? 'clip' : 'clips'} />
              <Stat value={String(plan.folderCount)} label={plan.folderCount === 1 ? 'folder' : 'folders'} />
              <Stat value={formatBytes(plan.totalBytes)} label={`to ${verb.toLowerCase()}`} />
              <Stat value={String(plan.leftInPlace)} label="left in place" />
            </div>
            <ul className="flex min-h-0 flex-col overflow-y-auto">
              {plan.groups.map((group) => (
                <li key={group.path} className="flex flex-col gap-2 border-b border-line py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <Folder size={16} aria-hidden="true" className="text-primary" />
                      <span className="font-mono text-body font-semibold text-primary">{group.folder}</span>
                      {group.renamed ? <StatusChip tone="warn">{suffixAdded(group.folder)}</StatusChip> : null}
                    </div>
                    <span className="text-small font-medium text-text-2">{plural(group.count, 'clip')}</span>
                  </div>
                  <p className="break-all font-mono text-caption text-text-3">{group.path}</p>
                  <p className="font-mono text-caption leading-normal text-text-2">
                    {group.sample.join('  ')}
                    {group.count > group.sample.length ? `  +${group.count - group.sample.length} more` : ''}
                  </p>
                </li>
              ))}
            </ul>
            {plan.leftInPlace > 0 ? (
              <div className="flex flex-col gap-1.5 rounded-[14px] bg-fill-2 p-4">
                <p className="text-small font-semibold">
                  Left in place: {plan.unmatched} not matching the filters
                  {plan.notSelected > 0 ? `, ${plan.notSelected} not picked by random selection` : ''}
                </p>
                <p className="break-all font-mono text-caption leading-normal text-text-2">
                  {plan.leftSample.join('  ')}
                  {plan.leftInPlace > plan.leftSample.length ? `  +${plan.leftInPlace - plan.leftSample.length} more` : ''}
                </p>
              </div>
            ) : null}
            {plan.notes.map((note) => (
              <p key={note} className="flex items-start gap-2 text-caption leading-snug text-text-2">
                <Info size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-text-3" />
                {note}
              </p>
            ))}
          </>
        ) : null}
        {error ? <p role="alert" className="rounded-xl bg-bad-soft px-4 py-3 text-small text-bad">{error}</p> : null}
        <footer className="flex justify-end gap-2.5">
          <Button icon={<X size={15} aria-hidden="true" />} onClick={onClose}>{isRun ? 'Cancel' : 'Close'}</Button>
          {isRun ? (
            <Button
              variant="primary"
              icon={<Check size={15} aria-hidden="true" />}
              disabled={!plan || plan.totalFiles === 0 || confirming}
              onClick={onConfirm}
            >
              {confirming ? 'Starting…' : `${verb} ${plural(plan?.totalFiles ?? 0, 'clip')}`}
            </Button>
          ) : null}
        </footer>
      </div>
    </dialog>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-[14px] bg-fill-2 p-4">
      <span className="text-h2 font-bold tracking-[-0.4px]">{value}</span>
      <span className="text-caption font-medium text-text-2">{label}</span>
    </div>
  );
}
