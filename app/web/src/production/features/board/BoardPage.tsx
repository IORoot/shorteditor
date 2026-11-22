import { CheckSquare, Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../../../shared/components/ui/Button';
import { useLoad } from '../../../shared/hooks/useLoad';
import { useBatchList } from '../../hooks/useBatchList';
import { fsApi } from '../../../shared/lib/fsApi';
import type { BrowseResult } from '../../../shared/lib/types';
import { useAction } from '../../../shared/hooks/useAction';
import type { ProductionApi } from '../../lib/api';
import { listSubtitle, type BatchFilter } from '../../lib/batchList';
import { toBulkRequest, toWatchRequest, type ManyForm } from '../../lib/presets';
import type { ActionName, ActionResult, Batch, BatchListItem, BatchUpdate, Defaults, PipelineChoice } from '../../lib/types';
import { BatchList } from '../batches/BatchList';
import { NewBatchDialog } from '../new/NewBatchDialog';
import { EditBatchDialog } from '../batches/EditBatchDialog';
import { DeleteBatchesDialog } from './DeleteBatchesDialog';
import { ChosenBar, Outcome } from '../actions/ActionBar';

export interface BoardPageProps {
  api: Pick<ProductionApi, 'batchList' | 'batchDetail' | 'updateBatch' | 'defaults' | 'pipelines' | 'createBatches' | 'previewFolders' | 'createWatch' | 'deleteBatches' | 'batchActions'>;
  browse?: (path?: string) => Promise<BrowseResult>;
  /** Opens the Pipeline tab from the New batch dialog. */
  onManagePipelines?: () => void;
  /** Opens one batch's board. */
  onOpenBatch?: (batchId: number) => void;
}

// Without the server's defaults the form still works: an empty output folder means "use the server's".
const NO_DEFAULTS: Defaults = { outputRoot: '', workers: [] };
const NO_PIPELINES: PipelineChoice[] = [];

export function BoardPage({ api, browse = (path) => fsApi.browse(path), onManagePipelines, onOpenBatch }: BoardPageProps) {
  const list = useBatchList(api);
  const create = useAction();
  const defaults = useLoad(() => api.defaults(), []);
  const pipelines = useLoad(() => api.pipelines(), []);  // reloaded each time the board opens, so a new pipeline shows up
  const [newOpen, setNewOpen] = useState(false);
  const newButton = useRef<HTMLButtonElement>(null);
  const items: BatchListItem[] = list.state.status === 'ready' ? list.state.data : [];
  const remove = useAction();
  const [choosing, setChoosing] = useState(false);
  const [chosen, setChosen] = useState<number[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [filter, setFilter] = useState<BatchFilter>('all');
  const bulk = useAction();
  const edit = useAction();
  const [editBatch, setEditBatch] = useState<Batch | null>(null);
  const [results, setResults] = useState<ActionResult[] | null>(null);
  const chosenSet = useMemo(() => new Set(chosen.filter((id) => items.some((item) => item.id === id))), [chosen, items]);

  const toggleChoosing = () => {
    remove.clear();
    setChosen([]);
    setChoosing(!choosing);
  };
  const openOrChoose = (item: BatchListItem) => {
    if (!choosing) {
      onOpenBatch?.(item.id);
      return;
    }
    setChosen((ids) => (ids.includes(item.id) ? ids.filter((id) => id !== item.id) : [...ids, item.id]));
  };
  // Pause, resume, stop and run again go to every chosen batch at once; delete asks first.
  // The batch's whole settings come from the server, so the dialog starts from what is saved.
  const openEdit = async (item: BatchListItem) => {
    bulk.clear();
    edit.clear();
    await bulk.run(async () => setEditBatch((await api.batchDetail(item.id)).batch));
  };
  const saveEdit = async (patch: BatchUpdate) => {
    if (!editBatch) return;
    if (await edit.run(() => api.updateBatch(editBatch.id, patch))) {
      setEditBatch(null);
      list.reload();
    }
  };
  // One batch, from its row's icons. Delete asks first, like the chosen-batches delete.
  const actOnRow = async (item: BatchListItem, action: ActionName) => {
    if (action === 'delete') {
      remove.clear();
      setChosen([item.id]);
      setConfirmOpen(true);
      return;
    }
    bulk.clear();
    const sent = await bulk.run(async () => {
      const reply = await api.batchActions([item.id], action);
      setResults(reply.results);
    });
    if (sent) list.reload();
  };
  const actOnChosen = async (action: ActionName) => {
    if (action === 'delete') {
      remove.clear();
      setConfirmOpen(true);
      return;
    }
    const ids = [...chosenSet];
    bulk.clear();
    const sent = await bulk.run(async () => {
      const reply = await api.batchActions(ids, action);
      setResults(reply.results);
    });
    if (sent) list.reload();
  };
  const deleteChosen = async () => {
    const ids = [...chosenSet];
    if (await remove.run(() => api.deleteBatches(ids))) {
      setConfirmOpen(false);
      setChoosing(false);
      setChosen([]);
      list.reload();
    }
  };
  const dialogWasOpen = useRef(false);
  useEffect(() => {
    // when the form closes, the cursor goes back to the button that opened it
    if (!newOpen && dialogWasOpen.current) newButton.current?.focus();
    dialogWasOpen.current = newOpen;
  }, [newOpen]);

  const openNew = () => {
    create.clear();
    if (defaults.state.status === 'error') defaults.reload(); // the server may have been restarting the first time
    setNewOpen(true);
  };
  const closeNew = () => {
    create.clear();
    setNewOpen(false);
  };
  const saveWatch = async (form: ManyForm) => {
    const saved = await create.run(() => api.createWatch(toWatchRequest(form, form.watchExisting)));
    if (!saved) return;
    list.reload(); // a new watch may have made batches straight away
    closeNew();
  };

  return (
    <main className="flex flex-1 flex-col gap-5 px-2">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-h1 font-bold tracking-[-0.6px]">Production</h1>
          <p className="text-small text-text-2">{list.state.status === 'ready' ? listSubtitle(items) : ' '}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <Button icon={<CheckSquare size={15} aria-hidden="true" />} onClick={toggleChoosing}>{choosing ? 'Done' : 'Select'}</Button>
          <Button
            variant="primary"
            icon={<Plus size={15} aria-hidden="true" />}
            onClick={openNew}
            ref={newButton}
          >
            New batch
          </Button>
        </div>
      </div>
      {list.staleError ? (
        <p role="alert" className="rounded-xl bg-warn-soft px-4 py-3 text-small text-warn">
          Showing the last list. Can’t refresh right now: {list.staleError}
        </p>
      ) : null}
      {list.state.status === 'loading' ? <p role="status" className="text-small text-text-3">Loading batches…</p> : null}
      {list.state.status === 'error' ? (
        <div className="flex flex-col items-start gap-3">
          <p role="alert" className="rounded-xl bg-bad-soft px-4 py-3 text-small text-bad">{list.state.message}</p>
          <Button onClick={list.reload}>Retry</Button>
        </div>
      ) : null}
      {list.state.status === 'ready' && items.length === 0 ? <p className="text-body text-text-3">No batches yet. Create one to start.</p> : null}
      {choosing ? (
        <div className="flex flex-col gap-2">
          <ChosenBar label="Chosen batches" noun="batches" count={chosenSet.size} busy={bulk.busy || remove.busy} onAct={actOnChosen} onClear={() => { setChosen([]); setResults(null); }} />
          {bulk.error ? <p role="alert" className="rounded-xl bg-bad-soft px-4 py-3 text-small text-bad">{bulk.error}</p> : null}
          <Outcome results={results} />
        </div>
      ) : null}
      {!choosing && bulk.error ? <p role="alert" className="rounded-xl bg-bad-soft px-4 py-3 text-small text-bad">{bulk.error}</p> : null}
      {!choosing ? <Outcome results={results} /> : null}
      {items.length > 0 ? <BatchList items={items} filter={filter} onFilter={setFilter} onOpen={openOrChoose} chosen={choosing ? chosenSet : undefined} onAct={actOnRow} onEdit={openEdit} busy={bulk.busy || remove.busy} /> : null}
      {confirmOpen ? (
        <DeleteBatchesDialog
          count={chosenSet.size}
          busy={remove.busy}
          error={remove.error}
          onConfirm={deleteChosen}
          onClose={() => {
            remove.clear();
            setConfirmOpen(false);
          }}
        />
      ) : null}
      {editBatch ? (
        <EditBatchDialog
          batch={editBatch}
          defaults={defaults.state.status === 'ready' ? defaults.state.data : NO_DEFAULTS}
          pipelines={pipelines.state.status === 'ready' ? pipelines.state.data : NO_PIPELINES}
          browse={browse}
          busy={edit.busy}
          error={edit.error}
          onSave={(patch) => void saveEdit(patch)}
          onClose={() => setEditBatch(null)}
        />
      ) : null}
      {newOpen ? (
        <NewBatchDialog
          defaults={defaults.state.status === 'ready' ? defaults.state.data : NO_DEFAULTS}
          pipelines={pipelines.state.status === 'ready' ? pipelines.state.data : NO_PIPELINES}
          onManagePipelines={onManagePipelines}
          busy={create.busy}
          error={create.error}
          browse={browse}
          previewFolders={(parent, pattern, root) => api.previewFolders(parent, pattern, root)}
          onClose={closeNew}
          onCreateMany={async (form) => {
            if (await create.run(() => api.createBatches(toBulkRequest(form)))) {
              closeNew();
              list.reload();
            }
          }}
          onSaveWatch={saveWatch}
        />
      ) : null}
    </main>
  );
}
