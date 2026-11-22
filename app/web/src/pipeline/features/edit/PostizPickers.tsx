import { useEffect, useState } from 'react';
import { Checkbox } from '../../../shared/components/ui/Checkbox';
import { FormField } from '../../../shared/components/ui/FormField';
import { SegmentedControl } from '../../../shared/components/ui/SegmentedControl';
import { postizLookup, type LiveFolder, type LivePipeline, type PostizLookupApi } from '../../lib/postizApi';

const LABEL = 'font-sans text-caption font-semibold text-text-2';
const HELP = 'text-caption text-text-3';

/** One channel the stage posts to, with its own options over the platform's defaults. Mirrors the server's ChannelChoice. */
export interface ChannelChoice {
  id: string;
  identifier: string;
  name: string;
  settings: Record<string, unknown>;
}

/** The options a platform starts with. Mirrors the server's channel_defaults. */
export function channelDefaults(identifier: string): Record<string, unknown> {
  if (identifier === 'instagram') return { post_type: 'post', collaborators: [], is_trial_reel: false };
  if (identifier === 'youtube') return { title: '', type: 'public' };
  return {};
}

export interface PostizFolderFieldProps {
  label: string;
  help: string;
  value: string | null;
  onChange: (value: string | null) => void;
  api?: PostizLookupApi;
}

export function PostizFolderField({ label, help, value, onChange, api = postizLookup }: PostizFolderFieldProps) {
  const [folders, setFolders] = useState<LiveFolder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.folders().then(setFolders).catch((failure) => setError(failure instanceof Error ? failure.message : 'Could not load the folders'));
  }, [api]);
  if (error) {
    return (
      <div className="flex flex-col gap-1.5">
        <FormField label={`${label} ID`} value={value ?? ''} onChange={(event) => onChange(event.target.value.trim() === '' ? null : event.target.value.trim())} helper={help} />
        <span role="alert" className="text-caption text-bad">{error}</span>
      </div>
    );
  }
  const listed = folders ?? [];
  const unknown = value !== null && !listed.some((folder) => folder.id === value);
  return (
    <label className="flex flex-col gap-1.5">
      <span className={LABEL}>{label}</span>
      <select
        aria-label={label}
        value={value ?? ''}
        disabled={folders === null}
        onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}
        className="w-full rounded-[10px] bg-fill-2 px-3 py-2 text-small focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary/40"
      >
        <option value="">Postiz root</option>
        {unknown ? <option value={value as string}>{value}</option> : null}
        {listed.map((folder) => (
          <option key={folder.id} value={folder.id}>{folder.name}</option>
        ))}
      </select>
      <span className={HELP}>{help}</span>
    </label>
  );
}

export interface PostizPipelineFieldProps {
  label: string;
  help: string;
  value: string | null;
  onChange: (value: string | null) => void;
  api?: PostizLookupApi;
}

/** Picks the Postiz pipeline by name. If the list cannot be loaded, the ID can be typed instead. */
export function PostizPipelineField({ label, help, value, onChange, api = postizLookup }: PostizPipelineFieldProps) {
  const [pipelines, setPipelines] = useState<LivePipeline[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.pipelines().then(setPipelines).catch((failure) => setError(failure instanceof Error ? failure.message : 'Could not load the pipelines'));
  }, [api]);
  if (error) {
    return (
      <div className="flex flex-col gap-1.5">
        <FormField label={`${label} ID`} value={value ?? ''} onChange={(event) => onChange(event.target.value.trim() === '' ? null : event.target.value.trim())} helper={help} />
        <span role="alert" className="text-caption text-bad">{error}</span>
      </div>
    );
  }
  const listed = pipelines ?? [];
  const unknown = value !== null && pipelines !== null && !listed.some((pipeline) => pipeline.id === value);
  return (
    <label className="flex flex-col gap-1.5">
      <span className={LABEL}>{label}</span>
      <select
        aria-label={label}
        value={value ?? ''}
        disabled={pipelines === null}
        onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}
        className="w-full rounded-[10px] bg-fill-2 px-3 py-2 text-small focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary/40"
      >
        <option value="">No pipeline (upload only)</option>
        {unknown ? <option value={value as string}>{`Unknown pipeline (${value})`}</option> : null}
        {listed.map((pipeline) => (
          <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>
        ))}
      </select>
      <span className={HELP}>{help}</span>
    </label>
  );
}

