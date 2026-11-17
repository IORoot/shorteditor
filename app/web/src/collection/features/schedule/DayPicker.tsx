const NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEK_STARTS_MONDAY = [1, 2, 3, 4, 5, 6, 0];

export interface DayPickerProps {
  selected: number[];
  onChange: (weekdays: number[]) => void;
  compact?: boolean;
}

export function DayPicker({ selected, onChange, compact = false }: DayPickerProps) {
  const toggle = (day: number) => {
    const next = selected.includes(day) ? selected.filter((d) => d !== day) : [...selected, day];
    onChange(next.sort((a, b) => a - b));
  };
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className={compact ? 'sr-only' : 'text-caption font-semibold text-text-2'}>Days</legend>
      <div className={compact ? 'flex gap-1' : 'flex justify-between'}>
        {WEEK_STARTS_MONDAY.map((day) => {
          const active = selected.includes(day);
          return (
            <button
              key={day}
              type="button"
              aria-label={NAMES[day]}
              aria-pressed={active}
              onClick={() => toggle(day)}
              className={`flex ${compact ? 'size-7 text-caption' : 'size-9 text-small'} items-center justify-center rounded-full font-semibold ${active ? 'bg-primary text-primary-content' : 'bg-fill-2 text-base-content'}`}
            >
              {NAMES[day][0]}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
