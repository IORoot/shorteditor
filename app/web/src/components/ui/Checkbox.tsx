export interface CheckboxProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function Checkbox({ label, checked, onChange }: CheckboxProps) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-small text-base-content">
      <input
        type="checkbox"
        className="checkbox checkbox-primary checkbox-sm rounded-[5px]"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}
