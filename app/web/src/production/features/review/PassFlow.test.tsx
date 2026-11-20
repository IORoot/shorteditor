import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { makeCard } from '../../test/fixtures';
import type { Pass } from '../../lib/types';
import { PassFlow } from './PassFlow';

const pass = (over: Partial<Pass> = {}): Pass => ({
  id: 1, batchId: 1, number: 1, status: 'running', stageIndex: 1, stageKey: 'detect_action', blockedReason: null, blockedChoices: [], blockedItems: [],
  error: null, output: null, overrides: {}, createdAt: '2026-11-19T10:00:00Z', startedAt: '2026-11-19T10:00:00Z', finishedAt: null,
  stages: [
    { key: 'scan_folder', title: 'Scan folder', status: 'done', startedAt: '2026-11-19T10:00:00Z', finishedAt: '2026-11-19T10:00:02Z' },
    { key: 'detect_action', title: 'Detect action', status: 'running', startedAt: '2026-11-19T10:00:02Z', finishedAt: null },
  ],
  ...over,
});

describe('PassFlow', () => {
  it('shows every stage of the card in order, with the one running marked as the current step', () => {
    const card = makeCard({ status: 'running', pipeline: ['Scan folder', 'Detect action', 'Render'], stageTitle: 'Detect action' });
    render(<PassFlow card={card} pass={pass()} now={Date.parse('2026-11-19T10:00:10Z')} />);
    const stages = screen.getByRole('list', { name: 'Stages' });
    expect(within(stages).getAllByRole('listitem')).toHaveLength(3);
    expect(stages).toHaveTextContent('Scan folder');
    expect(stages).toHaveTextContent('Render');
    expect(screen.getByRole('listitem', { current: 'step' } as never)).toHaveTextContent('Detect action');
    expect(screen.getByText('Waiting')).toBeInTheDocument();
  });

  it('gives the reason and the stage when a pass failed', () => {
    const failed = pass({ status: 'failed', error: 'OpenRouter did not accept the key. Check it in Settings', finishedAt: '2026-11-19T10:01:00Z', stages: [
      { key: 'detect_action', title: 'Detect action', status: 'failed', startedAt: '2026-11-19T10:00:02Z', finishedAt: '2026-11-19T10:01:00Z' },
    ] });
    const card = makeCard({ status: 'failed', pipeline: ['Detect action'], error: 'OpenRouter did not accept the key. Check it in Settings' });
    render(<PassFlow card={card} pass={failed} now={Date.parse('2026-11-19T10:02:00Z')} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Failed in "Detect action"');
    expect(screen.getByText('OpenRouter did not accept the key. Check it in Settings', { selector: 'p' })).toBeInTheDocument();
  });

  it('marks the running stage with the accent box and shows a finished stage as done with its times', () => {
    const card = makeCard({ status: 'running', pipeline: ['Scan folder', 'Detect action', 'Render'], stageTitle: 'Detect action' });
    render(<PassFlow card={card} pass={pass()} now={Date.parse('2026-11-19T10:00:10Z')} />);
    const running = screen.getByRole('listitem', { current: 'step' } as never).firstElementChild as HTMLElement;
    expect(running).toHaveClass('border-accent', 'bg-accent-soft');
    const done = screen.getByText('Scan folder').closest('div')!.parentElement!;
    expect(done).toHaveTextContent('Done');
    expect(done).toHaveTextContent('took 0:02');
  });

  it('says a stage has not started yet when it is still waiting', () => {
    const card = makeCard({ status: 'running', pipeline: ['Scan folder', 'Detect action', 'Render'], stageTitle: 'Detect action' });
    render(<PassFlow card={card} pass={pass()} now={Date.parse('2026-11-19T10:00:10Z')} />);
    expect(screen.getByText('Not started')).toBeInTheDocument();
  });
});
