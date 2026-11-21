import { useState } from 'react';
import { Button } from '../../../shared/components/ui/Button';
import { Checkbox } from '../../../shared/components/ui/Checkbox';

/** The choice of a Post-iz stop that waits for approval. Its one item is the caption, which can be edited. */
const POST_IT = 'Post it';

const LABEL: Record<string, string> = {
  drop_shortest: 'Drop the shortest parts',
  keep_first: 'Keep the first parts and trim the last',
};

export interface BlockedChoicesProps {
  choices: string[];
  /** The clips a Review by hand stop lets you pick from. Empty for the other stops. */
  items: string[];
  busy: boolean;
  /** The caption is sent only with Post it, from a Post-iz stop. */
  onChoose: (choice: string, picks?: number[], caption?: string) => void;
}

export function BlockedChoices({ choices, items, busy, onChoose }: BlockedChoicesProps) {
  const [picked, setPicked] = useState<number[]>(() => items.map((_, index) => index));
  const [caption, setCaption] = useState(items[0] ?? '');
  if (choices.includes(POST_IT) && items.length === 1) {
    return (
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="font-sans text-caption font-semibold text-text-2">Caption</span>
          <textarea rows={5} value={caption} onChange={(event) => setCaption(event.target.value)} className="w-full rounded-[10px] bg-fill-2 px-3 py-2 text-small focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary/40" />
        </label>
        <span className="-mt-2 text-caption text-text-3">Used for this card only.</span>
        {choices.map((choice) => (
          <Button key={choice} disabled={busy || caption.trim() === ''} onClick={() => (choice === POST_IT ? onChoose(choice, undefined, caption) : onChoose(choice))}>{LABEL[choice] ?? choice}</Button>
        ))}
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        {choices.map((choice) => (
          <Button key={choice} disabled={busy} onClick={() => onChoose(choice)}>
            {LABEL[choice] ?? choice}
          </Button>
        ))}
      </div>
    );
  }
  const toggle = (index: number, on: boolean) => setPicked((current) => (on ? [...current, index] : current.filter((i) => i !== index)));
  return (
    <div className="flex flex-col gap-3">
      <p className="text-small text-text-2">Tick the clips to keep. Clips left unticked are dropped.</p>
      <div className="flex flex-col gap-2">
        {items.map((name, index) => (
          <Checkbox key={`${index}-${name}`} label={name} checked={picked.includes(index)} onChange={(on) => toggle(index, on)} />
        ))}
      </div>
      {choices.map((choice) => (
        <Button key={choice} disabled={busy || picked.length === 0} onClick={() => onChoose(choice, [...picked].sort((a, b) => a - b))}>
          {choice === 'Keep the picked clips' ? `Keep ${picked.length} picked` : LABEL[choice] ?? choice}
        </Button>
      ))}
    </div>
  );
}
