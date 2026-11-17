export interface SelectFieldProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  className?: string;
  /** White field with a border, for use on a grey card. */
  surface?: boolean;
}

export function SelectField<T extends string>({ label, value, options, onChange, className = '', surface = false }: SelectFieldProps<T>) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value as T)}
      className={`select select-sm rounded-[10px] ${surface ? 'border border-line bg-surface' : 'border-0 bg-fill-2'} text-small font-medium focus:outline-none focus:ring-2 focus:ring-primary/40 ${className}`}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
