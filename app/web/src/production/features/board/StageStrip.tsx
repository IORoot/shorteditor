import type { SegmentState } from '../../lib/board';

const CLASS: Record<SegmentState, string> = {
  done: 'bg-ok',
  run: 'bg-primary',
  todo: 'bg-fill-2',
};

export function StageStrip({ segments }: { segments: SegmentState[] }) {
  return (
    <div data-testid="stage-strip" aria-hidden="true" className="flex gap-1">
      {segments.map((state, index) => (
        <span key={index} data-testid="stage-segment" data-state={state} className={`h-1 flex-1 rounded-full ${CLASS[state]}`} />
      ))}
    </div>
  );
}
