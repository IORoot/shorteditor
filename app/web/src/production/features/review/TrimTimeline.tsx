import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { addRange, dragEdge, removeRange, type Range } from '../../lib/trims';

export interface TrimTimelineProps {
  /** The clip's length in seconds. */
  length: number;
  /** The AI's parts, shown as outlines for reference. */
  aiParts: Range[];
  /** The parts the render will use, edited here. */
  draft: Range[];
  selected: number | null;
  disabled: boolean;
  onChange: (draft: Range[]) => void;
  onSelect: (index: number | null) => void;
  onRefused: (message: string) => void;
}

type Gesture = { kind: 'edge'; index: number; edge: 'start' | 'end' } | { kind: 'add'; anchor: number; now: number } | null;

const pct = (value: number, length: number) => `${(value / length) * 100}%`;

/**
 * One clip as a strip: the AI's parts as outlines, your parts as blue boxes with handles at their ends.
 * Drag across empty space to add a part, drag a handle to move a start or end, and press Delete on a selected part to remove it.
 */
export function TrimTimeline({ length, aiParts, draft, selected, disabled, onChange, onSelect, onRefused }: TrimTimelineProps) {
  const track = useRef<HTMLDivElement>(null);
  const [gesture, setGesture] = useState<Gesture>(null);

  const secondsAt = (clientX: number) => {
    const rect = track.current!.getBoundingClientRect();
    const fraction = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
    return Math.min(Math.max(fraction * length, 0), length);
  };

  const down = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    const target = event.target as HTMLElement;
    const handle = target.dataset.handle as 'start' | 'end' | undefined;
    const box = target.dataset.box;
    track.current?.setPointerCapture?.(event.pointerId);
    if (handle && box !== undefined) {
      onSelect(Number(box));
      setGesture({ kind: 'edge', index: Number(box), edge: handle });
      return;
    }
    if (box !== undefined) {
      onSelect(Number(box));
      return;
    }
    const at = secondsAt(event.clientX);
    onSelect(null);
    setGesture({ kind: 'add', anchor: at, now: at });
  };

  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (!gesture) return;
    const at = secondsAt(event.clientX);
    if (gesture.kind === 'edge') onChange(dragEdge(draft, gesture.index, gesture.edge, at, length));
    else setGesture({ ...gesture, now: at });
  };

  const up = (event: PointerEvent<HTMLDivElement>) => {
    if (gesture?.kind === 'add') {
      const next = addRange(draft, gesture.anchor, secondsAt(event.clientX), length);
      if (next) onChange(next);
      else onRefused('That part is too short, or it overlaps another part. Pick an empty stretch of the clip.');
    }
    setGesture(null);
  };

  const key = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled || selected === null) return;
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      onChange(removeRange(draft, selected));
      onSelect(null);
    }
  };

  const preview = gesture?.kind === 'add' && Math.abs(gesture.now - gesture.anchor) > 0.01
    ? { start: Math.min(gesture.anchor, gesture.now), end: Math.max(gesture.anchor, gesture.now) }
    : null;

  return (
    <div
      ref={track}
      role="group"
      aria-label="Clip timeline"
      tabIndex={0}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onKeyDown={key}
      className="relative h-16 touch-none select-none overflow-hidden rounded-lg bg-fill-2 focus-visible:outline-2 focus-visible:outline-accent"
    >
      {aiParts.map((part, index) => (
        <div
          key={`ai-${index}`}
          aria-hidden="true"
          style={{ left: pct(part.start, length), width: pct(part.end - part.start, length) }}
          className="pointer-events-none absolute bottom-1 top-1 rounded border border-dashed border-text-3"
        />
      ))}
      {draft.map((part, index) => (
        <div
          key={`mine-${index}`}
          data-box={index}
          role="img"
          aria-label={`Part ${index + 1}, ${part.start.toFixed(2)} to ${part.end.toFixed(2)} seconds`}
          style={{ left: pct(part.start, length), width: pct(part.end - part.start, length), minWidth: 6 }}
          className={`absolute bottom-0 top-0 cursor-grab rounded-md border-2 border-accent bg-accent-soft ${selected === index ? 'ring-2 ring-primary' : ''}`}
        >
          <span data-box={index} data-handle="start" className="absolute bottom-0 left-0 top-0 w-2 cursor-ew-resize rounded-l-md bg-accent" />
          <span data-box={index} data-handle="end" className="absolute bottom-0 right-0 top-0 w-2 cursor-ew-resize rounded-r-md bg-accent" />
        </div>
      ))}
      {preview ? (
        <div aria-hidden="true" style={{ left: pct(preview.start, length), width: pct(preview.end - preview.start, length) }} className="pointer-events-none absolute bottom-0 top-0 border-2 border-dashed border-accent" />
      ) : null}
    </div>
  );
}
