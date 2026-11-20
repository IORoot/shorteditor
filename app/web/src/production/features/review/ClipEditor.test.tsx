import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ClipRow } from '../../lib/clips';
import { ClipEditor } from './ClipEditor';
import { TrimTimeline } from './TrimTimeline';

const row: ClipRow = { name: 'a.mp4', length: 10, parts: [{ start: 2, end: 4 }, { start: 6, end: 8 }], trims: [], stillAt: 2, found: 'found' };

function setup(over: Partial<ClipRow> = {}, running = false) {
  const api = {
    saveTrims: vi.fn().mockResolvedValue({}),
    resetTrims: vi.fn().mockResolvedValue({}),
    clipUrl: (passId: number, clip: string) => `/api/production/passes/${passId}/clip?clip=${clip}`,
  };
  const onSaved = vi.fn();
  const onClose = vi.fn();
  render(<ClipEditor api={api} passId={9} row={{ ...row, ...over }} running={running} onSaved={onSaved} onClose={onClose} />);
  return { api, onSaved, onClose };
}

describe('ClipEditor', () => {
  it('starts from the AI parts when the clip has no trims of its own, and plays the clip', () => {
    const { } = setup();
    expect(screen.getByRole('button', { name: 'AI parts' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('list', { name: 'Parts list' })).toHaveTextContent('2.00');
    expect(document.querySelector('video')).toHaveAttribute('src', '/api/production/passes/9/clip?clip=a.mp4');
  });

  it('starts from the trims of its own when it has some', () => {
    setup({ trims: [{ start: 1, end: 3 }] });
    expect(screen.getByRole('button', { name: 'My trims' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Start of part 1')).toHaveValue(1);
  });

  it('changes a part from its typed start and end', () => {
    setup();
    fireEvent.change(screen.getByLabelText('End of part 1'), { target: { value: '3.5' } });
    expect(screen.getByLabelText('End of part 1')).toHaveValue(3.5);
  });

  it('deletes a part from the list', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Delete part 1' }));
    // the second part becomes the first
    expect(screen.getByLabelText('Start of part 1')).toHaveValue(6);
    expect(screen.queryByLabelText('Start of part 2')).toBeNull();
  });

  it('saves the parts as this clip\'s trims, then tells the page to read the card again', async () => {
    const { api, onSaved } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Delete part 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save trims' }));
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(api.saveTrims).toHaveBeenCalledWith(9, 'a.mp4', [{ start: 6, end: 8 }]);
  });

  it('does not save a list that is the same as the AI parts: it removes the trims instead', async () => {
    const { api, onSaved } = setup({ trims: [{ start: 1, end: 3 }] });
    fireEvent.click(screen.getByRole('button', { name: 'AI parts' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save trims' }));
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(api.resetTrims).toHaveBeenCalledWith(9, 'a.mp4');
    expect(api.saveTrims).not.toHaveBeenCalled();
  });

  it('keeps Save off until the parts change', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Save trims' })).toBeDisabled();
  });

  it('refuses to save an empty list and says what to do', () => {
    const { api } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Delete part 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete part 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save trims' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Keep at least one part');
    expect(api.saveTrims).not.toHaveBeenCalled();
  });

  it('resets a clip to the AI parts only when it has trims of its own', () => {
    const { api } = setup({ trims: [{ start: 1, end: 3 }] });
    fireEvent.click(screen.getByRole('button', { name: 'Reset to AI' }));
    expect(api.resetTrims).toHaveBeenCalledWith(9, 'a.mp4');
  });

  it('turns the whole clip into one part with the same controls', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Whole clip' }));
    expect(screen.getByLabelText('End of part 1')).toHaveValue(10);
  });

  it('locks the editing while the card runs', () => {
    setup({}, true);
    expect(screen.getByRole('button', { name: 'Save trims' })).toBeDisabled();
    expect(screen.getByLabelText('Start of part 1')).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('The card is running');
  });

  it('goes back to the output', () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Back to output' }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('TrimTimeline', () => {
  it('selects a part when it is clicked, and removes the selected part with Delete', () => {
    const onChange = vi.fn();
    const onSelect = vi.fn();
    render(<TrimTimeline length={10} aiParts={[]} draft={[{ start: 1, end: 2 }, { start: 4, end: 6 }]} selected={1} disabled={false} onChange={onChange} onSelect={onSelect} onRefused={vi.fn()} />);
    fireEvent.pointerDown(screen.getByRole('img', { name: /Part 1,/ }), { pointerId: 1 });
    expect(onSelect).toHaveBeenCalledWith(0);
    fireEvent.keyDown(screen.getByRole('group', { name: 'Clip timeline' }), { key: 'Delete' });
    expect(onChange).toHaveBeenCalledWith([{ start: 1, end: 2 }]);
  });

  it('draws nothing to edit while disabled', () => {
    const onChange = vi.fn();
    render(<TrimTimeline length={10} aiParts={[]} draft={[{ start: 1, end: 2 }]} selected={0} disabled onChange={onChange} onSelect={vi.fn()} onRefused={vi.fn()} />);
    fireEvent.keyDown(screen.getByRole('group', { name: 'Clip timeline' }), { key: 'Delete' });
    expect(onChange).not.toHaveBeenCalled();
  });
});
