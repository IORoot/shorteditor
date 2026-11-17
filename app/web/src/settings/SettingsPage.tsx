import { useEffect, useState } from 'react';
import { Button } from '../shared/components/ui/Button';
import { FormField } from '../shared/components/ui/FormField';
import { SectionCard } from '../shared/components/ui/SectionCard';
import { type AiKeyState, type SettingsApi } from './lib/api';

export interface SettingsPageProps {
  api: Pick<SettingsApi, 'aiKey' | 'saveAiKey'>;
}

export function SettingsPage({ api }: SettingsPageProps) {
  const [state, setState] = useState<AiKeyState | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.aiKey().then(setState).catch(() => setError('Could not read the settings'));
  }, [api]);

  const save = async (key: string | null) => {
    setBusy(true);
    setError(null);
    try {
      setState(await api.saveAiKey(key));
      setDraft('');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save the key');
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
          {error ? <p role="alert" className="text-small text-bad">{error}</p> : null}
          <div className="flex gap-2">
            <Button variant="primary" disabled={busy || draft.trim() === ''} onClick={() => save(draft)}>Save key</Button>
            {state?.keySet ? <Button variant="ghost" disabled={busy} onClick={() => save('')}>Remove key</Button> : null}
          </div>
        </div>
      </SectionCard>
    </main>
  );
}
