import { useState } from 'react';
import type { PipelineApi } from './lib/api';
import { PipelineList } from './features/list/PipelineList';
import { PipelineEditor } from './features/edit/PipelineEditor';

type View = { kind: 'list' } | { kind: 'edit'; id: number | null; stage?: number };

export interface PipelinePageProps {
  api: PipelineApi;
}

export function PipelinePage({ api }: PipelinePageProps) {
  const [view, setView] = useState<View>({ kind: 'list' });
  if (view.kind === 'edit') {
    return <PipelineEditor key={`${view.id ?? 'new'}-${view.stage ?? 0}`} api={api} id={view.id} stage={view.stage} onOpen={(id) => setView({ kind: 'edit', id })} onClose={() => setView({ kind: 'list' })} />;
  }
  return (
    <PipelineList
      api={api}
      onOpen={(id) => setView({ kind: 'edit', id })}
      onOpenStage={(id, stage) => setView({ kind: 'edit', id, stage })}
      onNew={() => setView({ kind: 'edit', id: null })}
    />
  );
}
