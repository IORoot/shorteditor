import { useState } from 'react';
import { Button } from '../../../shared/components/ui/Button';
import type { BatchCard as Card } from '../../lib/types';
import { BatchCard } from './BatchCard';

const SHOWN = 5;

export interface ApprovedRowProps {
  cards: Card[];
  selectedBatchId?: number | null;
  onOpen: (card: Card) => void;
}

export function ApprovedRow({ cards, selectedBatchId = null, onOpen }: ApprovedRowProps) {
  const [all, setAll] = useState(false);
  if (cards.length === 0) return null;
  const newestFirst = [...cards].sort((a, b) => b.batchId - a.batchId);
  const shown = all ? newestFirst : newestFirst.slice(0, SHOWN);
  return (
    <section aria-label="Approved" className="flex flex-col gap-2">
      <header className="flex items-center justify-between px-2">
        <h2 className="text-small font-semibold text-text-2">Approved</h2>
        {cards.length > SHOWN ? (
          <Button variant="ghost" onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all (${cards.length})`}</Button>
        ) : null}
      </header>
      <div className="grid grid-cols-4 gap-4 max-[1200px]:grid-cols-2">
        {shown.map((card) => (
          <BatchCard key={card.batchId} card={card} selected={card.batchId === selectedBatchId} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}
