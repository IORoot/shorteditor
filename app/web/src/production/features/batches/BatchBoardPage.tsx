import { ArrowLeft, CheckSquare, Pencil, Play } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../../shared/components/ui/Button';
import { Toggle } from '../../../shared/components/ui/Toggle';
import { useAction } from '../../../shared/hooks/useAction';
import { useLoad } from '../../../shared/hooks/useLoad';
import { cardHash, goTo } from '../../../shared/lib/route';
import { useBoard } from '../../hooks/useBoard';
import type { ProductionApi } from '../../lib/api';
import { ACTION_LABEL, batchCan } from '../../lib/actions';
import { subtitle } from '../../lib/board';
import type { ActionName, ActionResult, BatchUpdate, Defaults, PipelineChoice } from '../../lib/types';
import { Board } from '../board/Board';
import { Breadcrumbs } from '../shared/Breadcrumbs';
import { fsApi } from '../../../shared/lib/fsApi';
import type { BrowseResult } from '../../../shared/lib/types';
import { EditBatchDialog } from './EditBatchDialog';
import { ActionButtons, ChosenBar, ConfirmDialog, Outcome } from '../actions/ActionBar';

export interface BatchBoardPageProps {
  api: Pick<ProductionApi, 'cards' | 'batchDetail' | 'runAgain' | 'updateBatch' | 'defaults' | 'pipelines' | 'batchActions' | 'cardActions'>;
  batchId: number;
  onBack: () => void;
  browse?: (path?: string) => Promise<BrowseResult>;
}

// Without the server's defaults the dialog still works: an empty output folder keeps the current one.
const NO_DEFAULTS: Defaults = { outputRoot: '', workers: [] };
const NO_PIPELINES: PipelineChoice[] = [];

/** Actions a batch can take from its own page. Run again and delete have their own buttons. */
const BATCH_ACTIONS: ActionName[] = ['pause', 'resume', 'stop'];

