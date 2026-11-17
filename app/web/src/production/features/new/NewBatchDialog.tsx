import { useEffect, useRef, useState } from 'react';
import { Button } from '../../../shared/components/ui/Button';
import { FormField } from '../../../shared/components/ui/FormField';
import type { BrowseResult } from '../../../shared/lib/types';
import { defaultForm, isValid, secondsHint, sizeHint, type Fit, type NewBatchForm, type OrderBy } from '../../lib/presets';
import type { Defaults } from '../../lib/types';
import { FolderField } from './FolderField';

export interface NewBatchDialogProps {
  defaults: Defaults;
  busy: boolean;
  error: string | null;
  onCreate: (form: NewBatchForm) => void;
  onClose: () => void;
  browse: (path?: string) => Promise<BrowseResult>;
}

const ORDER: { value: OrderBy; label: string }[] = [
  { value: 'capture_time', label: 'Capture time' },
  { value: 'created', label: 'Created date' },
  { value: 'name', label: 'Name' },
  { value: 'duration', label: 'Duration' },
  { value: 'random', label: 'Random' },
];

const FIT: { value: Fit; label: string }[] = [
  { value: 'crop', label: 'Crop to centre' },
  { value: 'blur', label: 'Blurred background' },
];

function Select<T extends string>({ label, value, onChange, children }: { label: string; value: T; onChange: (value: T) => void; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-caption font-semibold text-text-2">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="select select-sm w-full rounded-[10px] border-0 bg-fill-2 text-small font-medium focus:outline-none focus:ring-2 focus:ring-primary/40"
      >
        {children}
      </select>
    </label>
  );
}

export function NewBatchDialog({ defaults, busy, error, onCreate, onClose, browse }: NewBatchDialogProps) {
  const [form, setForm] = useState<NewBatchForm>(defaultForm);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // with the folder picker open, Escape belongs to the picker
      if (event.key === 'Escape' && !document.querySelector('dialog[aria-label="Choose a folder"]')) closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  const set = <K extends keyof NewBatchForm>(key: K, value: NewBatchForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  return (
    <dialog open aria-label="New batch" className="modal modal-open">
      <div className="modal-box flex max-h-[90vh] w-[560px] max-w-full flex-col gap-5 overflow-y-auto rounded-3xl bg-surface p-7">
        <h2 className="text-h3 font-semibold">New batch</h2>
        <FormField label="Name" autoFocus placeholder="e.g. Coach Saturdays – 14 Nov" value={form.name} onChange={(event) => set('name', event.target.value)} />
        <FolderField label="Input folder" value={form.inputFolder} onChange={(value) => set('inputFolder', value)} browse={browse} />
        <Select label="Pipeline" value="join" onChange={() => undefined}>
          <option value="join">Join clips</option>
          <option value="action" disabled>Action clips (coming with AI detect)</option>
        </Select>
        <div className="grid grid-cols-2 gap-4">
          <Select label="Order clips by" value={form.orderBy} onChange={(value) => set('orderBy', value)}>
            {ORDER.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
          <Select label="Fit different shapes" value={form.fit} onChange={(value) => set('fit', value)}>
            {FIT.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
          <FormField label="Max length (seconds)" inputMode="decimal" error={secondsHint(form.maxSeconds) ?? undefined} value={form.maxSeconds} onChange={(event) => set('maxSeconds', event.target.value)} />
          <FormField label="Max size (MB)" inputMode="decimal" error={sizeHint(form.maxSizeMb) ?? undefined} value={form.maxSizeMb} onChange={(event) => set('maxSizeMb', event.target.value)} />
        </div>
        <Select label="Run on" value={form.runOn} onChange={(value) => set('runOn', value)}>
          <option value="any">Any worker</option>
          {defaults.workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.label}</option>)}
        </Select>
        <FolderField label="Output folder" value={form.outputRoot} onChange={(value) => set('outputRoot', value)} browse={browse} placeholder={defaults.outputRoot} />
        <p className="text-small text-text-2">Leave the output folder empty to use the default. It must be new or empty, and separate from the input folder.</p>
        {error ? <p role="alert" className="break-words rounded-xl bg-bad-soft px-4 py-3 text-small text-bad">{error}</p> : null}
        <div className="flex justify-end gap-2.5">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={busy || !isValid(form)} onClick={() => onCreate(form)}>
            {busy ? 'Creating…' : 'Create batch'}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
