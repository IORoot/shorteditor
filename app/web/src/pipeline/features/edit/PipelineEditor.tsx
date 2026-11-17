import { ArrowLeft, Check } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../../../shared/components/ui/Button';
import { useAction } from '../../../shared/hooks/useAction';
import { useDebouncedValue } from '../../../shared/hooks/useDebouncedValue';
import { useLoad } from '../../../shared/hooks/useLoad';
import type { PipelineApi } from '../../lib/api';
import { fromText, type Field } from '../../lib/schemaForm';
import { addStage, move, moveTo, setEnabled, setSetting, titleOf } from '../../lib/steps';
import type { PipelineDetail, StageInfo, StageStep, UsageItem } from '../../lib/types';
import { ChecksPanel } from './ChecksPanel';
import { RecentBatches } from './RecentBatches';
import { StageColumn, type Row } from './StageColumn';
import { StageLibraryDialog } from './StageLibraryDialog';
import { StageSettings } from './StageSettings';

type EditorApi = Pick<PipelineApi, 'get' | 'template' | 'stages' | 'check' | 'create' | 'save' | 'duplicate' | 'deletePipeline'>;

export interface PipelineEditorProps {
  api: EditorApi;
  /** null while making a new pipeline. */
  id: number | null;
  onOpen: (id: number) => void;
  onClose: () => void;
}

interface Loaded {
  detail: PipelineDetail | null;
  steps: StageStep[];
  library: StageInfo[];
}

export function PipelineEditor({ api, id, onOpen, onClose }: PipelineEditorProps) {
  const { state } = useLoad<Loaded>(async () => {
    const [library, detail, template] = await Promise.all([api.stages(), id === null ? null : api.get(id), id === null ? api.template() : null]);
    return { detail, steps: detail?.steps ?? template ?? [], library };
  }, [id]);
  if (state.status === 'loading') return <p role="status" className="text-small text-text-3">Loading the pipeline…</p>;
  if (state.status === 'error') return <p role="alert" className="break-words rounded-xl bg-bad-soft px-4 py-3 text-small text-bad">{state.message}</p>;
  const { detail, steps, library } = state.data;
  return <Editor api={api} id={id} detail={detail} initial={steps} library={library} onOpen={onOpen} onClose={onClose} />;
}

interface EditorProps {
  api: EditorApi;
  id: number | null;
  detail: PipelineDetail | null;
  initial: StageStep[];
  library: StageInfo[];
  onOpen: (id: number) => void;
  onClose: () => void;
}

