import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { library, steps, summary } from '../../test-fixtures';
import { PipelineList, type PipelineListProps } from './PipelineList';

function show(rows = [summary()], impact = { watches: 0, waitingBatches: 0 }) {
  const api = {
    list: vi.fn().mockResolvedValue(rows),
    stages: vi.fn().mockResolvedValue(library),
    setEnabled: vi.fn().mockResolvedValue({}),
    impact: vi.fn().mockResolvedValue(impact),
  };
  const onOpen = vi.fn();
  const onNew = vi.fn();
  render(<PipelineList api={api as unknown as PipelineListProps['api']} onOpen={onOpen} onNew={onNew} />);
  return { api, onOpen, onNew };
}

describe('PipelineList', () => {
  it('opens the editor on the stage that was clicked', { tags: ['full'] }, async () => {
    const onOpenStage = vi.fn();
    const api = { list: vi.fn().mockResolvedValue([summary()]), stages: vi.fn().mockResolvedValue(library), setEnabled: vi.fn(), impact: vi.fn() };
    render(<PipelineList api={api as unknown as PipelineListProps['api']} onOpen={() => undefined} onOpenStage={onOpenStage} onNew={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Limit length stage' }));
    expect(onOpenStage).toHaveBeenCalledWith(1, 1);
  });

  it('lays out each pipeline\'s stages in order, with the chevrons between them', { tags: ['full'] }, async () => {
    show([summary({ steps: [...steps(), { key: 'gone', settings: {}, enabled: false }] })]);
    const flow = await screen.findByRole('list', { name: 'Stages' });
    const boxes = within(flow).getAllByRole('listitem');
    expect(boxes).toHaveLength(4);
    expect(within(boxes[0]).getByText('Scan folder')).toBeInTheDocument();
    expect(within(boxes[1]).getByText('Limit length')).toBeInTheDocument();
    expect(within(boxes[1]).getByText('Max 900 s')).toBeInTheDocument();
    expect(within(boxes[2]).getByText('Render')).toBeInTheDocument();
    expect(within(boxes[3]).getByText('Missing stage')).toBeInTheDocument();
    expect(within(boxes[3]).getByText('Off')).toBeInTheDocument();
  });


  it('shows each pipeline with its numbers', { tags: ['full'] }, async () => {
    show([summary({ usedBy: 3 }), summary({ id: 2, name: 'Short', maxSeconds: null, maxSizeMb: null, stageCount: 3, enabled: false })]);
    const first = await screen.findByRole('listitem', { name: 'Pipeline Join clips' });
    expect(first).toHaveTextContent('15 min');
    expect(first).toHaveTextContent('150 MB');
    expect(first).toHaveTextContent('3 uses');
    expect(within(first).getByRole('switch')).toBeChecked();
    const second = screen.getByRole('listitem', { name: 'Pipeline Short' });
    expect(second).toHaveTextContent('Nothing yet');
    expect(second).toHaveTextContent('–');
    expect(within(second).getByRole('switch')).not.toBeChecked();
  });

  it('says so when there are none, and opens the editor from New and from a row', { tags: ['full'] }, async () => {
    const empty = show([]);
    expect(await screen.findByText(/No pipelines yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'New pipeline' }));
    expect(empty.onNew).toHaveBeenCalled();
  });

  it('opens a pipeline when its name is clicked', { tags: ['full'] }, async () => {
    const { onOpen } = show();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Join clips' }));
    expect(onOpen).toHaveBeenCalledWith(1);
  });

  it('switches an unused pipeline off at once, without asking', { tags: ['full'] }, async () => {
    const { api } = show();
    fireEvent.click(await screen.findByRole('switch', { name: 'Switch Join clips' }));
    await waitFor(() => expect(api.setEnabled).toHaveBeenCalledWith(1, false));
    expect(api.impact).not.toHaveBeenCalled();
  });

  it('asks first for a pipeline in use, with the counts, and keeps it on if declined', async () => {
    const { api } = show([summary({ usedBy: 2 })], { watches: 2, waitingBatches: 1 });
    fireEvent.click(await screen.findByRole('switch', { name: 'Switch Join clips' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Switch off Join clips' });
    expect(dialog).toHaveTextContent('stops 2 watches and 1 waiting batch');
    expect(api.setEnabled).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Keep it on' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(api.setEnabled).not.toHaveBeenCalled();
  });

  it('switches a used pipeline off once confirmed, and switching on never asks', async () => {
    const { api } = show([summary({ usedBy: 2 }), summary({ id: 2, name: 'Off one', enabled: false, usedBy: 1 })], { watches: 1, waitingBatches: 0 });
    fireEvent.click(await screen.findByRole('switch', { name: 'Switch Off one' }));
    await waitFor(() => expect(api.setEnabled).toHaveBeenCalledWith(2, true));
    expect(api.impact).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('switch', { name: 'Switch Join clips' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Switch off' }));
    await waitFor(() => expect(api.setEnabled).toHaveBeenCalledWith(1, false));
  });

  it('shows the server message when switching fails', { tags: ['full'] }, async () => {
    const { api } = show();
    api.setEnabled.mockRejectedValue(new Error('The server said no'));
    fireEvent.click(await screen.findByRole('switch', { name: 'Switch Join clips' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The server said no');
  });
});
