import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ExportRecord } from './lib/api';
import { OutputPage } from './OutputPage';

const record = (over: Partial<ExportRecord> = {}): ExportRecord => ({
  id: 1, cardId: 4, sha256: 'abc', status: 'queued', mediaId: 'm1', queueId: 'q1', pipelineId: 'p1', folder: 'f1', postType: 'schedule',
  caption: 'Hello', message: '', createdAt: '2026-11-21T10:00:00+00:00', updatedAt: '2026-11-21T10:05:00+00:00', batchName: 'Saturday class', cardNumber: 2, ...over,
});
const show = (rows: ExportRecord[]) => render(<OutputPage api={{ exports: vi.fn().mockResolvedValue(rows) }} />);

describe('OutputPage', () => {
  it('lists each export with its IDs', async () => {
    show([record()]);
    const row = (await screen.findByText('Saturday class')).closest('tr') as HTMLElement;
    expect(within(row).getByText('Queued')).toBeInTheDocument();
    for (const text of ['2', 'p1', 'm1', 'q1']) expect(within(row).getByText(text)).toBeInTheDocument();
  });

  it('shows the empty state', async () => {
    show([]);
    expect(await screen.findByText('Nothing has been posted yet')).toBeInTheDocument();
  });

  it('marks an unclear export and shows the message of a failed one', async () => {
    show([record({ id: 2, status: 'unclear', queueId: null, message: 'no queue id' }), record({ id: 3, status: 'failed', queueId: null, message: 'Postiz said 401' })]);
    expect(await screen.findByText('Check Postiz before trying again')).toBeInTheDocument();
    expect(screen.getByText('Postiz said 401')).toBeInTheDocument();
  });

  it('shows the error when the list cannot load', async () => {
    render(<OutputPage api={{ exports: vi.fn().mockRejectedValue(new Error('Server down')) }} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Server down');
  });
});
