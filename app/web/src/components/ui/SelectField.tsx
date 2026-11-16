export interface SelectFieldProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  className?: string;
}

export function SelectField<T extends string>({ label, value, options, onChange, className = '' }: SelectFieldProps<T>) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value as T)}
      className={`select select-sm rounded-[10px] border-0 bg-fill-2 text-small font-medium focus:outline-none focus:ring-2 focus:ring-primary/40 ${className}`}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
