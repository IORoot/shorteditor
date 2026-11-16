import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';

export interface NewCollectorDialogProps {
  busy: boolean;
  error: string | null;
  onCreate: (name: string) => void;
  onClose: () => void;
}

export function NewCollectorDialog({ busy, error, onCreate, onClose }: NewCollectorDialogProps) {
  const [name, setName] = useState('');
  return (
    <dialog open aria-label="New collector" className="modal modal-open">
      <div className="modal-box flex w-[480px] max-w-full flex-col gap-5 rounded-3xl bg-surface p-7">
        <h2 className="text-h3 font-semibold">New collector</h2>
        <FormField label="Name" placeholder="e.g. Coach Saturdays" value={name} onChange={(event) => setName(event.target.value)} />
        <p className="text-small text-text-2">Starts with the default settings. Set the input and output folders next.</p>
        {error ? <p role="alert" className="rounded-xl bg-bad-soft px-4 py-3 text-small text-bad">{error}</p> : null}
        <div className="flex justify-end gap-2.5">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={busy || name.trim() === ''} onClick={() => onCreate(name)}>
            {busy ? 'Creating…' : 'Create and edit'}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
