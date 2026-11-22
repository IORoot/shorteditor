import { fireEvent, render, screen, within } from '@testing-library/react';
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

  it('opens one stage at a time: each stage with details has its own toggle and the panel shows only that stage', () => {
    const done = pass({ status: 'review', stageKey: 'render_output', stageIndex: 1, finishedAt: '2026-11-19T10:01:00Z', stages: [
      { key: 'scan_folder', title: 'Scan folder', status: 'done', startedAt: '2026-11-19T10:00:00Z', finishedAt: '2026-11-19T10:00:02Z',
        details: { kind: 'clips', clips: [{ name: 'a.mp4', start: 0, end: 5, length: 5 }], total: 5 } },
      { key: 'render_output', title: 'Render', status: 'done', startedAt: '2026-11-19T10:00:02Z', finishedAt: '2026-11-19T10:01:00Z',
        details: { kind: 'video', name: 'output.mp4', duration: 58, sizeBytes: 149_000_000, width: 1080, height: 1920, fps: 30, attempts: 2 } },
    ] });
    const card = makeCard({ status: 'review', pipeline: ['Scan folder', 'Render'], stageTitle: 'Render' });
    render(<PassFlow card={card} pass={done} now={Date.parse('2026-11-19T10:02:00Z')} />);
    const toggles = screen.getAllByRole('button', { name: 'Details' });
    expect(toggles).toHaveLength(2);
    expect(screen.getByText('149.0 MB')).toBeInTheDocument();
    expect(screen.getByText('Re-rendered once to fit the limit')).toBeInTheDocument();

    fireEvent.click(toggles[1]);
    const panel = screen.getByRole('region', { name: 'Render details' });
    expect(panel).toHaveTextContent('1080 × 1920');
    expect(screen.queryByRole('region', { name: 'Scan folder details' })).toBeNull();
    expect(toggles[1]).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Hide details' }));
    expect(screen.queryByRole('region', { name: 'Render details' })).toBeNull();
  });
});
