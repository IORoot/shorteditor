import { Button } from '../../../shared/components/ui/Button';
import { StatusChip } from '../../../shared/components/ui/StatusChip';
import { Toggle } from '../../../shared/components/ui/Toggle';
import { watchLabel, watchTone } from '../../lib/watches';
import type { WatchView } from '../../lib/types';

export interface WatchRowProps {
  watch: WatchView;
  /** What the last "Check now" said, until the panel closes. */
  result: string | null;
  checking: boolean;
  confirmingDelete: boolean;
  /** Another action is running: every button waits for it. */
  busy: boolean;
  onToggle: (enabled: boolean) => void;
  onCheck: () => void;
  onEdit: () => void;
  onAskDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
}

export function WatchRow({ watch, result, checking, confirmingDelete, busy, onToggle, onCheck, onEdit, onAskDelete, onConfirmDelete, onCancelDelete }: WatchRowProps) {
  return (
    <li aria-label={`Watch ${watch.name}`} className="flex flex-col gap-3 rounded-[16px] bg-fill-2 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <h3 className="min-w-0 truncate text-body font-semibold">{watch.name}</h3>
            <span className="shrink-0"><StatusChip tone={watchTone(watch)}>{watchLabel(watch)}</StatusChip></span>
          </div>
          <p title={watch.parentFolder} className="truncate font-mono text-caption text-text-2">{watch.parentFolder}</p>
          <p title={watch.pattern} className="truncate font-mono text-caption text-text-3">{watch.pattern}</p>
        </div>
        <Toggle label={`Watching ${watch.name}`} checked={watch.enabled} disabled={busy} onChange={onToggle} />
      </div>
      <p className="break-words text-small text-text-2">{watch.statusLine}</p>
      <div className="flex flex-wrap items-center gap-2">
        {confirmingDelete ? (
          <>
            <p className="text-small font-semibold">Delete this watch? Its batches stay.</p>
            <Button variant="danger" disabled={busy} onClick={onConfirmDelete}>Delete watch</Button>
            <Button disabled={busy} onClick={onCancelDelete}>Keep it</Button>
          </>
        ) : (
          <>
            <Button disabled={busy} onClick={onCheck}>{checking ? 'Checking…' : 'Check now'}</Button>
            <Button disabled={busy} onClick={onEdit}>Edit</Button>
            <Button variant="ghost" disabled={busy} onClick={onAskDelete}>Delete</Button>
            {result && !checking ? <span role="status" className="break-words text-small text-text-2">{result}</span> : null}
          </>
        )}
      </div>
    </li>
  );
}
