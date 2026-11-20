import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeCard } from '../../test/fixtures';
import { PassConsole } from './PassConsole';

function api(lines: { at: string; text: string }[]) {
  return { passLog: vi.fn().mockResolvedValue({ lines: lines.map((l) => l.text), entries: lines }) };
}

describe('PassConsole', () => {
  it('shows the pipeline log and the FFmpeg log side by side', async () => {
    const card = makeCard({ status: 'review', batchId: 1, passId: 1 });
    const a = api([{ at: '2026-11-19T10:00:03.000Z', text: 'Scan folder started' }]);
    render(<PassConsole api={a} card={card} now={Date.now()} />);
    expect(await screen.findByRole('list', { name: 'Pipeline log lines' })).toHaveTextContent('Scan folder started');
    expect(screen.getByRole('list', { name: 'FFmpeg log lines' })).toBeInTheDocument();
    await waitFor(() => expect(a.passLog).toHaveBeenCalledWith(1, 'pipeline'));
    expect(a.passLog).toHaveBeenCalledWith(1, 'ffmpeg');
  });

  it('says when a request has gone to the AI and no answer has come back', async () => {
    const card = makeCard({ status: 'running', batchId: 1, passId: 1 });
    const a = api([{ at: '2026-11-19T10:00:04.000Z', text: 'Sending 12 frames of a.mov to nvidia/nemotron' }]);
    render(<PassConsole api={a} card={card} now={Date.parse('2026-11-19T10:00:10.000Z')} />);
    expect(await screen.findByRole('status')).toHaveTextContent(/Waiting for the AI since/);
  });
});
