import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiClient } from '../../lib/api';
import { ApiError } from '../../../shared/lib/http';
import { makeCollector } from '../../test/fixtures';
import { CollectorList } from './CollectorList';
import { DeleteCollectorDialog } from './DeleteCollectorDialog';
import { NewCollectorDialog } from './NewCollectorDialog';

describe('NewCollectorDialog', () => {
  it('keeps Create disabled until a name is typed', () => {
    const onCreate = vi.fn();
    render(<NewCollectorDialog busy={false} error={null} onCreate={onCreate} onClose={() => undefined} />);
    const create = screen.getByRole('button', { name: 'Create and edit' });
    expect(create).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Coach Saturdays' } });
    fireEvent.click(create);
    expect(onCreate).toHaveBeenCalledWith('Coach Saturdays');
  });

  it('shows the backend error and closes on Cancel', () => {
    const onClose = vi.fn();
    render(<NewCollectorDialog busy={false} error="Give the collector a name" onCreate={() => undefined} onClose={onClose} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Give the collector a name');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('DeleteCollectorDialog', () => {
  it('names the collector and confirms the delete', () => {
    const onConfirm = vi.fn();
    render(<DeleteCollectorDialog collectorName="Coach Saturdays" busy={false} error={null} onConfirm={onConfirm} onClose={() => undefined} />);
    expect(screen.getByText('Delete Coach Saturdays?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete collector' }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('shows why a delete was refused', () => {
    render(<DeleteCollectorDialog collectorName="C" busy={false} error="A run is in progress." onConfirm={() => undefined} onClose={() => undefined} />);
    expect(screen.getByRole('alert')).toHaveTextContent('A run is in progress.');
  });
});

describe('CollectorList new button', () => {
  it('opens the new collector flow', () => {
    const onNew = vi.fn();
    render(<CollectorList state={{ status: 'ready', data: [makeCollector()] }} selectedId={1} onSelect={() => undefined} onToggle={() => undefined} onRetry={() => undefined} onNew={onNew} />);
    fireEvent.click(screen.getByRole('button', { name: 'New collector' }));
    expect(onNew).toHaveBeenCalled();
  });
});

describe('collector API calls', () => {
  it('creates a collector with the name', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(makeCollector({ name: 'New' })), { status: 201 }));
    const created = await new ApiClient(fetchMock).createCollector('New');
    expect(created.name).toBe('New');
    expect(fetchMock).toHaveBeenCalledWith('/api/collectors', expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'New' }) }));
  });

  it('deletes without expecting a body back', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    await expect(new ApiClient(fetchMock).deleteCollector(4)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith('/api/collectors/4', { method: 'DELETE' });
  });

  it('surfaces a refused delete with the backend message', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: 'A run is in progress.' }), { status: 409 }));
    const failure = await new ApiClient(fetchMock).deleteCollector(4).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).message).toBe('A run is in progress.');
  });
});

describe('turning a collector on or off', () => {
  it('shows a turned-off collector as off and offers to turn it on', () => {
    const onToggle = vi.fn();
    render(<CollectorList onNew={() => undefined} state={{ status: 'ready', data: [makeCollector({ active: false })] }} selectedId={1} onSelect={() => undefined} onToggle={onToggle} onRetry={() => undefined} />);
    expect(screen.getByText('Turned off')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch', { name: 'Turn on Coach Saturdays' }));
    expect(onToggle).toHaveBeenCalledWith(1, true);
  });

  it('sends the on/off state to the backend', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(makeCollector({ active: false })), { status: 200 }));
    const updated = await new ApiClient(fetchMock).setActive(1, false);
    expect(updated.active).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith('/api/collectors/1/active', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ active: false }) }));
  });
});