function Editor({ api, id, detail, initial, library, onOpen, onClose }: EditorProps) {
  const counter = useRef(0);
  const makeRows = (steps: StageStep[]): Row[] => steps.map((step) => ({ uid: ++counter.current, step }));
  const [rows, setRows] = useState<Row[]>(() => makeRows(initial));
  const [name, setName] = useState(detail?.name ?? '');
  const [description, setDescription] = useState(detail?.description ?? '');
  const [selected, setSelected] = useState<number | null>(rows[0]?.uid ?? null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, { text: string; error: string | null }>>({});
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [checking, setChecking] = useState(true);
  const action = useAction();

  const steps = rows.map((row) => row.step);
  const stepsKey = JSON.stringify(steps);
  const settled = useDebouncedValue(stepsKey, 400);
  useEffect(() => {
    if (settled !== stepsKey) {
      setChecking(true);
      return;
    }
    let active = true;
    setChecking(true);
    api.check(JSON.parse(settled) as StageStep[]).then(
      (found) => active && (setErrors(found), setChecking(false)),
      (error: unknown) => active && (setErrors([error instanceof Error ? error.message : 'Could not check the order']), setChecking(false)),
    );
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled, stepsKey]);

  const update = (next: StageStep[]) => setRows((current) => next.map((step, i) => ({ uid: current[i].uid, step })));

  const index = rows.findIndex((row) => row.uid === selected);
  const current = index >= 0 ? rows[index] : null;
  const draftFor = (uid: number) => Object.fromEntries(Object.entries(drafts).filter(([key]) => key.startsWith(`${uid}.`)).map(([key, value]) => [key.slice(String(uid).length + 1), value]));
  const liveUids = new Set(rows.map((row) => row.uid));
  const badNumber = Object.entries(drafts).some(([key, draft]) => draft.error !== null && liveUids.has(Number(key.split('.')[0])));

  const onText = (field: Field, text: string) => {
    if (!current) return;
    const parsed = fromText(field, text);
    setDrafts((all) => ({ ...all, [`${current.uid}.${field.name}`]: { text, error: 'error' in parsed ? parsed.error : null } }));
    if ('value' in parsed) update(setSetting(steps, index, field.name, parsed.value));
  };
  const onValue = (field: Field, value: unknown) => {
    if (!current) return;
    setDrafts((all) => {
      const next = { ...all };
      delete next[`${current.uid}.${field.name}`];
      return next;
    });
    update(setSetting(steps, index, field.name, value));
  };

  const reorder = (direction: -1 | 1) => {
    const to = index + direction;
    if (to < 0 || to >= rows.length) return;
    setRows(move(rows, index, direction));
  };

  const add = (info: StageInfo) => {
    const uid = ++counter.current;
    setRows((all) => [...all, { uid, step: addStage(steps, info)[steps.length] }]);
    setSelected(uid);
    setLibraryOpen(false);
  };

  const remove = () => {
    if (!current) return;
    const uid = current.uid;
    setRows((all) => all.filter((row) => row.uid !== uid));
    setSelected(rows[index + 1]?.uid ?? rows[index - 1]?.uid ?? null);
  };

  const save = async () => {
    const body = { name, description, steps };
    if (await action.run(() => (id === null ? api.create(body) : api.save(id, body)))) onClose();
  };
  const duplicate = async () => {
    if (id === null) return;
    let copy = 0;
    if (await action.run(async () => { copy = (await api.duplicate(id)).id; })) onOpen(copy);
  };
  const destroy = async () => {
    if (id === null) return;
    setConfirmingDelete(false);
    if (await action.run(() => api.deletePipeline(id))) onClose();
  };

  const canSave = name.trim() !== '' && !checking && errors.length === 0 && !badNumber && steps.length > 0 && !action.busy;
  const usedBy: UsageItem[] = detail?.usedBy ?? [];
  const recentBatches: UsageItem[] = detail?.recentBatches ?? [];
  const problems = current ? Object.fromEntries(Object.entries(draftFor(current.uid)).flatMap(([key, d]) => (d.error ? [[key, d.error]] : []))) : {};
  const texts = current ? Object.fromEntries(Object.entries(draftFor(current.uid)).map(([key, d]) => [key, d.text])) : {};
  const lastTitle = rows.length > 0 ? titleOf(rows[rows.length - 1].step, library) : null;

  return (
    <main className="flex flex-1 items-start gap-4">
      <StageColumn rows={rows} library={library} selected={selected} onSelect={setSelected} onToggle={(index, on) => update(setEnabled(steps, index, on))} onMoveTo={(from, to) => setRows(moveTo(rows, from, to))} onAdd={() => setLibraryOpen(true)} />
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <button type="button" onClick={onClose} className="flex w-fit items-center gap-1 text-small text-text-2">
              <ArrowLeft size={14} aria-hidden="true" />Pipelines
            </button>
            <div className="flex items-center gap-3">
              <input aria-label="Name" value={name} maxLength={120} placeholder="Pipeline name" onChange={(event) => setName(event.target.value)} className="min-w-0 flex-1 bg-transparent text-[30px] font-bold tracking-[-0.6px] focus:outline-none" />
              {id !== null && detail?.enabled ? <span className="rounded-xl bg-ok-soft px-2.5 py-1 text-label font-semibold text-ok">Enabled</span> : null}
            </div>
            <input aria-label="Description" value={description} maxLength={300} placeholder="Description" onChange={(event) => setDescription(event.target.value)} className="bg-transparent text-small text-text-2 focus:outline-none" />
          </div>
          <div className="flex items-center gap-2">
            {id !== null ? <Button variant="ghost" disabled={action.busy} onClick={() => void duplicate()}>Duplicate</Button> : null}
            {id !== null ? <Button variant="ghost" disabled={action.busy} onClick={() => setConfirmingDelete(true)}>Delete</Button> : null}
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" icon={<Check size={15} aria-hidden="true" />} disabled={!canSave} onClick={() => void save()}>Save pipeline</Button>
          </div>
        </div>
        {confirmingDelete ? (
          <div role="alertdialog" aria-label="Delete pipeline" className="flex items-center gap-3 rounded-[16px] bg-bad-soft p-4">
            <p className="text-small font-semibold text-bad">Delete “{name}”? This cannot be undone.</p>
            <Button variant="danger" disabled={action.busy} onClick={() => void destroy()}>Delete pipeline</Button>
            <Button onClick={() => setConfirmingDelete(false)}>Keep it</Button>
          </div>
        ) : null}
        {action.error ? <p role="alert" className="break-words rounded-xl bg-bad-soft px-4 py-3 text-small text-bad">{action.error}</p> : null}
        {current ? (
          <StageSettings
            step={current.step}
            info={library.find((info) => info.key === current.step.key)}
            position={index + 1}
            total={rows.length}
            drafts={texts}
            problems={problems}
            onText={onText}
            onValue={onValue}
            onToggle={(on) => update(setEnabled(steps, index, on))}
            onMove={reorder}
            onRemove={remove}
          />
        ) : <p className="text-body text-text-3">Add a stage to begin.</p>}
        <RecentBatches batches={recentBatches} />
      </div>
      <ChecksPanel errors={errors} checking={checking} usedBy={usedBy} />
      {libraryOpen ? <StageLibraryDialog library={library} after={lastTitle} onPick={add} onClose={() => setLibraryOpen(false)} /> : null}
    </main>
  );
}
