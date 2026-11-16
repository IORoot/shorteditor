import type { Tone } from '../../lib/types';

const TONE_CLASS: Record<Tone, string> = {
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  bad: 'bg-bad-soft text-bad',
  info: 'bg-accent-soft text-primary',
};

const DOT_CLASS: Record<Tone, string> = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  bad: 'bg-bad',
  info: 'bg-primary',
};

export interface StatusChipProps {
  tone: Tone;
  children: string;
}

export function StatusChip({ tone, children }: StatusChipProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-caption font-semibold ${TONE_CLASS[tone]}`}>
      <span aria-hidden="true" className={`size-1.5 rounded-full ${DOT_CLASS[tone]}`} />
      {children}
    </span>
  );
}
