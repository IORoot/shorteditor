export interface ToggleProps {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

export function Toggle({ label, checked, disabled = false, onChange }: ToggleProps) {
  return (
    <input
      type="checkbox"
      role="switch"
      aria-label={label}
      className="toggle toggle-primary toggle-sm"
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
    />
  );
}
