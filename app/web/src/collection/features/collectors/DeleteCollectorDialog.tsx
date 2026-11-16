import { Button } from '../../../components/ui/Button';

export interface DeleteCollectorDialogProps {
  collectorName: string;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

export function DeleteCollectorDialog({ collectorName, busy, error, onConfirm, onClose }: DeleteCollectorDialogProps) {
  return (
    <dialog open aria-label="Delete collector" className="modal modal-open">
      <div className="modal-box flex w-[480px] max-w-full flex-col gap-5 rounded-3xl bg-surface p-7">
        <h2 className="text-h3 font-semibold">Delete {collectorName}?</h2>
        <p className="text-small text-text-2">
          This removes the collector, its schedule and its run history. Files already moved stay where they are. This can’t be undone.
        </p>
        {error ? <p role="alert" className="rounded-xl bg-bad-soft px-4 py-3 text-small text-bad">{error}</p> : null}
        <div className="flex justify-end gap-2.5">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger" disabled={busy} onClick={onConfirm}>
            {busy ? 'Deleting…' : 'Delete collector'}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
