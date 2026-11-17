import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { detail, library, steps } from '../../test-fixtures';
import { PipelineEditor, type PipelineEditorProps } from './PipelineEditor';

function show({ id = 1 as number | null, existing = detail(), errors = [] as string[], lib = library } = {}) {
  const api = {
    get: vi.fn().mockResolvedValue(existing),
    template: vi.fn().mockResolvedValue(steps()),
    stages: vi.fn().mockResolvedValue(lib),
    check: vi.fn().mockResolvedValue(errors),
    create: vi.fn().mockResolvedValue({ id: 5 }),
    save: vi.fn().mockResolvedValue({ id: 1 }),
    duplicate: vi.fn().mockResolvedValue({ id: 9 }),
    deletePipeline: vi.fn().mockResolvedValue(undefined),
  };
  const onOpen = vi.fn();
  const onClose = vi.fn();
  render(<PipelineEditor api={api as unknown as PipelineEditorProps['api']} id={id} onOpen={onOpen} onClose={onClose} />);
  return { api, onOpen, onClose };
}

const ready = async () => screen.findByRole('listitem', { name: 'Stage 1 Scan folder' });
const save = () => screen.getByRole('button', { name: 'Save pipeline' });
const stageTitles = () => screen.getAllByRole('listitem').filter((li) => /^Stage \d/.test(li.getAttribute('aria-label') ?? '')).map((li) => li.getAttribute('aria-label'));

