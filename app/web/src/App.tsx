import { useState } from 'react';
import { AppHeader } from './shared/components/shell/AppHeader';
import { CollectionPage } from './collection/CollectionPage';
import { BoardPage } from './production/features/board/BoardPage';
import { productionApi } from './production/lib/api';
import { PipelinePage } from './pipeline/PipelinePage';
import { pipelineApi } from './pipeline/lib/api';
import { SettingsPage } from './settings/SettingsPage';
import { ReviewRoute } from './production/features/review/ReviewRoute';
import { batchHash, batchIdFromHash, cardIdFromHash, goTo, useHash } from './shared/lib/route';
import { BatchBoardPage } from './production/features/batches/BatchBoardPage';
import { settingsApi } from './settings/lib/api';

const TABS = [
  { id: 'collection', label: 'Collection', enabled: true },
  { id: 'pipeline', label: 'Pipeline', enabled: true },
  { id: 'production', label: 'Production', enabled: true },
];

type Section = 'collection' | 'pipeline' | 'production' | 'settings';

export default function App() {
  const [section, setSection] = useState<Section>('collection');
  const hash = useHash();
  const cardId = cardIdFromHash(hash);
  const batchId = batchIdFromHash(hash);
  const header = (
    <AppHeader
      tabs={TABS}
      activeTab={section}
      onSelect={(id) => {
        goTo('');  // a tab leaves any review page behind
        setSection(id as Section);
      }}
      onSettings={() => setSection('settings')}
      settingsActive={section === 'settings'}
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
      {section === 'settings' ? <SettingsPage api={settingsApi} /> : null}
      {section === 'production' && cardId !== null ? (
        <ReviewRoute api={productionApi} cardId={cardId} onBack={(batch) => goTo(batch === null ? '' : batchHash(batch))} />
      ) : null}
      {section === 'production' && cardId === null && batchId !== null ? <BatchBoardPage api={productionApi} batchId={batchId} onBack={() => goTo('')} /> : null}
      {section === 'production' && cardId === null && batchId === null ? (
        <BoardPage api={productionApi} onManagePipelines={() => setSection('pipeline')} onOpenBatch={(id) => goTo(batchHash(id))} />
      ) : null}
    </div>
  );
}
