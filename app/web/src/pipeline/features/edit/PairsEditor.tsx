import { Plus, X } from 'lucide-react';
import { useRef, useState } from 'react';

interface Row {
  id: number;
  name: string;
  text: string;
}

export interface PairsEditorProps {
  label: string;
  help: string;
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}

const INPUT = 'input input-sm rounded-[10px] border-0 bg-fill-2 px-3 font-mono text-caption focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary/40';

/** Name and value rows for settings such as variables. Rows with no name yet are kept on screen but not saved. */
export function PairsEditor({ label, help, value, onChange }: PairsEditorProps) {
  const [rows, setRows] = useState<Row[]>(() => Object.entries(value).map(([name, text], id) => ({ id, name, text })));
  const counter = useRef(rows.length);

  const commit = (next: Row[]) => {
    setRows(next);
    onChange(Object.fromEntries(next.filter((row) => row.name.trim() !== '').map((row) => [row.name.trim(), row.text])));
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-sans text-caption font-semibold text-text-2">{label}</span>
      {rows.map((row, index) => (
        <div key={row.id} className="flex items-center gap-2">
          <input aria-label={`Name ${index + 1}`} value={row.name} placeholder="NAME" onChange={(event) => commit(rows.map((r) => (r.id === row.id ? { ...r, name: event.target.value } : r)))} className={`${INPUT} w-40`} />
          <span className="text-text-3">=</span>
          <input aria-label={`Value ${index + 1}`} value={row.text} onChange={(event) => commit(rows.map((r) => (r.id === row.id ? { ...r, text: event.target.value } : r)))} className={`${INPUT} min-w-0 flex-1`} />
          <button type="button" aria-label={`Remove ${row.name || `variable ${index + 1}`}`} onClick={() => commit(rows.filter((r) => r.id !== row.id))} className="grid size-8 shrink-0 place-items-center rounded-lg text-text-2 hover:bg-fill-2">
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => commit([...rows, { id: ++counter.current, name: '', text: '' }])} className="flex w-fit items-center gap-1.5 rounded-lg px-2 py-1 text-small font-medium text-primary hover:bg-fill-2">
        <Plus size={14} aria-hidden="true" />
        Add variable
      </button>
      <span className="text-caption text-text-3">{help}</span>
    </div>
  );
}
