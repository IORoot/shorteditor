import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { postizLookup } from '../../lib/postizApi';
import type { StageInfo, StageStep } from '../../lib/types';
import { PostizChannelsField, PostizFolderField, PostizPipelineField, channelDefaults, type ChannelChoice } from './PostizPickers';
import { StageSettings } from './StageSettings';

const CHANNELS = [
  { id: 'c1', name: 'London Parkour', identifier: 'instagram' },
  { id: 'c2', name: 'Channel', identifier: 'youtube' },
  { id: 'c3', name: 'ldnpk', identifier: 'facebook' },
];
const FOLDERS = [{ id: 'f1', name: 'Class Clips - Sat' }, { id: 'f2', name: 'Coach Diaries - Sat' }];
const PIPELINES = [{ id: 'p1', name: 'Class Highlights', channels: [CHANNELS[0], CHANNELS[1], CHANNELS[2]] }, { id: 'p2', name: 'Coach Diaries', channels: [CHANNELS[1]] }];
const api = (over = {}) => ({ channels: vi.fn().mockResolvedValue(CHANNELS), pipelines: vi.fn().mockResolvedValue(PIPELINES), folders: vi.fn().mockResolvedValue(FOLDERS), ...over });

afterEach(() => vi.restoreAllMocks());

describe('PostizFolderField', () => {
  it('lists the live folders with the Postiz root first and sends the chosen ID', async () => {
    const onChange = vi.fn();
    render(<PostizFolderField label="Media folder" help="help" value={null} onChange={onChange} api={api()} />);
    const select = await screen.findByLabelText('Media folder');
    await waitFor(() => expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Postiz root', 'Class Clips - Sat', 'Coach Diaries - Sat']));
    fireEvent.change(select, { target: { value: 'f2' } });
    expect(onChange).toHaveBeenCalledWith('f2');
    fireEvent.change(select, { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('shows the message and a folder ID box when the list cannot load', async () => {
    const onChange = vi.fn();
    render(<PostizFolderField label="Media folder" help="help" value="f9" onChange={onChange} api={api({ folders: vi.fn().mockRejectedValue(new Error('Postiz is not set up. Add the address and key in Settings')) })} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('not set up');
    const box = screen.getByLabelText('Media folder ID');
    expect(box).toHaveValue('f9');
    fireEvent.change(box, { target: { value: 'f3' } });
    expect(onChange).toHaveBeenCalledWith('f3');
  });
});

describe('PostizPipelineField', () => {
  it('lists pipelines by name and sends the chosen ID', async () => {
    const onChange = vi.fn();
    render(<PostizPipelineField label="Postiz pipeline" help="help" value={null} onChange={onChange} api={api()} />);
    const select = await screen.findByLabelText('Postiz pipeline');
    await waitFor(() => expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['No pipeline (upload only)', 'Class Highlights', 'Coach Diaries']));
    fireEvent.change(select, { target: { value: 'p2' } });
    expect(onChange).toHaveBeenCalledWith('p2');
  });

  it('falls back to a typed ID with the message when the list cannot load', async () => {
    const onChange = vi.fn();
    render(<PostizPipelineField label="Postiz pipeline" help="help" value="p9" onChange={onChange} api={api({ pipelines: vi.fn().mockRejectedValue(new Error('Postiz said 404')) })} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Postiz said 404');
    fireEvent.change(screen.getByLabelText('Postiz pipeline ID'), { target: { value: 'p3' } });
    expect(onChange).toHaveBeenCalledWith('p3');
  });
});

describe('PostizChannelsField', () => {
  const instagram: ChannelChoice = { id: 'c1', identifier: 'instagram', name: 'London Parkour', settings: channelDefaults('instagram') };

  it('turns on every channel of the chosen pipeline, with the platform defaults', async () => {
    const onChange = vi.fn();
    render(<PostizChannelsField label="Channels" help="help" value={[]} pipelineId="p1" onChange={onChange} api={api()} />);
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onChange.mock.calls[0][0]).toEqual([
      { id: 'c1', identifier: 'instagram', name: 'London Parkour', settings: { post_type: 'post', collaborators: [], is_trial_reel: false } },
      { id: 'c2', identifier: 'youtube', name: 'Channel', settings: { title: '', type: 'public' } },
      { id: 'c3', identifier: 'facebook', name: 'ldnpk', settings: {} },
    ]);
  });

  it('switching pipeline replaces the channels but keeps the options of one that stays', async () => {
    const onChange = vi.fn();
    const youtube: ChannelChoice = { id: 'c2', identifier: 'youtube', name: 'Channel', settings: { title: 'Mine', type: 'private' } };
    render(<PostizChannelsField label="Channels" help="help" value={[instagram, youtube]} pipelineId="p2" onChange={onChange} api={api()} />);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith([youtube]));
  });

  it('writes nothing when the saved channels already match the pipeline, and has no switches to turn one off', async () => {
    const onChange = vi.fn();
    render(<PostizChannelsField label="Channels" help="help" value={[instagram]} pipelineId="p3" onChange={onChange} api={api({ pipelines: vi.fn().mockResolvedValue([{ id: 'p3', name: 'One', channels: [CHANNELS[0]] }]) })} />);
    await screen.findByText('London Parkour (instagram)');
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('London Parkour (instagram)')).toBeNull();
  });

  it('asks for a pipeline first, and says so when the chosen one is gone', async () => {
    const { unmount } = render(<PostizChannelsField label="Channels" help="help" value={[]} pipelineId={null} onChange={vi.fn()} api={api()} />);
    expect(screen.getByText('Choose a pipeline to see its channels.')).toBeInTheDocument();
    unmount();
    render(<PostizChannelsField label="Channels" help="help" value={[]} pipelineId="gone" onChange={vi.fn()} api={api()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('no pipeline with that ID');
  });

  it('an Instagram channel shows its three options and saves them in its settings', async () => {
    const onChange = vi.fn();
    render(<PostizChannelsField label="Channels" help="help" value={[instagram]} pipelineId="p3" onChange={onChange} api={api({ pipelines: vi.fn().mockResolvedValue([{ id: 'p3', name: 'One', channels: [CHANNELS[0]] }]) })} />);
    await screen.findByText('London Parkour (instagram)');
    fireEvent.click(screen.getByRole('radio', { name: 'Story' }));
    expect(onChange).toHaveBeenLastCalledWith([{ ...instagram, settings: { ...instagram.settings, post_type: 'story' } }]);
    fireEvent.change(screen.getByLabelText('London Parkour collaborators'), { target: { value: 'a, b' } });
    expect(onChange).toHaveBeenLastCalledWith([{ ...instagram, settings: { ...instagram.settings, collaborators: ['a', 'b'] } }]);
    fireEvent.click(screen.getByLabelText('London Parkour trial reel'));
    expect(onChange).toHaveBeenLastCalledWith([{ ...instagram, settings: { ...instagram.settings, is_trial_reel: true } }]);
  });

  it('a YouTube channel shows a title and visibility, and other platforms show no options', async () => {
    const youtube: ChannelChoice = { id: 'c2', identifier: 'youtube', name: 'Channel', settings: channelDefaults('youtube') };
    const facebook: ChannelChoice = { id: 'c3', identifier: 'facebook', name: 'ldnpk', settings: {} };
    render(<PostizChannelsField label="Channels" help="help" value={[youtube, facebook]} pipelineId="p4" onChange={vi.fn()} api={api({ pipelines: vi.fn().mockResolvedValue([{ id: 'p4', name: 'Two', channels: [CHANNELS[1], CHANNELS[2]] }]) })} />);
    await screen.findByText('Channel (youtube)');
    expect(screen.getByLabelText('Channel title')).toHaveValue('');
    expect(screen.getByRole('radio', { name: 'Public' })).toBeChecked();
    expect(screen.queryByLabelText(/ldnpk title/)).toBeNull();
  });

  it('puts the options of a channel on a surface, not the same grey as its fields', async () => {
    render(<PostizChannelsField label="Channels" help="help" value={[instagram]} pipelineId="p3" onChange={vi.fn()} api={api({ pipelines: vi.fn().mockResolvedValue([{ id: 'p3', name: 'One', channels: [CHANNELS[0]] }]) })} />);
    const options = (await screen.findByLabelText('London Parkour post type')).closest('div.ml-7');
    expect(options?.className).toContain('bg-surface');
    expect(options?.className).not.toContain('bg-fill-2');
  });

  it('shows the message when the pipelines cannot load', async () => {
    render(<PostizChannelsField label="Channels" help="help" value={[]} pipelineId="p1" onChange={vi.fn()} api={api({ pipelines: vi.fn().mockRejectedValue(new Error('Postiz said 401')) })} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Postiz said 401');
  });
});

describe('Post-iz settings in the stage form', () => {
  const info: StageInfo = {
    key: 'postiz_export', title: 'Post-iz', description: '', transitions: { video: 'video' }, position: 'last',
    settingsSchema: {
      properties: {
        folderId: { anyOf: [{ type: 'string' }, { type: 'null' }], default: null, title: 'Media folder', description: 'Where.', widget: 'postiz_folder' },
        pipelineId: { anyOf: [{ type: 'string' }, { type: 'null' }], default: null, title: 'Postiz pipeline', description: 'Which.', widget: 'postiz_pipeline' },
        channels: { type: 'array', default: [], title: 'Channels', description: 'Which.', widget: 'postiz_channels' },
        choice: { anyOf: [{ type: 'string' }, { type: 'null' }], default: null, hidden: true },
      },
    },
  };

  it('draws the folder, pipeline and channel pickers from the live lists and saves a choice in the step', async () => {
    vi.spyOn(postizLookup, 'folders').mockResolvedValue(FOLDERS);
    vi.spyOn(postizLookup, 'pipelines').mockResolvedValue(PIPELINES);
    const onValue = vi.fn();
    const step: StageStep = { key: 'postiz_export', enabled: true, settings: { pipelineId: 'p2' } };
    render(<StageSettings step={step} info={info} position={4} total={4} drafts={{}} problems={{}} onText={vi.fn()} onValue={onValue} onToggle={vi.fn()} onRemove={vi.fn()} />);
    await waitFor(() => expect(onValue).toHaveBeenCalledWith(expect.objectContaining({ name: 'channels', kind: 'widget' }), [expect.objectContaining({ id: 'c2' })]));
    fireEvent.change(await screen.findByLabelText('Media folder'), { target: { value: 'f1' } });
    expect(onValue).toHaveBeenCalledWith(expect.objectContaining({ name: 'folderId' }), 'f1');
    fireEvent.change(screen.getByLabelText('Postiz pipeline'), { target: { value: 'p1' } });
    expect(onValue).toHaveBeenCalledWith(expect.objectContaining({ name: 'pipelineId' }), 'p1');
    expect(screen.queryByText(/This setting cannot be edited here yet/)).toBeNull();
  });
});
