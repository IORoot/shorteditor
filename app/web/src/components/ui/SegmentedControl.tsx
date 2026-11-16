export interface SegmentedControlProps<T extends string> {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({ label, options, value, onChange }: SegmentedControlProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-xl bg-fill-2 p-[3px]">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={`flex-1 rounded-[9px] py-1.5 text-small font-medium ${active ? 'bg-surface font-semibold text-base-content shadow-sm' : 'text-text-2'}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
