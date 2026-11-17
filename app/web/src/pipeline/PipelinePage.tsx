import { useState } from 'react';
import type { PipelineApi } from './lib/api';
import { PipelineList } from './features/list/PipelineList';
import { PipelineEditor } from './features/edit/PipelineEditor';

type View = { kind: 'list' } | { kind: 'edit'; id: number | null };

export interface PipelinePageProps {
  api: PipelineApi;
}

export function PipelinePage({ api }: PipelinePageProps) {
  const [view, setView] = useState<View>({ kind: 'list' });
  if (view.kind === 'edit') {
    return <PipelineEditor key={view.id ?? 'new'} api={api} id={view.id} onOpen={(id) => setView({ kind: 'edit', id })} onClose={() => setView({ kind: 'list' })} />;
  }
  return <PipelineList api={api} onOpen={(id) => setView({ kind: 'edit', id })} onNew={() => setView({ kind: 'edit', id: null })} />;
}
