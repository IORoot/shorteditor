import { COLUMNS, groupCards, type Column } from '../../lib/board';
import type { BatchCard as Card } from '../../lib/types';
import { ApprovedRow } from './ApprovedRow';
import { BatchCard } from './BatchCard';
import { BoardColumn } from './BoardColumn';

const TITLE: Record<Exclude<Column, 'approved'>, string> = {
  review: 'Ready to review',
  attention: 'Needs attention',
  running: 'Running',
  queued: 'Queued',
};

export interface BoardProps {
  cards: Card[];
  selectedBatchId: number | null;
  onOpen: (card: Card) => void;
}

export function Board({ cards, selectedBatchId, onOpen }: BoardProps) {
  const groups = groupCards(cards);
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-4 items-start gap-4 max-[1200px]:grid-cols-2">
        {COLUMNS.map((column) => (
          <BoardColumn key={column} title={TITLE[column]} count={groups[column].length}>
            <div className="flex flex-col gap-3">
              {groups[column].map((card) => (
                <BatchCard key={card.batchId} card={card} selected={card.batchId === selectedBatchId} onOpen={onOpen} />
              ))}
            </div>
          </BoardColumn>
        ))}
      </div>
      <ApprovedRow cards={groups.approved} selectedBatchId={selectedBatchId} onOpen={onOpen} />
    </div>
  );
}
