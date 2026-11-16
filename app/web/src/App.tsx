import { useEffect, useMemo, useState } from 'react';
import { api } from './lib/api';
import type { Collector, Run, ScheduleDraft } from './lib/types';
import { useLoad } from './hooks/useLoad';
import { AppHeader } from './components/shell/AppHeader';
import { AppShell } from './components/shell/AppShell';
import { CollectorList } from './features/collectors/CollectorList';
import { RunHistory } from './features/runs/RunHistory';
import { SchedulePanel } from './features/schedule/SchedulePanel';
import { Button } from './components/ui/Button';
import { EditCollectorScreen } from './features/editor/EditCollectorScreen';

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
        />
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
        />
      }
      main={
        selected ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-col gap-1">
                <h1 className="text-h1 font-bold tracking-[-0.6px]">{selected.name}</h1>
                <p className="text-small text-text-2">{selected.source} · {selected.transfer}</p>
              </div>
              <div className="flex gap-2.5">
                <Button onClick={() => setEditing(true)}>Edit</Button>
                <Button>Dry run</Button>
                <Button variant="primary">Run now</Button>
              </div>
            </div>
            <RunHistory state={runs.state} onUndo={() => undefined} />
          </>
        ) : (
          <p className="text-body text-text-3">{collectors.state.status === 'error' ? 'Select a collector once the backend is reachable.' : 'Select a collector.'}</p>
        )
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
