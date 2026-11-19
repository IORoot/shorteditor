import { CheckSquare, Eye, Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { goTo, reviewHash } from '../../../shared/lib/route';
import { Button } from '../../../shared/components/ui/Button';
import { useLoad } from '../../../shared/hooks/useLoad';
import { fsApi } from '../../../shared/lib/fsApi';
import type { BrowseResult } from '../../../shared/lib/types';
import { useAction } from '../../../shared/hooks/useAction';
import { useBoard } from '../../hooks/useBoard';
import type { ProductionApi } from '../../lib/api';
import { subtitle } from '../../lib/board';
import { toBulkRequest, toRequest, toWatchRequest, type ManyForm } from '../../lib/presets';
import type { Defaults, PipelineChoice } from '../../lib/types';
import { NewBatchDialog, type WatchTarget } from '../new/NewBatchDialog';
import { WatchesPanel } from '../watches/WatchesPanel';
import { Board } from './Board';
import { DeleteBatchesDialog } from './DeleteBatchesDialog';

export interface BoardPageProps {
  api: Pick<ProductionApi, 'cards' | 'approve' | 'runAgain' | 'resolve' | 'outputUrl' | 'defaults' | 'pipelines' | 'createBatch' | 'createBatches' | 'previewFolders' | 'watches' | 'createWatch' | 'updateWatch' | 'setWatchEnabled' | 'checkWatch' | 'deleteWatch' | 'batchDetail' | 'passLog' | 'deleteBatches'>;
  browse?: (path?: string) => Promise<BrowseResult>;
  /** Opens the Pipeline tab from the New batch dialog. */
  onManagePipelines?: () => void;
}

// Without the server's defaults the form still works: an empty output folder means "use the server's".
const NO_DEFAULTS: Defaults = { outputRoot: '', workers: [] };
const NO_PIPELINES: PipelineChoice[] = [];

export function BoardPage({ api, browse = (path) => fsApi.browse(path), onManagePipelines }: BoardPageProps) {
  const board = useBoard(api);
  const create = useAction();
  const defaults = useLoad(() => api.defaults(), []);
  const pipelines = useLoad(() => api.pipelines(), []);  // reloaded each time the board opens, so a new pipeline shows up
  const [newOpen, setNewOpen] = useState(false);
  const [watchesOpen, setWatchesOpen] = useState(false);
  const [watchTarget, setWatchTarget] = useState<WatchTarget | null>(null);
  const newButton = useRef<HTMLButtonElement>(null);
  const cards = board.state.status === 'ready' ? board.state.data : [];
  const remove = useAction();
  const [choosing, setChoosing] = useState(false);
  const [chosen, setChosen] = useState<number[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const chosenSet = useMemo(() => new Set(chosen.filter((id) => cards.some((card) => card.batchId === id))), [chosen, cards]);

  const toggleChoosing = () => {
    remove.clear();
    setChosen([]);
    setChoosing(!choosing);
  };
  const openOrChoose = (card: { batchId: number; status: string }) => {
    if (!choosing) {
      goTo(reviewHash(card.batchId));
      return;
    }
    if (card.status === 'running' || card.status === 'queued') return;
    setChosen((ids) => (ids.includes(card.batchId) ? ids.filter((id) => id !== card.batchId) : [...ids, card.batchId]));
  };
  const deleteChosen = async () => {
    const ids = [...chosenSet];
    if (await remove.run(() => api.deleteBatches(ids))) {
      setConfirmOpen(false);
      setChoosing(false);
      setChosen([]);
      board.reload();
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
    setWatchesOpen(false);
    setNewOpen(true);
  };
  const closeNew = () => {
    create.clear();
    setNewOpen(false);
  };
  const openWatches = () => {
    create.clear();
    setNewOpen(false);
    setWatchesOpen(true);
  };
  // the watch form goes back to the panel it was opened from
  const closeWatchTarget = () => {
    create.clear();
    setWatchTarget(null);
    setWatchesOpen(true);
  };
  const saveWatch = async (form: ManyForm, watchId: number | null) => {
    const enabled = watchTarget?.kind === 'edit' ? watchTarget.watch.enabled : true;
    const saved = await create.run(() => (watchId === null
      ? api.createWatch(toWatchRequest(form, form.watchExisting))
      : api.updateWatch(watchId, toWatchRequest(form, false, enabled))));
    if (!saved) return;
    board.reload(); // a new watch may have made batches straight away
    if (watchTarget) closeWatchTarget();
    else closeNew();
  };

  return (
    <main className="flex flex-1 flex-col gap-5 px-2">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-h1 font-bold tracking-[-0.6px]">Production</h1>
          <p className="text-small text-text-2">{board.state.status === 'ready' ? subtitle(cards) : ' '}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <Button icon={<CheckSquare size={15} aria-hidden="true" />} onClick={toggleChoosing}>{choosing ? 'Done' : 'Select'}</Button>
          <Button icon={<Eye size={15} aria-hidden="true" />} onClick={openWatches}>Watches</Button>
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
      {board.staleError ? (
        <p role="alert" className="rounded-xl bg-warn-soft px-4 py-3 text-small text-warn">
          Showing the last list. Can’t refresh right now: {board.staleError}
        </p>
      ) : null}
      {board.state.status === 'loading' ? <p role="status" className="text-small text-text-3">Loading batches…</p> : null}
      {board.state.status === 'error' ? (
        <div className="flex flex-col items-start gap-3">
          <p role="alert" className="rounded-xl bg-bad-soft px-4 py-3 text-small text-bad">{board.state.message}</p>
          <Button onClick={board.reload}>Retry</Button>
        </div>
      ) : null}
      {board.state.status === 'ready' && cards.length === 0 ? <p className="text-body text-text-3">No batches yet. Create one to start.</p> : null}
      {choosing ? (
        <div role="toolbar" aria-label="Chosen batches" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-accent-soft px-4 py-3">
          <p className="text-small font-semibold text-primary">
            {chosenSet.size === 0 ? 'Click the batches to delete' : `${chosenSet.size} chosen`}
          </p>
          <div className="flex items-center gap-2.5">
            <Button variant="ghost" disabled={chosenSet.size === 0} onClick={() => setChosen([])}>Clear</Button>
            <Button variant="danger" disabled={chosenSet.size === 0 || remove.busy} onClick={() => { remove.clear(); setConfirmOpen(true); }}>
              Delete {chosenSet.size > 0 ? chosenSet.size : ''}
            </Button>
          </div>
        </div>
      ) : null}
      {cards.length > 0 ? <Board cards={cards} selectedBatchId={null} onOpen={openOrChoose} chosen={choosing ? chosenSet : undefined} /> : null}
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
      {watchesOpen && !watchTarget ? (
        <WatchesPanel
          api={api}
          onAdd={() => {
            create.clear();
            setWatchesOpen(false);
            setWatchTarget({ kind: 'add' });
          }}
          onEdit={(watch) => {
            create.clear();
            setWatchesOpen(false);
            setWatchTarget({ kind: 'edit', watch });
          }}
          onChanged={board.reload}
          onClose={() => setWatchesOpen(false)}
        />
      ) : null}
      {newOpen || watchTarget ? (
        <NewBatchDialog
          defaults={defaults.state.status === 'ready' ? defaults.state.data : NO_DEFAULTS}
          pipelines={pipelines.state.status === 'ready' ? pipelines.state.data : NO_PIPELINES}
          onManagePipelines={onManagePipelines}
          busy={create.busy}
          error={create.error}
          browse={browse}
          previewFolders={(parent, pattern, root) => api.previewFolders(parent, pattern, root)}
          watchTarget={watchTarget ?? undefined}
          onClose={watchTarget ? closeWatchTarget : closeNew}
          onCreateMany={async (form) => {
            if (await create.run(() => api.createBatches(toBulkRequest(form)))) {
              closeNew();
              board.reload();
            }
          }}
          onCreate={async (form) => {
            if (await create.run(() => api.createBatch(toRequest(form)))) {
              closeNew();
              board.reload();
            }
          }}
          onSaveWatch={saveWatch}
        />
      ) : null}
    </main>
  );
}
