import { Check } from 'lucide-react';
import { Button } from '../../../shared/components/ui/Button';
import { ACTION_LABEL, ACTIONS, outcome } from '../../lib/actions';
import type { ActionName, ActionResult } from '../../lib/types';

/** Buttons for the actions that apply. Delete is red; the caller asks before it runs. */
export function ActionButtons({ actions, busy, onAct }: { actions: ActionName[]; busy: boolean; onAct: (action: ActionName) => void }) {
  return (
    <>
      {actions.map((action) => (
        <Button key={action} variant={action === 'delete' ? 'danger' : 'secondary'} disabled={busy} onClick={() => onAct(action)}>
          {ACTION_LABEL[action]}
        </Button>
      ))}
    </>
  );
}

export interface ChosenBarProps {
  label: string;
  count: number;
  busy: boolean;
  onAct: (action: ActionName) => void;
  onClear: () => void;
  /** What the chosen items are called, for the bar's hint. */
  noun: string;
}

/** The toolbar for chosen items: every action, applied to all of them. The server reports any that cannot. */
export function ChosenBar({ label, count, busy, onAct, onClear, noun }: ChosenBarProps) {
  return (
    <div role="toolbar" aria-label={label} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-accent-soft px-4 py-3">
      <p className="text-small font-semibold text-primary">{count === 0 ? `Click the ${noun} to choose them` : `${count} chosen`}</p>
      <div className="flex flex-wrap items-center gap-2.5">
        <Button variant="ghost" disabled={count === 0} onClick={onClear}>Clear</Button>
        {ACTIONS.map((action) => (
          <Button
            key={action}
            variant={action === 'delete' ? 'danger' : 'secondary'}
            disabled={count === 0 || busy}
            onClick={() => onAct(action)}
          >
            {action === 'delete' && count > 0 ? `Delete ${count}` : ACTION_LABEL[action]}
          </Button>
        ))}
      </div>
    </div>
  );
}

/** What a bulk action did: how many were done, and why the rest were not. */
export function Outcome({ results }: { results: ActionResult[] | null }) {
  if (!results) return null;
  const { done, problems } = outcome(results);
  return (
    <div role="status" className="flex flex-col gap-1 rounded-xl bg-fill-2 px-4 py-3 text-small text-text-2">
      <p className="flex items-center gap-1.5 font-semibold text-text">
        {done > 0 ? <Check size={14} aria-hidden="true" /> : null}
        {done} done{problems.length ? `, ${problems.length} not done` : ''}
      </p>
      {problems.map((problem, index) => <p key={index} className="break-words text-text-3">{problem}</p>)}
    </div>
  );
}

export interface ConfirmDialogProps {
  title: string;
  body: string;
  confirmLabel: string;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

/** Asks before something is deleted. Nothing is deleted until the confirm button is pressed. */
export function ConfirmDialog({ title, body, confirmLabel, busy, error, onConfirm, onClose }: ConfirmDialogProps) {
  return (
    <dialog open aria-label={title} className="modal modal-open">
      <div className="modal-box flex w-[480px] max-w-full flex-col gap-5 rounded-3xl bg-surface p-7">
        <h2 className="text-h3 font-semibold">{title}</h2>
        <p className="text-small text-text-2">{body}</p>
        {error ? <p role="alert" className="rounded-xl bg-bad-soft px-4 py-3 text-small text-bad">{error}</p> : null}
        <div className="flex justify-end gap-2.5">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger" disabled={busy} onClick={onConfirm}>{busy ? 'Working…' : confirmLabel}</Button>
        </div>
      </div>
    </dialog>
  );
}
