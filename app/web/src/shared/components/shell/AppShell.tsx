import type { ReactNode } from 'react';

export interface AppShellProps {
  header: ReactNode;
  sidebar: ReactNode;
  title: ReactNode;
  actions: ReactNode;
  main: ReactNode;
  panel: ReactNode;
}

export function AppShell({ header, sidebar, title, actions, main, panel }: AppShellProps) {
  return (
    <div className="flex min-h-screen flex-col gap-4 p-4">
      {header}
      <div className="grid flex-1 grid-cols-[320px_minmax(0,1fr)_360px] grid-rows-[auto_1fr] gap-x-4 gap-y-5 max-[1200px]:grid-cols-[280px_minmax(0,1fr)] max-[1200px]:grid-rows-[auto_auto_auto_auto]">
        <aside aria-label="Collectors" className="col-start-1 row-span-2 flex flex-col gap-1.5 max-[1200px]:row-span-4">
          {sidebar}
        </aside>
        <div className="col-start-2 row-start-1 flex min-w-0 items-center px-2">{title}</div>
        <div className="col-start-3 row-start-1 flex items-center justify-end max-[1200px]:col-start-2 max-[1200px]:row-start-2 max-[1200px]:justify-start max-[1200px]:px-2">
          {actions}
        </div>
        <main className="col-start-2 row-start-2 flex min-w-0 flex-col max-[1200px]:row-start-3">{main}</main>
        <section aria-label="Schedule" className="col-start-3 row-start-2 flex flex-col max-[1200px]:col-start-2 max-[1200px]:row-start-4">
          {panel}
        </section>
      </div>
    </div>
  );
}
