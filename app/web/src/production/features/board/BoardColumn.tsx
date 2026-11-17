import type { ReactNode } from 'react';

export interface BoardColumnProps {
  title: string;
  count: number;
  children: ReactNode;
}

export function BoardColumn({ title, count, children }: BoardColumnProps) {
  return (
    <section aria-label={title} className="flex min-w-0 flex-col gap-2">
      <header className="flex items-center justify-between px-2 pb-1.5">
        <h2 className="text-small font-semibold text-text-2">{title}</h2>
        <span className="rounded-full bg-fill-2 px-2 py-0.5 text-caption font-semibold text-text-2">{count}</span>
      </header>
      {count === 0 ? <p className="px-2 text-small text-text-3">Nothing here</p> : children}
    </section>
  );
}
