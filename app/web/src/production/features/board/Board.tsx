import { COLUMNS, groupCards, type Column } from '../../lib/board';
import type { BatchCard as Card } from '../../lib/types';
import { BatchCard, pickingOf } from './BatchCard';
import { BoardColumn } from './BoardColumn';

const TITLE: Record<Column, string> = {
  queued: 'Queued',
  running: 'Running',
  review: 'Review',
  approved: 'Approved',
};

export interface BoardProps {
  cards: Card[];
  selectedBatchId: number | null;
  onOpen: (card: Card) => void;
  /** The batches chosen for deleting. Undefined while the board is not choosing. */
  chosen?: ReadonlySet<number>;
}

export function Board({ cards, selectedBatchId, onOpen, chosen }: BoardProps) {
  const groups = groupCards(cards);
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-4 items-start gap-4 max-[1200px]:grid-cols-2">
        {COLUMNS.map((column) => (
          <BoardColumn key={column} title={TITLE[column]} count={groups[column].length}>
            <div className="flex flex-col gap-3">
              {groups[column].map((card) => (
                <BatchCard key={card.batchId} card={card} selected={card.batchId === selectedBatchId} onOpen={onOpen} picking={pickingOf(card, chosen)} />
              ))}
            </div>
          </BoardColumn>
        ))}
      </div>
    </div>
  );
}
