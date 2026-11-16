import { Eye, Play, SlidersHorizontal } from 'lucide-react';
import { Button } from '../../components/ui/Button';

export interface CollectorActionsProps {
  onEdit: () => void;
  onDryRun?: () => void;
  onRun?: () => void;
  runDisabled?: boolean;
}

export function CollectorActions({ onEdit, onDryRun, onRun, runDisabled = false }: CollectorActionsProps) {
  return (
    <div role="group" aria-label="Collector actions" className="flex gap-2.5">
      <Button icon={<SlidersHorizontal size={15} aria-hidden="true" />} onClick={onEdit}>
        Edit
      </Button>
      <Button icon={<Eye size={15} aria-hidden="true" />} onClick={onDryRun}>
        Dry run
      </Button>
      <Button variant="primary" icon={<Play size={15} aria-hidden="true" />} onClick={onRun} disabled={runDisabled}>
        Run now
      </Button>
    </div>
  );
}
