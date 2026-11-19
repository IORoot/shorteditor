import { useEffect, useState } from 'react';
import { Button } from '../shared/components/ui/Button';
import { FormField } from '../shared/components/ui/FormField';
import { SectionCard } from '../shared/components/ui/SectionCard';
import { type AiKeyState, type SettingsApi } from './lib/api';

export interface SettingsPageProps {
  api: Pick<SettingsApi, 'aiKey' | 'saveAiKey' | 'saveAiModel'>;
}

const DEFAULT_MODEL = 'nvidia/nemotron-3.5-super-vl';

export function SettingsPage({ api }: SettingsPageProps) {
  const [state, setState] = useState<AiKeyState | null>(null);
  const [draft, setDraft] = useState('');
  const [modelDraft, setModelDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .aiKey()
      .then((loaded) => {
        setState(loaded);
        setModelDraft(loaded.model);
      })
      .catch(() => setError('Could not read the settings'));
  }, [api]);

  const save = async (action: () => Promise<AiKeyState>, onSaved: () => void) => {
    setBusy(true);
    setError(null);
    try {
      const next = await action();
      setState(next);
      setModelDraft(next.model);
      onSaved();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-[720px] flex-col gap-4">
      <h1 className="text-[30px] font-bold tracking-[-0.6px]">Settings</h1>
      <SectionCard title="AI" description="Used by the Detect action stage. The key is kept on this computer and is never shown in full.">
        <div className="flex flex-col gap-3">
          <p className="text-small text-text-2">{state === null ? 'Checking…' : state.keySet ? `A key is saved (${state.keyHint})` : 'No key saved yet'}</p>
          <FormField label="OpenRouter API key" type="password" autoComplete="off" value={draft} onChange={(event) => setDraft(event.target.value)} helper="Paste a new key to replace the saved one." />
          <div className="flex gap-2">
            <Button variant="primary" disabled={busy || draft.trim() === ''} onClick={() => save(() => api.saveAiKey(draft), () => setDraft(''))}>Save key</Button>
            {state?.keySet ? <Button variant="ghost" disabled={busy} onClick={() => save(() => api.saveAiKey(''), () => setDraft(''))}>Remove key</Button> : null}
          </div>
          <FormField label="Model" autoComplete="off" value={modelDraft} onChange={(event) => setModelDraft(event.target.value)} helper={`The OpenRouter model that looks at the frames. Leave it empty to use ${DEFAULT_MODEL}.`} />
          <div className="flex gap-2">
            <Button variant="primary" disabled={busy || state === null || modelDraft.trim() === state.model} onClick={() => save(() => api.saveAiModel(modelDraft.trim() === DEFAULT_MODEL ? '' : modelDraft), () => undefined)}>Save model</Button>
          </div>
          {error ? <p role="alert" className="text-small text-bad">{error}</p> : null}
        </div>
      </SectionCard>
    </main>
  );
}
