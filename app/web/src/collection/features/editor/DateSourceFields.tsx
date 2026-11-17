import { DATE_SOURCES } from '../../lib/filters';
import type { DateSourceKind } from '../../lib/types';
import { SelectField } from '../../../shared/components/ui/SelectField';

export interface DateSourceSelectProps {
  label: string;
  value: DateSourceKind;
  onChange: (value: DateSourceKind) => void;
  surface?: boolean;
  className?: string;
}

/** Picks where a clip's date comes from: modified time, created time or a date read from the filename. */
export function DateSourceSelect({ label, value, onChange, surface = false, className = 'w-40' }: DateSourceSelectProps) {
  return <SelectField label={label} value={value} options={DATE_SOURCES} onChange={onChange} surface={surface} className={className} />;
}

export interface FilenamePatternFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

/** The format used to read a date from a filename, e.g. GX_YYYYMMDD_HHmmss. */
export function FilenamePatternField({ label, value, onChange, className = 'w-48' }: FilenamePatternFieldProps) {
  return (
    <input
      aria-label={label}
      placeholder="GX_YYYYMMDD"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={`input input-sm rounded-[10px] border border-line bg-surface px-3 font-mono text-small focus:outline-none focus:ring-2 focus:ring-primary/40 ${className}`}
    />
  );
}
