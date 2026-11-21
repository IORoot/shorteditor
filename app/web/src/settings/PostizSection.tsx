import { useEffect, useState } from 'react';
import { Button } from '../shared/components/ui/Button';
import { FormField } from '../shared/components/ui/FormField';
import { SectionCard } from '../shared/components/ui/SectionCard';
import { type PostizState, type PostizTest, type SettingsApi } from './lib/api';

export interface PostizSectionProps {
  api: Pick<SettingsApi, 'postiz' | 'savePostiz' | 'testPostiz'>;
}

export function PostizSection({ api }: PostizSectionProps) {
  const [state, setState] = useState<PostizState | null>(null);
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [found, setFound] = useState<PostizTest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .postiz()
      .then((loaded) => {
        setState(loaded);
        setUrl(loaded.url ?? '');
      })
      .catch(() => setError('Could not read the Post-iz settings'));
  }, [api]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const save = (update: { url?: string; key?: string }) =>
    run(async () => {
      const next = await api.savePostiz(update);
      setState(next);
      setUrl(next.url ?? '');
      setKey('');
      setFound(null);
    });

  const urlChanged = state !== null && url.trim() !== (state.url ?? '');
  const keyChanged = key.trim() !== '';
  const changes = { ...(urlChanged ? { url: url.trim() } : {}), ...(keyChanged ? { key: key.trim() } : {}) };

  return (
    <SectionCard title="Post-iz" description="Where the Post-iz stage sends finished videos. The key is kept on this computer and is never shown in full.">
      <div className="flex flex-col gap-3">
        <p className="text-small text-text-2">{state === null ? 'Checking…' : state.keySet ? `A Postiz key is saved (${state.keyHint})` : 'No Postiz key saved yet'}</p>
        <FormField label="Postiz address" autoComplete="off" value={url} onChange={(event) => setUrl(event.target.value)} helper="For example postiz.example.com. https:// and /api are added for you." />
        <FormField label="Postiz API key" type="password" autoComplete="off" value={key} onChange={(event) => setKey(event.target.value)} helper="Paste a new key to replace the saved one." />
        <div className="flex gap-2">
          <Button variant="primary" disabled={busy || state === null || Object.keys(changes).length === 0} onClick={() => save(changes)}>Save Post-iz</Button>
          {state?.keySet ? <Button variant="ghost" disabled={busy} onClick={() => save({ key: '' })}>Remove Postiz key</Button> : null}
          <Button disabled={busy || state === null || !state.url || !state.keySet || Object.keys(changes).length > 0} onClick={() => run(async () => setFound(await api.testPostiz()))}>Test connection</Button>
        </div>
        {found ? (
          <p role="status" className="text-small text-ok">
            Connected. {found.channels.length} channels ({found.channels.map((c) => `${c.name} (${c.identifier})`).join(', ') || 'none'}) and {found.folders} media folders.
          </p>
        ) : null}
        {error ? <p role="alert" className="text-small text-bad">{error}</p> : null}
      </div>
    </SectionCard>
  );
}
