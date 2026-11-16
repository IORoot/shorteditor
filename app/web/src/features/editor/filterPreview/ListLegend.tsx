import type { ReactNode } from 'react';

export interface ListLegendProps {
  children?: ReactNode;
}

/** Collected / Filtered-out key on the left; anything passed in (the count) sits on the right. */
export function ListLegend({ children }: ListLegendProps) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-line pt-3.5 text-caption text-text-2">
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-3 rounded border-[1.5px] border-primary bg-accent-soft" />
          Collected
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-3 rounded border border-line bg-fill-2 opacity-45" />
          Filtered out
        </span>
      </div>
      {children}
    </div>
  );
}
