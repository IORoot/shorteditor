const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export interface DayPickerProps {
  selected: number[];
  onChange: (weekdays: number[]) => void;
}

export function DayPicker({ selected, onChange }: DayPickerProps) {
  const toggle = (day: number) => {
    const next = selected.includes(day) ? selected.filter((d) => d !== day) : [...selected, day];
    onChange(next.sort((a, b) => a - b));
  };
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-caption font-semibold text-text-2">Days</legend>
      <div className="flex justify-between">
        {DAYS.map((label, day) => {
          const active = selected.includes(day);
          return (
            <button
              key={day}
              type="button"
              aria-label={NAMES[day]}
              aria-pressed={active}
              onClick={() => toggle(day)}
              className={`flex size-9 items-center justify-center rounded-full text-small font-semibold ${active ? 'bg-primary text-primary-content' : 'bg-fill-2 text-base-content'}`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
