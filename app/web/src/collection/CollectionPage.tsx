import { useEffect, useMemo, useState } from 'react';
import { api } from './lib/api';
import type { Collector, PlanResult, Run, ScheduleDraft } from './lib/types';
import { useLoad } from '../shared/hooks/useLoad';
import { AppShell } from '../shared/components/shell/AppShell';
import { CollectorList } from './features/collectors/CollectorList';
import { RunHistory } from './features/runs/RunHistory';
import { SchedulePanel } from './features/schedule/SchedulePanel';
import { CollectorActions } from './features/collectors/CollectorActions';
import { NewCollectorDialog } from './features/collectors/NewCollectorDialog';
import { DeleteCollectorDialog } from './features/collectors/DeleteCollectorDialog';
import { EditCollectorScreen } from './features/editor/EditCollectorScreen';
import { PlanDialog, type PlanMode } from './features/transfer/PlanDialog';

function draftFrom(collector: Collector): ScheduleDraft {
  const { enabled, kind, time, weekdays, dayOfMonth, cron, mode, pollSeconds, settleSeconds, maxFiles } = collector.schedule;
  return { enabled, kind, time, weekdays, dayOfMonth, cron, mode, pollSeconds, settleSeconds, maxFiles };
}

export interface CollectionPageProps {
  /** False while another section is on screen: the page stays mounted but stops refreshing. */
  active?: boolean;
}

export function CollectionPage({ active = true }: CollectionPageProps) {
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
  // under Auto-collect, how many matching clips the source already holds: the first run will take them
  const draftMode = (localDraft ?? (selected ? draftFrom(selected) : null))?.mode;
  const waiting = useLoad<PlanResult>(selected && draftMode === 'auto' ? () => api.dryRun(selected.id) : null, [selected?.id, draftMode]);
  const anyRunning = runs.state.status === 'ready' && runs.state.data.some((run) => run.status === 'running');

  useEffect(() => {
    if (!anyRunning || !active) return;
    const timer = setInterval(runs.reload, 1500);
    return () => clearInterval(timer);
  }, [anyRunning, active, runs.reload]);

  // an auto-collecting collector looks at its source on its own: keep "last checked" and any run it made fresh
  const watching = list.some((c) => c.active && c.schedule.mode === 'auto');
  useEffect(() => {
    if (!watching || !active) return;
    const timer = setInterval(() => {
      collectors.reload();
      runs.reload();
    }, 15000);
    return () => clearInterval(timer);
  }, [watching, active, collectors.reload, runs.reload]);

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

  const duplicateCollector = async () => {
    if (!selected) return;
    setActionError(null);
    try {
      const copy = await api.duplicateCollector(selected.id);
      setSelectedId(copy.id);
      collectors.reload();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not duplicate the collector');
    }
  };

  const toggleCollector = async (id: number, active: boolean) => {
    try {
      await api.setActive(id, active);
      collectors.reload();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not turn the collector on or off');
    }
  };

  if (editing && selected) {
    return (
      <div className="flex flex-1 flex-col gap-4">
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
            onDuplicate={duplicateCollector}
            onDryRun={() => openDialog('dry')}
            onRun={() => openDialog('run')}
            runDisabled={anyRunning || !selected.active}
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
            waiting={waiting.state.status === 'ready' ? waiting.state.data.totalFiles + (waiting.state.data.heldBack ?? 0) : null}
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
