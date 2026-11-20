import { useEffect, useRef, useState } from 'react';
import { Button } from '../../../shared/components/ui/Button';
import type { ProductionApi } from '../../lib/api';
import type { ClipRow } from '../../lib/clips';
import { addRange, dragEdge, removeRange, sameRanges, seconds, type Range } from '../../lib/trims';
import { TrimTimeline } from './TrimTimeline';

const LABEL = 'text-label font-semibold uppercase tracking-[0.8px] text-text-3';
type Basis = 'ai' | 'mine' | 'whole';

export interface ClipEditorProps {
  api: Pick<ProductionApi, 'saveTrims' | 'resetTrims' | 'clipUrl'>;
  passId: number;
  row: ClipRow;
  /** The card is running: its trims cannot change until it stops. */
  running: boolean;
  /** Called after a save or reset, so the card's data is read again. */
  onSaved: () => void;
  onClose: () => void;
}

const basisParts = (row: ClipRow, basis: Basis): Range[] => (basis === 'ai' ? row.parts : basis === 'mine' ? row.trims : [{ start: 0, end: row.length }]);

/** The editor for one clip: its video, its timeline, its parts, and saving or resetting its trims. */
export function ClipEditor({ api, passId, row, running, onSaved, onClose }: ClipEditorProps) {
  const [basis, setBasis] = useState<Basis>(row.trims.length > 0 ? 'mine' : 'ai');
  const [draft, setDraft] = useState<Range[]>(() => basisParts(row, basis));
  const [selected, setSelected] = useState<number | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const video = useRef<HTMLVideoElement>(null);

  // another clip was opened: start its editor from its own parts
  useEffect(() => {
    setBasis(row.trims.length > 0 ? 'mine' : 'ai');
    setDraft(basisParts(row, row.trims.length > 0 ? 'mine' : 'ai'));
    setSelected(null);
    setPending(null);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.name]);

  const choose = (next: Basis) => {
    setBasis(next);
    setDraft(basisParts(row, next));
    setSelected(null);
    setError(null);
  };

  const playhead = () => video.current?.currentTime ?? 0;

  const markStart = () => {
    setPending(playhead());
    setError(null);
  };

  const markEnd = () => {
    if (pending === null) return;
    const next = addRange(draft, pending, playhead(), row.length);
    if (next) {
      setDraft(next);
      setPending(null);
    } else {
      setError('That part is too short, or it overlaps another part. Move the video and try again.');
    }
  };

  const save = async () => {
    setError(null);
    if (draft.length === 0) {
      setError('Keep at least one part, or use Reset to AI.');
      return;
    }
    setBusy(true);
    try {
      // a list the same as the AI's parts is not a trim of your own, so it is dropped
      if (sameRanges(draft, row.parts)) await api.resetTrims(passId, row.name);
      else await api.saveTrims(passId, row.name, draft);
      setBasis(sameRanges(draft, row.parts) ? 'ai' : 'mine');
      onSaved();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The trims could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setError(null);
    setBusy(true);
    try {
      await api.resetTrims(passId, row.name);
      setBasis('ai');
      setDraft(row.parts);
      setSelected(null);
      onSaved();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The trims could not be reset.');
    } finally {
      setBusy(false);
    }
  };

  const setEdge = (index: number, edge: 'start' | 'end', value: number) => {
    if (Number.isFinite(value)) setDraft(dragEdge(draft, index, edge, value, row.length));
  };

  const locked = running || busy;
  // nothing to save when the parts are the ones already saved (or the AI's, when none are saved)
  const unchanged = sameRanges(draft, row.trims.length > 0 ? row.trims : row.parts);

  return (
    <section aria-label="Clip editor" className="flex min-w-0 flex-col gap-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 title={row.name} className="truncate text-body font-semibold">{row.name}</h2>
          <p className="text-caption text-text-2">{seconds(row.length)} long · {draft.length} {draft.length === 1 ? 'part' : 'parts'} in the render</p>
        </div>
        <Button onClick={onClose}>Back to output</Button>
      </div>

      <video ref={video} controls preload="metadata" src={api.clipUrl(passId, row.name)} className="max-h-[260px] w-full rounded-xl bg-black" />

      <div role="group" aria-label="Parts shown" className="flex flex-wrap gap-1.5">
        {([['ai', 'AI parts'], ['mine', 'My trims'], ['whole', 'Whole clip']] as [Basis, string][]).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={basis === value}
            disabled={locked}
            onClick={() => choose(value)}
            className={`rounded-full px-3 py-1 text-caption font-semibold ${basis === value ? 'bg-primary text-on-accent' : 'bg-fill-2 text-text-2 hover:bg-fill-3'} disabled:opacity-50`}
          >
            {label}
          </button>
        ))}
      </div>

      <TrimTimeline
        length={row.length}
        aiParts={row.parts}
        draft={draft}
        selected={selected}
        disabled={locked}
        onChange={setDraft}
        onSelect={setSelected}
        onRefused={setError}
      />
      <p className="text-caption text-text-3">Drag across empty space to add a part. Drag a blue box's ends to move them. Select a part and press Delete to remove it. Dashed outlines are the AI's parts.</p>

      <div className="flex flex-wrap gap-2">
        <Button disabled={locked} onClick={markStart}>Start at playhead</Button>
        <Button disabled={locked || pending === null} onClick={markEnd}>End at playhead</Button>
        {pending !== null ? <span className="self-center text-caption text-text-2">Starts at {seconds(pending)}</span> : null}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className={LABEL}>Parts</h3>
        {draft.length === 0 ? <p className="text-small text-text-3">No parts. Add one, or use Reset to AI.</p> : null}
        <ol aria-label="Parts list" className="flex flex-col gap-1.5">
          {draft.map((part, index) => (
            <li key={index} className="grid grid-cols-[auto_1fr_1fr_auto_auto] items-center gap-2 rounded-xl bg-fill-2 px-3 py-2 text-caption">
              <span className="font-semibold">{index + 1}</span>
              <label className="flex items-center gap-1.5">
                <span className="text-text-3">From</span>
                <input
                  type="number"
                  step={0.1}
                  min={0}
                  max={row.length}
                  disabled={locked}
                  aria-label={`Start of part ${index + 1}`}
                  value={Number(part.start.toFixed(2))}
                  onChange={(event) => setEdge(index, 'start', Number(event.target.value))}
                  className="w-20 rounded-md bg-surface px-2 py-1 tabular-nums"
                />
              </label>
              <label className="flex items-center gap-1.5">
                <span className="text-text-3">to</span>
                <input
                  type="number"
                  step={0.1}
                  min={0}
                  max={row.length}
                  disabled={locked}
                  aria-label={`End of part ${index + 1}`}
                  value={Number(part.end.toFixed(2))}
                  onChange={(event) => setEdge(index, 'end', Number(event.target.value))}
                  className="w-20 rounded-md bg-surface px-2 py-1 tabular-nums"
                />
              </label>
              <span className="tabular-nums text-text-2">{seconds(part.end - part.start)}</span>
              <button
                type="button"
                disabled={locked}
                aria-label={`Delete part ${index + 1}`}
                onClick={() => {
                  setDraft(removeRange(draft, index));
                  setSelected(null);
                }}
                className="rounded-full px-2 py-0.5 text-text-2 hover:bg-surface disabled:opacity-50"
              >
                Delete
              </button>
            </li>
          ))}
        </ol>
      </div>

      {running ? <p role="status" className="text-small text-text-2">The card is running. Its trims can change when it stops.</p> : null}
      {error ? <p role="alert" className="break-words rounded-xl bg-bad-soft px-4 py-3 text-small text-bad">{error}</p> : null}

      <div className="flex flex-wrap gap-2.5 pt-1">
        <Button variant="primary" disabled={locked || unchanged} onClick={save}>
          Save trims
        </Button>
        <Button disabled={locked || row.trims.length === 0} onClick={reset}>Reset to AI</Button>
      </div>
    </section>
  );
}
