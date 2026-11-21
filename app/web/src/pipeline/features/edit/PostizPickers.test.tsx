import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { postizLookup } from '../../lib/postizApi';
import type { StageInfo, StageStep } from '../../lib/types';
import { PostizChannelsField, PostizFolderField, channelDefaults, type ChannelChoice } from './PostizPickers';
import { StageSettings } from './StageSettings';

const CHANNELS = [
  { id: 'c1', name: 'London Parkour', identifier: 'instagram' },
  { id: 'c2', name: 'Channel', identifier: 'youtube' },
  { id: 'c3', name: 'ldnpk', identifier: 'facebook' },
];
const FOLDERS = [{ id: 'f1', name: 'Class Clips - Sat' }, { id: 'f2', name: 'Coach Diaries - Sat' }];
const api = (over = {}) => ({ channels: vi.fn().mockResolvedValue(CHANNELS), folders: vi.fn().mockResolvedValue(FOLDERS), ...over });

afterEach(() => vi.restoreAllMocks());

describe('PostizChannelsField defaults and contrast', () => {
  it('turns every live channel on when the stage has never had channels set', async () => {
    const onChange = vi.fn();
    render(<PostizChannelsField label="Channels" help="help" value={[]} unset onChange={onChange} api={api()} />);
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onChange.mock.calls[0][0].map((c: ChannelChoice) => c.id)).toEqual(['c1', 'c2', 'c3']);
  });

  it('leaves an empty list empty once the user has set the channels', async () => {
    const onChange = vi.fn();
    render(<PostizChannelsField label="Channels" help="help" value={[]} onChange={onChange} api={api()} />);
    await screen.findByLabelText('ldnpk (facebook)');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('puts the options of an enabled channel on a surface, not the same grey as its fields', async () => {
    const onChange = vi.fn();
    const chosen: ChannelChoice = { id: 'c1', identifier: 'instagram', name: 'London Parkour', settings: channelDefaults('instagram') };
    render(<PostizChannelsField label="Channels" help="help" value={[chosen]} onChange={onChange} api={api()} />);
    const options = (await screen.findByLabelText('London Parkour post type')).closest('div.ml-7');
    expect(options?.className).toContain('bg-surface');
    expect(options?.className).not.toContain('bg-fill-2');
  });
});

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

describe('PostizChannelsField', () => {
  const chosen: ChannelChoice = { id: 'c1', identifier: 'instagram', name: 'London Parkour', settings: channelDefaults('instagram') };

  it('ticking a channel adds it with the platform defaults', async () => {
    const onChange = vi.fn();
    render(<PostizChannelsField label="Channels" help="help" value={[]} onChange={onChange} api={api()} />);
    fireEvent.click(await screen.findByLabelText('London Parkour (instagram)'));
    expect(onChange).toHaveBeenCalledWith([{ id: 'c1', identifier: 'instagram', name: 'London Parkour', settings: { post_type: 'post', collaborators: [], is_trial_reel: false } }]);
  });

  it('unticking removes the channel', async () => {
    const onChange = vi.fn();
    render(<PostizChannelsField label="Channels" help="help" value={[chosen]} onChange={onChange} api={api()} />);
    fireEvent.click(await screen.findByLabelText('London Parkour (instagram)'));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('a ticked Instagram channel shows its three options and saves them in its settings', async () => {
    const onChange = vi.fn();
    render(<PostizChannelsField label="Channels" help="help" value={[chosen]} onChange={onChange} api={api()} />);
    await screen.findByLabelText('London Parkour (instagram)');
    fireEvent.click(screen.getByRole('radio', { name: 'Story' }));
    expect(onChange).toHaveBeenLastCalledWith([{ ...chosen, settings: { ...chosen.settings, post_type: 'story' } }]);
    fireEvent.change(screen.getByLabelText('London Parkour collaborators'), { target: { value: 'a, b' } });
    expect(onChange).toHaveBeenLastCalledWith([{ ...chosen, settings: { ...chosen.settings, collaborators: ['a', 'b'] } }]);
    fireEvent.click(screen.getByLabelText('London Parkour trial reel'));
    expect(onChange).toHaveBeenLastCalledWith([{ ...chosen, settings: { ...chosen.settings, is_trial_reel: true } }]);
  });

  it('a ticked YouTube channel shows a title and visibility, and other platforms show no options', async () => {
    const youtube: ChannelChoice = { id: 'c2', identifier: 'youtube', name: 'Channel', settings: channelDefaults('youtube') };
    const facebook: ChannelChoice = { id: 'c3', identifier: 'facebook', name: 'ldnpk', settings: {} };
    render(<PostizChannelsField label="Channels" help="help" value={[youtube, facebook]} onChange={vi.fn()} api={api()} />);
    await screen.findByLabelText('Channel (youtube)');
    expect(screen.getByLabelText('Channel title')).toHaveValue('');
    expect(screen.getByRole('radio', { name: 'Public' })).toBeChecked();
    expect(screen.queryByLabelText(/ldnpk title/)).toBeNull();
  });

  it('keeps a saved channel visible when the live list cannot load', async () => {
    render(<PostizChannelsField label="Channels" help="help" value={[chosen]} onChange={vi.fn()} api={api({ channels: vi.fn().mockRejectedValue(new Error('Postiz said 401')) })} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Postiz said 401');
    expect(screen.getByLabelText('London Parkour (instagram)')).toBeChecked();
  });
});

describe('Post-iz settings in the stage form', () => {
  const info: StageInfo = {
    key: 'postiz_export', title: 'Post-iz', description: '', transitions: { video: 'video' }, position: 'last',
    settingsSchema: {
      properties: {
        folderId: { anyOf: [{ type: 'string' }, { type: 'null' }], default: null, title: 'Media folder', description: 'Where.', widget: 'postiz_folder' },
        channels: { type: 'array', default: [], title: 'Channels', description: 'Which.', widget: 'postiz_channels' },
        choice: { anyOf: [{ type: 'string' }, { type: 'null' }], default: null, hidden: true },
      },
    },
  };

  it('draws the folder and channel pickers from the live lists and saves a choice in the step', async () => {
    vi.spyOn(postizLookup, 'folders').mockResolvedValue(FOLDERS);
    vi.spyOn(postizLookup, 'channels').mockResolvedValue(CHANNELS);
    const onValue = vi.fn();
    const step: StageStep = { key: 'postiz_export', enabled: true, settings: {} };
    render(<StageSettings step={step} info={info} position={4} total={4} drafts={{}} problems={{}} onText={vi.fn()} onValue={onValue} onToggle={vi.fn()} onRemove={vi.fn()} />);
    await waitFor(() => expect(onValue).toHaveBeenCalledWith(expect.objectContaining({ name: 'channels', kind: 'widget' }), [expect.objectContaining({ id: 'c1' }), expect.objectContaining({ id: 'c2' }), expect.objectContaining({ id: 'c3' })]));
    fireEvent.change(await screen.findByLabelText('Media folder'), { target: { value: 'f1' } });
    expect(onValue).toHaveBeenCalledWith(expect.objectContaining({ name: 'folderId' }), 'f1');
    expect(screen.queryByText(/This setting cannot be edited here yet/)).toBeNull();
  });
});
