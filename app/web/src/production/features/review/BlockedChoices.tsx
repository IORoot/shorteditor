import { useState } from 'react';
import { Button } from '../../../shared/components/ui/Button';
import { Checkbox } from '../../../shared/components/ui/Checkbox';

const LABEL: Record<string, string> = {
  drop_shortest: 'Drop the shortest parts',
  keep_first: 'Keep the first parts and trim the last',
};

export interface BlockedChoicesProps {
  choices: string[];
  /** The clips a Review by hand stop lets you pick from. Empty for the other stops. */
  items: string[];
  busy: boolean;
  onChoose: (choice: string, picks?: number[]) => void;
}

export function BlockedChoices({ choices, items, busy, onChoose }: BlockedChoicesProps) {
  const [picked, setPicked] = useState<number[]>(() => items.map((_, index) => index));
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
