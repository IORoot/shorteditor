import { Eye, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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
import { ReviewDrawer } from '../review/ReviewDrawer';
import { WatchesPanel } from '../watches/WatchesPanel';
import { Board } from './Board';

export interface BoardPageProps {
  api: Pick<ProductionApi, 'cards' | 'approve' | 'runAgain' | 'resolve' | 'outputUrl' | 'defaults' | 'pipelines' | 'createBatch' | 'createBatches' | 'previewFolders' | 'watches' | 'createWatch' | 'updateWatch' | 'setWatchEnabled' | 'checkWatch' | 'deleteWatch'>;
  browse?: (path?: string) => Promise<BrowseResult>;
  /** Opens the Pipeline tab from the New batch dialog. */
  onManagePipelines?: () => void;
}

// Without the server's defaults the form still works: an empty output folder means "use the server's".
const NO_DEFAULTS: Defaults = { outputRoot: '', workers: [] };
const NO_PIPELINES: PipelineChoice[] = [];

export function BoardPage({ api, browse = (path) => fsApi.browse(path), onManagePipelines }: BoardPageProps) {
  const board = useBoard(api);
  const action = useAction();
  const create = useAction();
  const defaults = useLoad(() => api.defaults(), []);
  const pipelines = useLoad(() => api.pipelines(), []);  // reloaded each time the board opens, so a new pipeline shows up
  const [newOpen, setNewOpen] = useState(false);
  const [watchesOpen, setWatchesOpen] = useState(false);
  const [watchTarget, setWatchTarget] = useState<WatchTarget | null>(null);
  const newButton = useRef<HTMLButtonElement>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const cards = board.state.status === 'ready' ? board.state.data : [];
  const opened = cards.find((card) => card.batchId === openId) ?? null;

  useEffect(() => {
    // the batch is gone from the list (for example after a restart with a different database)
    if (openId !== null && board.state.status === 'ready' && !opened) setOpenId(null);
  }, [openId, opened, board.state.status]);

  const returnFocusTo = useRef<number | null>(null);

  // Give focus back to the card the drawer was opened from, found again by id because a refresh may have moved it.
  useEffect(() => {
    if (openId === null && returnFocusTo.current !== null) {
      document.querySelector<HTMLElement>(`[data-batch-id="${returnFocusTo.current}"]`)?.focus();
      returnFocusTo.current = null;
    }
  }, [openId]);

  // An error about an earlier state of the batch does not belong to its new state.
  useEffect(() => {
    action.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened?.passId, opened?.status]);

  const open = (id: number | null) => {
    action.clear();
    if (id !== null) returnFocusTo.current = id;
    setOpenId(id);
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
    returnFocusTo.current = null; // focus goes to the form, not back to a card
    setOpenId(null);
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
  const act = async (fn: () => Promise<unknown>) => {
    if (await action.run(fn)) board.reload();
  };

  return (
    <main className="flex flex-1 flex-col gap-5 px-2">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-h1 font-bold tracking-[-0.6px]">Production</h1>
          <p className="text-small text-text-2">{board.state.status === 'ready' ? subtitle(cards) : ' '}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
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
      {cards.length > 0 ? <Board cards={cards} selectedBatchId={opened?.batchId ?? null} onOpen={(card) => open(card.batchId)} /> : null}
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
      {opened ? (
        <ReviewDrawer
          key={opened.batchId}
          card={opened}
          outputUrl={api.outputUrl(opened.passId)}
          busy={action.busy}
          error={action.error}
          onApprove={() => act(() => api.approve(opened.passId))}
          pipelines={pipelines.state.status === 'ready' ? pipelines.state.data : NO_PIPELINES}
          onRunAgain={(pipelineId) => act(() => api.runAgain(opened.batchId, pipelineId))}
          onResolve={(choice) => act(() => api.resolve(opened.passId, choice))}
          onClose={() => open(null)}
        />
      ) : null}
    </main>
  );
}
