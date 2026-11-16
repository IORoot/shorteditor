import type { ReactNode } from 'react';

export interface SectionCardProps {
  title: string;
  description: string;
  children: ReactNode;
}

export function SectionCard({ title, description, children }: SectionCardProps) {
  return (
    <section aria-label={title} className="flex flex-col gap-4 rounded-[20px] bg-surface p-6">
      <header className="flex flex-col gap-1">
        <h2 className="text-h3 font-semibold">{title}</h2>
        <p className="text-small text-text-2">{description}</p>
      </header>
      {children}
    </section>
  );
}
