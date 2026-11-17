import { useState } from 'react';
import { AppHeader } from './shared/components/shell/AppHeader';
import { CollectionPage } from './collection/CollectionPage';
import { BoardPage } from './production/features/board/BoardPage';
import { productionApi } from './production/lib/api';
import { PipelinePage } from './pipeline/PipelinePage';
import { pipelineApi } from './pipeline/lib/api';

const TABS = [
  { id: 'collection', label: 'Collection', enabled: true },
  { id: 'pipeline', label: 'Pipeline', enabled: true },
  { id: 'production', label: 'Production', enabled: true },
  { id: 'output', label: 'Output', enabled: false },
];

type Section = 'collection' | 'pipeline' | 'production';

export default function App() {
  const [section, setSection] = useState<Section>('collection');
  const header = (
    <AppHeader
      tabs={TABS}
      activeTab={section}
      onSelect={(id) => setSection(id as Section)}
      status={<span className="flex items-center gap-2"><span className="size-2 rounded-full bg-ok" />Backend online · Tailscale</span>}
    />
  );
  return (
    <div className="flex min-h-screen flex-col gap-4 p-4">
      {header}
      {/* Collection stays mounted, so an unsaved edit survives a visit to another tab. */}
      <div className={section === 'collection' ? 'flex flex-1 flex-col' : 'hidden'}>
        <CollectionPage active={section === 'collection'} />
      </div>
      {section === 'pipeline' ? <PipelinePage api={pipelineApi} /> : null}
      {section === 'production' ? <BoardPage api={productionApi} /> : null}
    </div>
  );
}
