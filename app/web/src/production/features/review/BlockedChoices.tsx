import { Button } from '../../../shared/components/ui/Button';

const LABEL: Record<string, string> = {
  drop_shortest: 'Drop the shortest parts',
  keep_first: 'Keep the first parts and trim the last',
};

export interface BlockedChoicesProps {
  choices: string[];
  busy: boolean;
  onChoose: (choice: string) => void;
}

export function BlockedChoices({ choices, busy, onChoose }: BlockedChoicesProps) {
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