export interface PostizChannelsFieldProps {
  label: string;
  help: string;
  value: ChannelChoice[];
  onChange: (value: ChannelChoice[]) => void;
  /** The chosen pipeline: its channels are the ones the post goes to. */
  pipelineId: string | null;
  api?: PostizLookupApi;
}

/** The channels of the chosen pipeline, each with its own options. They cannot be turned off here: the pipeline decides them. */
export function PostizChannelsField({ label, help, value, onChange, pipelineId, api = postizLookup }: PostizChannelsFieldProps) {
  const [pipelines, setPipelines] = useState<LivePipeline[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.pipelines().then(setPipelines).catch((failure) => setError(failure instanceof Error ? failure.message : 'Could not load the channels'));
  }, [api]);
  const pipeline = pipelineId === null ? undefined : pipelines?.find((item) => item.id === pipelineId);
  // The pipeline's channels, each keeping the options already set for it.
  const shown: ChannelChoice[] = (pipeline?.channels ?? []).map((channel) => value.find((chosen) => chosen.id === channel.id) ?? { id: channel.id, identifier: channel.identifier, name: channel.name, settings: channelDefaults(channel.identifier) });
  const same = shown.length === value.length && shown.every((channel, index) => channel.id === value[index].id);
  useEffect(() => {
    if (pipeline && !same) onChange(shown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a change of pipeline or of its channels rewrites the list
  }, [pipeline, same]);
  const change = (id: string, settings: Record<string, unknown>) => onChange(shown.map((chosen) => (chosen.id === id ? { ...chosen, settings: { ...chosen.settings, ...settings } } : chosen)));
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className={LABEL}>{label}</legend>
      {error ? <span role="alert" className="text-caption text-bad">{error}</span> : null}
      {!error && pipelineId === null ? <span className={HELP}>Choose a pipeline to see its channels.</span> : null}
      {!error && pipelineId !== null && pipelines === null ? <span className={HELP}>Loading the channels…</span> : null}
      {!error && pipelineId !== null && pipelines !== null && !pipeline ? <span role="alert" className="text-caption text-bad">Postiz has no pipeline with that ID any more.</span> : null}
      {shown.map((channel) => (
        <div key={channel.id} className="flex flex-col gap-3">
          <span className="text-small font-medium">{`${channel.name} (${channel.identifier})`}</span>
          <ChannelOptions choice={channel} onChange={(settings) => change(channel.id, settings)} />
        </div>
      ))}
      <span className={HELP}>{help}</span>
    </fieldset>
  );
}

function ChannelOptions({ choice, onChange }: { choice: ChannelChoice; onChange: (settings: Record<string, unknown>) => void }) {
  const options = { ...channelDefaults(choice.identifier), ...choice.settings };
  const name = choice.name || choice.identifier;
  if (choice.identifier === 'instagram') {
    const collaborators = Array.isArray(options.collaborators) ? (options.collaborators as string[]).join(', ') : '';
    return (
      <div className="ml-7 flex flex-col gap-3 rounded-xl border border-line bg-surface p-3">
        <SegmentedControl label={`${name} post type`} options={[{ value: 'post', label: 'Post' }, { value: 'story', label: 'Story' }]} value={String(options.post_type)} onChange={(next) => onChange({ post_type: next })} />
        <FormField label={`${name} collaborators`} value={collaborators} helper="Instagram handles, separated by commas." onChange={(event) => onChange({ collaborators: event.target.value.split(',').map((part) => part.trim()).filter((part) => part !== '') })} />
        <Checkbox label={`${name} trial reel`} checked={options.is_trial_reel === true} onChange={(on) => onChange({ is_trial_reel: on })} />
      </div>
    );
  }
  if (choice.identifier === 'youtube') {
    return (
      <div className="ml-7 flex flex-col gap-3 rounded-xl border border-line bg-surface p-3">
        <FormField label={`${name} title`} value={String(options.title ?? '')} helper="Empty uses the start of the caption." onChange={(event) => onChange({ title: event.target.value })} />
        <SegmentedControl label={`${name} visibility`} options={[{ value: 'public', label: 'Public' }, { value: 'unlisted', label: 'Unlisted' }, { value: 'private', label: 'Private' }]} value={String(options.type)} onChange={(next) => onChange({ type: next })} />
      </div>
    );
  }
  return null;
}
