import { useEffect, useMemo, useState } from 'react';
import { api } from './lib/api';
import type { Collector, PlanResult, Run, ScheduleDraft } from './lib/types';
import { useLoad } from './hooks/useLoad';
import { AppHeader } from './components/shell/AppHeader';
import { AppShell } from './components/shell/AppShell';
import { CollectorList } from './features/collectors/CollectorList';
import { RunHistory } from './features/runs/RunHistory';
import { SchedulePanel } from './features/schedule/SchedulePanel';
import { CollectorActions } from './features/collectors/CollectorActions';
import { NewCollectorDialog } from './features/collectors/NewCollectorDialog';
import { DeleteCollectorDialog } from './features/collectors/DeleteCollectorDialog';
import { EditCollectorScreen } from './features/editor/EditCollectorScreen';
import { PlanDialog, type PlanMode } from './features/transfer/PlanDialog';

const TABS = [
  { id: 'collection', label: 'Collection', enabled: true },
  { id: 'production', label: 'Production', enabled: false },
  { id: 'output', label: 'Output', enabled: false },
];

function draftFrom(collector: Collector): ScheduleDraft {
  const { enabled, kind, time, weekdays, dayOfMonth, cron } = collector.schedule;
  return { enabled, kind, time, weekdays, dayOfMonth, cron };
}

export default function App() {
  const collectors = useLoad(() => api.listCollectors(), []);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [localDraft, setLocalDraft] = useState<ScheduleDraft | null>(null);
  const [editing, setEditing] = useState(false);
  const [dialog, setDialog] = useState<{ mode: PlanMode; opened: number } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const list = collectors.state.status === 'ready' ? collectors.state.data : [];
  const selected = useMemo(() => list.find((c) => c.id === selectedId) ?? list[0] ?? null, [list, selectedId]);

  useEffect(() => {
    if (selected && selectedId !== selected.id) setSelectedId(selected.id);
  }, [selected, selectedId]);

  useEffect(() => {
    setLocalDraft(null);
    setSaveError(null);
  }, [selected?.id]);

  const runs = useLoad<Run[]>(selected ? () => api.listRuns(selected.id) : null, [selected?.id]);
  const plan = useLoad<PlanResult>(dialog && selected ? () => api.dryRun(selected.id) : null, [dialog?.opened, selected?.id]);
  const anyRunning = runs.state.status === 'ready' && runs.state.data.some((run) => run.status === 'running');

  useEffect(() => {
    if (!anyRunning) return;
    const timer = setInterval(runs.reload, 1500);
    return () => clearInterval(timer);
  }, [anyRunning, runs.reload]);

  const openDialog = (mode: PlanMode) => {
    setDialogError(null);
    setDialog({ mode, opened: Date.now() });
  };

  const confirmRun = async () => {
    if (!selected) return;
    setConfirming(true);
    setDialogError(null);
    try {
      await api.startRun(selected.id);
      setDialog(null);
      runs.reload();
    } catch (error) {
      setDialogError(error instanceof Error ? error.message : 'Could not start the run');
    } finally {
      setConfirming(false);
    }
  };

  const undoRun = async (runId: number) => {
    setActionError(null);
    try {
      await api.undoRun(runId);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not undo the run');
    }
    runs.reload();
  };

  const createCollector = async (name: string) => {
    setCreating(true);
    setCreateError(null);
    try {
      const created = await api.createCollector(name);
      setNewOpen(false);
      setSelectedId(created.id);
      collectors.reload();
      setEditing(true);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Could not create the collector');
    } finally {
      setCreating(false);
    }
  };

  const deleteCollector = async () => {
    if (!selected) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.deleteCollector(selected.id);
      setDeleteOpen(false);
      setEditing(false);
      setSelectedId(null);
      collectors.reload();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Could not delete the collector');
    } finally {
      setDeleting(false);
    }
  };

  const newDialog = newOpen ? (
    <NewCollectorDialog
      busy={creating}
      error={createError}
      onCreate={createCollector}
      onClose={() => {
        setNewOpen(false);
        setCreateError(null);
      }}
    />
  ) : null;

  const draft = localDraft ?? (selected ? draftFrom(selected) : null);

  const save = async () => {
    if (!selected || !draft) return;
    setSaving(true);
    setSaveError(null);
    try {
      await api.saveSchedule(selected.id, draft);
      setLocalDraft(null);
      collectors.reload();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save the schedule');
    } finally {
      setSaving(false);
    }
  };

  const toggleCollector = async (id: number, enabled: boolean) => {
    const target = list.find((c) => c.id === id);
    if (!target) return;
    try {
      await api.saveSchedule(id, { ...draftFrom(target), enabled });
      collectors.reload();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not change the schedule');
    }
  };

  const header = (
    <AppHeader
      tabs={TABS}
      activeTab="collection"
      status={<span className="flex items-center gap-2"><span className="size-2 rounded-full bg-ok" />Backend online · Tailscale</span>}
    />
  );

  if (editing && selected) {
    return (
      <div className="flex min-h-screen flex-col gap-4 p-4">
        {header}
        <EditCollectorScreen
          key={selected.id}
          collector={selected}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            collectors.reload();
          }}
          onDelete={() => {
            setDeleteError(null);
            setDeleteOpen(true);
          }}
        />
        {deleteOpen ? (
          <DeleteCollectorDialog
            collectorName={selected.name}
            busy={deleting}
            error={deleteError}
            onConfirm={deleteCollector}
            onClose={() => setDeleteOpen(false)}
          />
        ) : null}
        {newDialog}
      </div>
    );
  }

  return (
    <AppShell
      header={header}
      sidebar={
        <CollectorList
          state={collectors.state}
          selectedId={selected?.id ?? null}
          onSelect={setSelectedId}
          onToggle={toggleCollector}
          onRetry={collectors.reload}
          onNew={() => {
            setCreateError(null);
            setNewOpen(true);
          }}
        />
      }
      title={
        selected ? (
          <div className="flex flex-col gap-1">
            <h1 className="text-h1 font-bold tracking-[-0.6px]">{selected.name}</h1>
            <p className="text-small text-text-2">{selected.source} · {selected.transfer}</p>
          </div>
        ) : (
          <p className="text-body text-text-3">{collectors.state.status === 'error' ? 'Select a collector once the backend is reachable.' : 'Select a collector.'}</p>
        )
      }
      actions={
        selected ? (
          <CollectorActions
            onEdit={() => setEditing(true)}
            onDryRun={() => openDialog('dry')}
            onRun={() => openDialog('run')}
            runDisabled={anyRunning}
          />
        ) : null
      }
      main={
        selected ? (
          <div className="flex flex-1 flex-col gap-3">
            {actionError ? <p role="alert" className="rounded-xl bg-bad-soft px-4 py-3 text-small text-bad">{actionError}</p> : null}
            <RunHistory state={runs.state} onUndo={undoRun} />
            {newDialog}
            {dialog ? (
              <PlanDialog
                mode={dialog.mode}
                collectorName={selected.name}
                state={plan.state}
                confirming={confirming}
                error={dialogError}
                onConfirm={confirmRun}
                onClose={() => setDialog(null)}
              />
            ) : null}
          </div>
        ) : null
      }
      panel={
        selected && draft ? (
          <SchedulePanel
            draft={draft}
            summary={selected.schedule.summary}
            nextRun={selected.schedule.nextRun}
            saving={saving}
            error={saveError}
            onChange={setLocalDraft}
            onSave={save}
          />
        ) : null
      }
    />
  );
}
