import { TOKENS } from '../../lib/tokens';

export interface TokenRowProps {
  onInsert: (token: string) => void;
}

export function TokenRow({ onInsert }: TokenRowProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-caption font-semibold text-text-2">Insert token</span>
      {TOKENS.map(({ token }) => (
        <button
          key={token}
          type="button"
          onClick={() => onInsert(token)}
          className="rounded-lg bg-accent-soft px-2 py-1 font-mono text-caption font-medium text-primary"
        >
          {token}
        </button>
      ))}
    </div>
  );
}
