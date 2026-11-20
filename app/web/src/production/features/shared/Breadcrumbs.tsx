import { ChevronRight } from 'lucide-react';

export interface Crumb {
  label: string;
  /** Goes to this level. The last crumb is the page itself and has none. */
  onOpen?: () => void;
}

export interface BreadcrumbsProps {
  crumbs: Crumb[];
}

/** The path to the page you are on: each level above it is a link back to that level. */
export function Breadcrumbs({ crumbs }: BreadcrumbsProps) {
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 flex-wrap items-center gap-1.5 text-small">
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <li key={`${index}-${crumb.label}`} className="flex min-w-0 items-center gap-1.5">
              {crumb.onOpen && !last ? (
                <button type="button" onClick={crumb.onOpen} className="max-w-[260px] truncate rounded-md px-1 py-0.5 font-medium text-text-2 hover:bg-fill-2 hover:text-text">
                  {crumb.label}
                </button>
              ) : (
                <span aria-current={last ? 'page' : undefined} className={`max-w-[360px] truncate px-1 py-0.5 ${last ? 'font-semibold text-text' : 'text-text-2'}`}>
                  {crumb.label}
                </span>
              )}
              {last ? null : <ChevronRight size={13} aria-hidden="true" className="shrink-0 text-text-3" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