/** One batch's board: its cards in Queued, Running, Review and Approved, with the batch's own actions and card selection. */
export function BatchBoardPage({ api, batchId, onBack, browse = (path) => fsApi.browse(path) }: BatchBoardPageProps) {
  const board = useBoard(api);
  const detail = useLoad(() => api.batchDetail(batchId), [batchId]);
  const run = useAction();
  const save = useAction();
  const act = useAction();
  const auto = useAction();
  const defaults = useLoad(() => api.defaults(), []);
  const pipelines = useLoad(() => api.pipelines(), []);
  const [editing, setEditing] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [chosen, setChosen] = useState<number[]>([]);
  const [results, setResults] = useState<ActionResult[] | null>(null);
  const [confirm, setConfirm] = useState<'batch' | 'cards' | null>(null);

  const batch = detail.state.status === 'ready' ? detail.state.data.batch : null;
  const cards = (board.state.status === 'ready' ? board.state.data : []).filter((card) => card.batchId === batchId);
  const statuses = cards.map((card) => card.status);
  const busy = statuses.some((status) => status === 'queued' || status === 'running');
  const chosenSet = new Set(chosen.filter((id) => cards.some((card) => card.passId === id)));

  const startEdit = () => {
    save.clear();
    setEditing(true);
  };
  const saveEdit = async (patch: BatchUpdate) => {
    if (await save.run(() => api.updateBatch(batchId, patch))) {
      setEditing(false);
      detail.reload();
      board.reload();
    }
  };
  const runAgain = async () => {
    if (await run.run(() => api.runAgain(batchId))) {
      board.reload();
      detail.reload();
    }
  };
  const setAutoRun = async (on: boolean) => {
    if (await auto.run(() => api.updateBatch(batchId, { autoRun: on }))) {
      detail.reload();
      board.reload();
    }
  };
  const toggleChoosing = () => {
    setChoosing(!choosing);
    setChosen([]);
    setResults(null);
    act.clear();
  };
  const openCard = (cardPassId: number) => {
    if (choosing) {
      setChosen((ids) => (ids.includes(cardPassId) ? ids.filter((id) => id !== cardPassId) : [...ids, cardPassId]));
      return;
    }
    goTo(cardHash(cardPassId));
  };

  // A batch action applies to the batch; a card action to the chosen cards. Delete always asks first.
  const actOnBatch = async (action: ActionName) => {
    if (action === 'delete') {
      act.clear();
      setConfirm('batch');
      return;
    }
    setResults(null);
    const sent = await act.run(async () => {
      const reply = await api.batchActions([batchId], action);
      setResults(reply.results);
      if (!reply.results[0]?.ok) throw new Error(reply.results[0]?.message ?? 'Could not do that');
    });
    if (sent) {
      board.reload();
      detail.reload();
    }
  };
  const actOnCards = async (action: ActionName) => {
    if (action === 'delete') {
      act.clear();
      setConfirm('cards');
      return;
    }
    setResults(null);
    const ids = [...chosenSet];
    const sent = await act.run(async () => setResults((await api.cardActions(ids, action)).results));
    if (sent) board.reload();
  };
  const deleteBatch = async () => {
    const sent = await act.run(async () => {
      const reply = await api.batchActions([batchId], 'delete');
      if (!reply.results[0]?.ok) throw new Error(reply.results[0]?.message ?? 'Could not delete the batch');
    });
    if (sent) onBack();
  };
  const deleteCards = async () => {
    const ids = [...chosenSet];
    const sent = await act.run(async () => setResults((await api.cardActions(ids, 'delete')).results));
    if (sent) {
      setConfirm(null);
      setChosen([]);
      board.reload();
    }
  };

  if (detail.state.status === 'error') {
    return (
      <main aria-label="Batch" className="flex flex-col items-start gap-4 px-2">
        <Button icon={<ArrowLeft size={15} aria-hidden="true" />} onClick={onBack}>All batches</Button>
        <p role="alert" className="text-small text-bad">{detail.state.message}</p>
      </main>
    );
  }

  const batchActions = BATCH_ACTIONS.filter((action) => batchCan(statuses, action));
  return (
    <main aria-label="Batch" className="flex flex-1 flex-col gap-5 px-2">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <Breadcrumbs crumbs={[{ label: 'Production', onOpen: onBack }, { label: batch?.name ?? 'Batch' }]} />
          <h1 className="text-h1 font-bold tracking-[-0.6px]">{batch?.name ?? 'Batch'}</h1>
          <p className="text-small text-text-2">{board.state.status === 'ready' ? subtitle(cards) : ' '}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2.5">
          <Button icon={<CheckSquare size={15} aria-hidden="true" />} onClick={toggleChoosing} disabled={cards.length === 0}>{choosing ? 'Done' : 'Select cards'}</Button>
          <label className="flex items-center gap-2 text-small font-semibold text-text-2">
            <Toggle label="Auto run" checked={batch?.autoRun ?? false} disabled={!batch || auto.busy} onChange={(on) => void setAutoRun(on)} />
            Auto run
          </label>
          <Button icon={<Pencil size={15} aria-hidden="true" />} onClick={startEdit} disabled={!batch}>Edit</Button>
          <Button variant="primary" icon={<Play size={15} aria-hidden="true" />} onClick={runAgain} disabled={run.busy || busy || cards.length === 0}>
            {run.busy ? 'Starting…' : 'Run again'}
          </Button>
          {batchActions.length > 0 ? <ActionButtons actions={batchActions} busy={act.busy} onAct={actOnBatch} /> : null}
          {cards.length > 0 ? <Button variant="danger" disabled={act.busy || busy} onClick={() => actOnBatch('delete')}>{ACTION_LABEL.delete}</Button> : null}
        </div>
      </div>
      {run.error ? <p role="alert" className="rounded-xl bg-bad-soft px-4 py-3 text-small text-bad">{run.error}</p> : null}
      {auto.error ? <p role="alert" className="rounded-xl bg-bad-soft px-4 py-3 text-small text-bad">{auto.error}</p> : null}
      {!choosing && act.error ? <p role="alert" className="rounded-xl bg-bad-soft px-4 py-3 text-small text-bad">{act.error}</p> : null}
      {!choosing ? <Outcome results={results} /> : null}
      {editing && batch ? (
        <EditBatchDialog
          batch={batch}
          defaults={defaults.state.status === 'ready' ? defaults.state.data : NO_DEFAULTS}
          pipelines={pipelines.state.status === 'ready' ? pipelines.state.data : NO_PIPELINES}
          browse={browse}
          busy={save.busy}
          error={save.error}
          onSave={(patch) => void saveEdit(patch)}
          onClose={() => setEditing(false)}
        />
      ) : null}
      {choosing ? (
        <div className="flex flex-col gap-2">
          <ChosenBar label="Chosen cards" noun="cards" count={chosenSet.size} busy={act.busy} onAct={actOnCards} onClear={() => { setChosen([]); setResults(null); }} />
          {act.error ? <p role="alert" className="rounded-xl bg-bad-soft px-4 py-3 text-small text-bad">{act.error}</p> : null}
          <Outcome results={results} />
        </div>
      ) : null}
      {board.state.status === 'loading' ? <p role="status" className="text-small text-text-3">Loading the batch…</p> : null}
      {board.state.status === 'error' ? <p role="alert" className="rounded-xl bg-bad-soft px-4 py-3 text-small text-bad">{board.state.message}</p> : null}
      {board.state.status === 'ready' && cards.length === 0 ? <p className="text-body text-text-3">This batch has no cards.</p> : null}
      {cards.length > 0 ? <Board cards={cards} selectedBatchId={null} onOpen={(card) => openCard(card.passId)} chosen={choosing ? chosenSet : undefined} /> : null}
      {confirm === 'batch' ? (
        <ConfirmDialog
          title={`Delete “${batch?.name ?? 'this batch'}”?`}
          body="The batch leaves the board with its cards and logs. The output videos on disk are kept. This can’t be undone."
          confirmLabel="Delete batch"
          busy={act.busy}
          error={act.error}
          onConfirm={deleteBatch}
          onClose={() => { act.clear(); setConfirm(null); }}
        />
      ) : null}
      {confirm === 'cards' ? (
        <ConfirmDialog
          title={`Delete ${chosenSet.size} ${chosenSet.size === 1 ? 'card' : 'cards'}?`}
          body="They leave the board with their logs. The output videos on disk are kept. This can’t be undone."
          confirmLabel={`Delete ${chosenSet.size === 1 ? 'card' : `${chosenSet.size} cards`}`}
          busy={act.busy}
          error={act.error}
          onConfirm={deleteCards}
          onClose={() => { act.clear(); setConfirm(null); }}
        />
      ) : null}
    </main>
  );
}
