import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeCard } from '../../test/fixtures';
import type { Pass } from '../../lib/types';
import { PassDetail } from './PassDetail';

const pass = (over: Partial<Pass> = {}): Pass => ({
  id: 1, batchId: 1, number: 1, status: 'running', stageIndex: 1, stageKey: 'detect_action', blockedReason: null, blockedChoices: [], blockedItems: [],
  error: null, output: null, createdAt: '2026-11-19T10:00:00Z', startedAt: '2026-11-19T10:00:00Z', finishedAt: null,
  stages: [
    { key: 'scan_folder', title: 'Scan folder', status: 'done', startedAt: '2026-11-19T10:00:00Z', finishedAt: '2026-11-19T10:00:02Z' },
    { key: 'detect_action', title: 'Detect action', status: 'running', startedAt: '2026-11-19T10:00:02Z', finishedAt: null },
  ],
  ...over,
});

function api(passes: Pass[], lines: { at: string; text: string }[]) {
  return {
    batchDetail: vi.fn().mockResolvedValue({ batch: {}, passes }),
    passLog: vi.fn().mockResolvedValue({ lines: lines.map((l) => l.text), entries: lines }),
  };
}

describe('PassDetail', () => {
  it('shows each stage with its start, the stage now running and the lines written so far', { tags: ['full'] }, async () => {
    const card = makeCard({ status: 'running', batchId: 1, passId: 1, passNumber: 1, pipeline: ['Scan folder', 'Detect action', 'Render'], stageTitle: 'Detect action' });
    const a = api([pass()], [{ at: '2026-11-19T10:00:03.000Z', text: 'Scan folder started' }, { at: '2026-11-19T10:00:05.000Z', text: 'Reused the saved result for a.mov' }]);
    render(<PassDetail api={a} card={card} />);
    expect(await screen.findByText('Reused the saved result for a.mov')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Stages' })).toHaveTextContent('Scan folder');
    expect(screen.getByRole('list', { name: 'Stages' })).toHaveTextContent('Render');
    expect(screen.getByText('Waiting')).toBeInTheDocument();
    expect(screen.getByRole('listitem', { current: 'step' } as never)).toHaveTextContent('Detect action');
  });

  it('says when a request has gone to the AI and no answer has come back', { tags: ['full'] }, async () => {
    const card = makeCard({ status: 'running', batchId: 1, passId: 1, passNumber: 1, pipeline: ['Scan folder', 'Detect action'], stageTitle: 'Detect action' });
    const a = api([pass()], [{ at: '2026-11-19T10:00:04.000Z', text: 'Sending 12 frames of a.mov to nvidia/nemotron' }]);
    render(<PassDetail api={a} card={card} />);
    expect(await screen.findByRole('status')).toHaveTextContent(/Waiting for the AI since/);
  });

  it('gives the reason and the stage when a pass failed', { tags: ['full'] }, async () => {
    const failedPass = pass({ status: 'failed', error: 'OpenRouter did not accept the key. Check it in Settings', finishedAt: '2026-11-19T10:01:00Z', stages: [
      { key: 'detect_action', title: 'Detect action', status: 'failed', startedAt: '2026-11-19T10:00:02Z', finishedAt: '2026-11-19T10:01:00Z' },
    ] });
    const card = makeCard({ status: 'failed', batchId: 1, passId: 1, passNumber: 1, pipeline: ['Detect action'], error: 'OpenRouter did not accept the key. Check it in Settings' });
    render(<PassDetail api={api([failedPass], [])} card={card} />);
    expect(await screen.findByText('Failed in "Detect action"')).toBeInTheDocument();
    expect(screen.getByText('OpenRouter did not accept the key. Check it in Settings', { selector: 'p' })).toBeInTheDocument();
  });

  it('reads the batch and its log again while the pass runs', { tags: ['full'] }, async () => {
    const card = makeCard({ status: 'running', batchId: 1, passId: 1, passNumber: 1, pipeline: ['Scan folder'] });
    const a = api([pass({ stages: [] })], []);
    render(<PassDetail api={a} card={card} />);
    await waitFor(() => expect(a.batchDetail).toHaveBeenCalled());
    await waitFor(() => expect(a.passLog).toHaveBeenCalledWith(1, 'pipeline'));
  });
});
