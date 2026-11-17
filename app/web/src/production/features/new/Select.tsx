import type { ReactNode } from 'react';

export interface SelectProps<T extends string> {
  label: string;
  value: T;
  onChange: (value: T) => void;
  children: ReactNode;
}

export function Select<T extends string>({ label, value, onChange, children }: SelectProps<T>) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-caption font-semibold text-text-2">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="select select-sm w-full rounded-[10px] border-0 bg-fill-2 text-small font-medium focus:outline-none focus:ring-2 focus:ring-primary/40"
      >
        {children}
      </select>
    </label>
  );
}
