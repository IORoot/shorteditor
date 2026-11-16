import type { ReactNode } from 'react';

export interface AppShellProps {
  header: ReactNode;
  sidebar: ReactNode;
  main: ReactNode;
  panel: ReactNode;
}

export function AppShell({ header, sidebar, main, panel }: AppShellProps) {
  return (
    <div className="flex min-h-screen flex-col gap-4 p-4">
      {header}
      <div className="grid flex-1 grid-cols-[320px_minmax(0,1fr)_360px] gap-4 max-[1200px]:grid-cols-[280px_minmax(0,1fr)]">
        <aside aria-label="Collectors" className="flex flex-col gap-1.5 max-[1200px]:row-span-2">
          {sidebar}
        </aside>
        <main className="flex min-w-0 flex-col gap-5">{main}</main>
        <section aria-label="Schedule" className="max-[1200px]:col-span-2">
          {panel}
        </section>
      </div>
    </div>
  );
}