describe('PipelineEditor', () => {
  it('shows the name, the stages, the first stage settings and a valid check', { tags: ['full'] }, async () => {
    show();
    await ready();
    expect(screen.getByLabelText('Name')).toHaveValue('Join clips');
    expect(stageTitles()).toEqual(['Stage 1 Scan folder', 'Stage 2 Limit length', 'Stage 3 Render']);
    expect(within(screen.getByRole('region', { name: 'Settings' })).getByLabelText('Max files')).toHaveValue('5000');
    expect(await screen.findByText('The order is valid')).toBeInTheDocument();
  });

  it('reorders, switches and removes stages', { tags: ['full'] }, async () => {
    show();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Select Limit length 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move Limit length up' }));
    expect(stageTitles()).toEqual(['Stage 1 Limit length', 'Stage 2 Scan folder', 'Stage 3 Render']);
    fireEvent.click(screen.getByRole('button', { name: 'Select Render 3' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Use Render' }));
    expect(screen.getByRole('switch', { name: 'Use Render' })).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Select Scan folder 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Scan folder' }));
    expect(stageTitles()).toEqual(['Stage 1 Limit length', 'Stage 2 Render']);
  });

  it('drags a stage to a new place and shows where it will drop', async () => {
    show();
    await ready();
    const grip = screen.getByRole('button', { name: 'Drag Scan folder 1' });
    fireEvent.pointerDown(grip);
    fireEvent.pointerMove(grip, { clientY: 500 });
    expect(screen.getByTestId('drop-line')).toBeInTheDocument();
    fireEvent.pointerUp(grip);
    expect(stageTitles()).toEqual(['Stage 1 Limit length', 'Stage 2 Render', 'Stage 3 Scan folder']);
    expect(screen.queryByTestId('drop-line')).toBeNull();
  });

  it('drops a dragged stage into the gap the line showed', async () => {
    const rows = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const index = Array.from(this.parentElement?.querySelectorAll(':scope > li[data-row]') ?? []).indexOf(this);
      return { top: index * 100, height: 100, bottom: index * 100 + 100, left: 0, right: 0, width: 0, x: 0, y: index * 100, toJSON: () => ({}) } as DOMRect;
    });
    show();
    await ready();
    const grip = screen.getByRole('button', { name: 'Drag Scan folder 1' });
    fireEvent.pointerDown(grip);
    fireEvent.pointerMove(grip, { clientY: 200 }); // between Limit length and Render
    expect(screen.getByTestId('drop-line')).toBeInTheDocument();
    fireEvent.pointerUp(grip);
    rows.mockRestore();
    expect(stageTitles()).toEqual(['Stage 1 Limit length', 'Stage 2 Scan folder', 'Stage 3 Render']);
  });

  it('adds a stage with its defaults and selects it', { tags: ['full'] }, async () => {
    show();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Add stage' }));
    const dialog = screen.getByRole('dialog', { name: 'Add a stage' });
    fireEvent.click(within(within(dialog).getByText('Limit length').closest('li') as HTMLElement).getByRole('button', { name: 'Add' }));
    expect(stageTitles()).toHaveLength(4);
    expect(screen.getByLabelText('Max length (seconds)')).toHaveValue('900');
    const choice = within(screen.getByRole('radiogroup', { name: 'When a batch is over the limit' }));
    expect(choice.getByRole('radio', { name: 'Ask me' })).toHaveAttribute('aria-checked', 'true');
  });

  it('edits a number and saves exactly what was typed, then closes', async () => {
    const { api, onClose } = show();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Select Limit length 2' }));
    fireEvent.change(screen.getByLabelText('Max length (seconds)'), { target: { value: '45' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Short' } });
    await screen.findByText('The order is valid');
    await waitFor(() => expect(save()).toBeEnabled());
    fireEvent.click(save());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const [id, body] = api.save.mock.calls[0];
    expect(id).toBe(1);
    expect(body.name).toBe('Short');
    expect(body.steps[1].settings).toEqual({ maxSeconds: 45 });
  });

  it('stores an emptied "choice" or "size" as null', { tags: ['full'] }, async () => {
    const { api } = show();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Select Render 3' }));
    fireEvent.change(screen.getByLabelText('Max size mb'), { target: { value: '' } });
    await waitFor(() => expect(save()).toBeEnabled());
    fireEvent.click(save());
    await waitFor(() => expect(api.save).toHaveBeenCalled());
    expect(api.save.mock.calls[0][1].steps[2].settings).toEqual({ maxSizeMb: null });
  });

  it('will not save a bad number, and says what is wrong', { tags: ['full'] }, async () => {
    show();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Select Limit length 2' }));
    fireEvent.change(screen.getByLabelText('Max length (seconds)'), { target: { value: 'abc' } });
    expect(screen.getByText('Use a number like 45 or 30.5')).toBeInTheDocument();
    await screen.findByText('The order is valid');
    expect(save()).toBeDisabled();
  });

  it('will not save without a name or while the check reports a problem', async () => {
    show({ errors: ['Render must be last'] });
    await ready();
    expect(await screen.findByText('Render must be last')).toBeInTheDocument();
    expect(save()).toBeDisabled();
  });

  it('will not save an empty name', { tags: ['full'] }, async () => {
    show();
    await ready();
    await screen.findByText('The order is valid');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '  ' } });
    expect(save()).toBeDisabled();
  });

  it('shows the server refusal and stays open', { tags: ['full'] }, async () => {
    const { api, onClose } = show();
    api.save.mockRejectedValue(new Error('There is already a pipeline called Join clips'));
    await ready();
    await screen.findByText('The order is valid');
    await waitFor(() => expect(save()).toBeEnabled());
    fireEvent.click(save());
    expect(await screen.findByText('There is already a pipeline called Join clips')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows a stage that no longer exists as missing, read-only, and lets it be removed', { tags: ['full'] }, async () => {
    show({ existing: detail({ steps: [...steps(), { key: 'gone', settings: { x: 1 }, enabled: true }] }) });
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Select Missing stage 4' }));
    expect(screen.getByRole('heading', { name: 'Missing stage' })).toBeInTheDocument();
    expect(screen.getByText(/There is no stage called gone/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Missing stage' }));
    expect(stageTitles()).toHaveLength(3);
  });

  it('keeps a setting it cannot draw unchanged', { tags: ['full'] }, async () => {
    const odd = { ...library[0], settingsSchema: { properties: { weird: { default: {}, type: 'object' } } } };
    const { api } = show({ lib: [odd], existing: detail({ steps: [{ key: 'scan_folder', settings: { weird: { a: 1 } }, enabled: true }] }) });
    await ready();
    expect(screen.getByText('This setting cannot be edited here yet.')).toBeInTheDocument();
    await screen.findByText('The order is valid');
    fireEvent.click(save());
    await waitFor(() => expect(api.save).toHaveBeenCalled());
    expect(api.save.mock.calls[0][1].steps[0].settings).toEqual({ weird: { a: 1 } });
  });

  it('starts a new pipeline from the template and creates it', async () => {
    const { api, onClose } = show({ id: null });
    await ready();
    expect(screen.getByLabelText('Name')).toHaveValue('');
    expect(screen.queryByRole('button', { name: 'Duplicate' })).toBeNull();
    expect(save()).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Mine' } });
    await screen.findByText('The order is valid');
    await waitFor(() => expect(save()).toBeEnabled());
    fireEvent.click(save());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(api.create.mock.calls[0][0]).toMatchObject({ name: 'Mine', description: '' });
  });

  it('duplicates and opens the copy', { tags: ['full'] }, async () => {
    const { onOpen } = show();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith(9));
  });

  it('deletes after confirming, and shows the refusal for a pipeline in use', async () => {
    const { api, onClose } = show();
    await ready();
    api.deletePipeline.mockRejectedValueOnce(new Error('Join clips is used by batch A. Switch it off instead'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete pipeline' }));
    expect(await screen.findByText(/Switch it off instead/)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete pipeline' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('lists what uses the pipeline', { tags: ['full'] }, async () => {
    show({ existing: detail({ usedBy: [{ kind: 'batch', id: 1, name: 'Coach Saturdays', status: 'approved', at: null }, { kind: 'watch', id: 2, name: 'Class folders', status: null, at: null }] }) });
    await ready();
    expect(screen.getByText('Batch Coach Saturdays')).toBeInTheDocument();
    expect(screen.getByText('Watch Class folders')).toBeInTheDocument();
  });
});
