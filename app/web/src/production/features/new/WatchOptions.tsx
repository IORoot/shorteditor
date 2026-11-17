import { FormField } from '../../../shared/components/ui/FormField';
import { Toggle } from '../../../shared/components/ui/Toggle';
import { wholeHint, watchNameOf, type ManyForm } from '../../lib/presets';

/**
 * 'optional': in the new-batch form, with a switch. 'locked': adding a watch, so watching is on already.
 * 'edit': changing a saved watch, which has no existing-folders switch (that only applies when a watch starts).
 */
export type WatchOptionsMode = 'optional' | 'locked' | 'edit';

export interface WatchOptionsProps {
  value: ManyForm;
  onChange: (patch: Partial<ManyForm>) => void;
  mode: WatchOptionsMode;
  folderCount: number;
}

const INTERVAL = { min: 1, max: 1440 };
const SETTLE = { min: 0, max: 1440 };
const PER_CHECK = { min: 1, max: 100 };

export function WatchOptions({ value, onChange, mode, folderCount }: WatchOptionsProps) {
  const watching = mode !== 'optional' || value.watching;
  if (!watching) {
    return (
      <div className="flex items-center justify-between gap-4 rounded-[14px] bg-fill-2 px-3.5 py-3">
        <span className="text-body font-semibold">Keep watching this folder</span>
        <Toggle label="Keep watching this folder" checked={false} onChange={(checked) => onChange({ watching: checked })} />
      </div>
    );
  }

  const existingLabel = `Also create batches for the ${folderCount} ${folderCount === 1 ? 'folder' : 'folders'} already there`;
  const perCheck = value.maxPerCheck.trim() || '20';
  return (
    <section aria-label="Watching" className="flex flex-col gap-4 rounded-[14px] bg-surface p-3.5 ring-1 ring-line">
      {mode === 'optional' ? (
        <div className="flex items-center justify-between gap-4">
          <span className="text-body font-semibold">Keep watching this folder</span>
          <Toggle label="Keep watching this folder" checked={value.watching} onChange={(checked) => onChange({ watching: checked })} />
        </div>
      ) : null}
      <FormField
        label="Watch name"
        placeholder={watchNameOf({ ...value, watchName: '' })}
        value={value.watchName}
        onChange={(event) => onChange({ watchName: event.target.value })}
      />
      <div className="grid grid-cols-2 gap-4">
        <FormField
          label="Check every (minutes)"
          inputMode="numeric"
          error={wholeHint(value.intervalMinutes, INTERVAL.min, INTERVAL.max) ?? undefined}
          value={value.intervalMinutes}
          onChange={(event) => onChange({ intervalMinutes: event.target.value })}
        />
        <FormField
          label="At most per check (batches)"
          inputMode="numeric"
          error={wholeHint(value.maxPerCheck, PER_CHECK.min, PER_CHECK.max) ?? undefined}
          value={value.maxPerCheck}
          onChange={(event) => onChange({ maxPerCheck: event.target.value })}
        />
        <FormField
          className="col-span-2"
          label="Wait until nothing has changed for (minutes)"
          inputMode="numeric"
          error={wholeHint(value.settleMinutes, SETTLE.min, SETTLE.max) ?? undefined}
          value={value.settleMinutes}
          onChange={(event) => onChange({ settleMinutes: event.target.value })}
        />
      </div>
      {mode !== 'edit' ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-4">
            <span className="text-body font-semibold">{existingLabel}</span>
            <Toggle label={existingLabel} checked={value.watchExisting} onChange={(checked) => onChange({ watchExisting: checked })} />
          </div>
          <p className="text-caption text-text-3">
            {value.watchExisting
              ? `On: they are batched now, up to ${perCheck} per check; the rest follow on later checks.`
              : 'Off: folders already there are skipped. Any still being copied get a batch once they settle.'}
          </p>
        </div>
      ) : null}
    </section>
  );
}
