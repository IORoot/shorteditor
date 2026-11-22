import { Button } from '../../../shared/components/ui/Button';

export interface DeleteBatchesDialogProps {
  count: number;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

export function DeleteBatchesDialog({ count, busy, error, onConfirm, onClose }: DeleteBatchesDialogProps) {
  const many = count !== 1;
  return (
    <dialog open aria-label="Delete batches" className="modal modal-open">
      <div className="modal-box flex w-[480px] max-w-full flex-col gap-5 rounded-3xl bg-surface p-7">
        <h2 className="text-h3 font-semibold">Delete {count} {many ? 'batches' : 'batch'}?</h2>
        <p className="text-small text-text-2">
          {many ? 'They' : 'It'} leave{many ? '' : 's'} the board with {many ? 'their' : 'its'} passes and logs. Their output folders on disk are deleted too. This can’t be undone.
        </p>
        {error ? <p role="alert" className="rounded-xl bg-bad-soft px-4 py-3 text-small text-bad">{error}</p> : null}
        <div className="flex justify-end gap-2.5">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger" disabled={busy} onClick={onConfirm}>
            {busy ? 'Deleting…' : `Delete ${count === 1 ? 'batch' : `${count} batches`}`}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
