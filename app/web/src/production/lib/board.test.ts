import { describe, expect, it } from 'vitest';
import { makeCard } from '../test/fixtures';
import { COLUMNS, chipLabel, clock, columnOf, groupCards, queueCaption, stageSegments, subtitle, toneOf } from './board';

describe('column order', () => {
  it('lists the columns Queued, Running, Needs attention, Ready to review', () => {
    expect(COLUMNS).toEqual(['queued', 'running', 'attention', 'review']);
  });
});

describe('columnOf', () => {
  it.each([
    ['review', 'review'],
    ['blocked', 'attention'],
    ['failed', 'attention'],
    ['running', 'running'],
    ['queued', 'queued'],
    ['approved', 'approved'],
  ] as const)('puts a %s batch in %s', (status, column) => {
    expect(columnOf(makeCard({ status }))).toBe(column);
  });
});

describe('groupCards', () => {
  it('sorts queued by queue position, keeps running order and shows newest batches first elsewhere', () => {
    const q2 = makeCard({ status: 'queued', queuePosition: 2 });
    const q0 = makeCard({ status: 'queued', queuePosition: 0 });
    const lost = makeCard({ status: 'queued', queuePosition: null });
    const r1 = makeCard({ status: 'running', batchId: 50 });
    const r2 = makeCard({ status: 'running', batchId: 40 });
    const old = makeCard({ status: 'review', batchId: 1 });
    const fresh = makeCard({ status: 'review', batchId: 99 });
    const groups = groupCards([q2, q0, lost, r1, r2, old, fresh]);
    expect(groups.queued).toEqual([q0, q2, lost]);
    expect(groups.running).toEqual([r1, r2]);
    expect(groups.review).toEqual([fresh, old]);
    expect(groups.attention).toEqual([]);
    expect(groups.approved).toEqual([]);
  });
});

describe('subtitle', () => {
  it('lists the non-empty parts', () => {
    const cards = [
      makeCard({ status: 'review' }), makeCard({ status: 'review' }), makeCard({ status: 'failed' }), makeCard({ status: 'blocked' }),
      makeCard({ status: 'running' }), makeCard({ status: 'queued' }), makeCard({ status: 'queued' }), makeCard({ status: 'approved' }),
    ];
    expect(subtitle(cards)).toBe('8 batches · 2 queued · 1 running · 2 need attention · 2 ready to review');
  });

  it('leaves out zero parts, says batch for one, and handles an empty board', () => {
    expect(subtitle([makeCard({ status: 'running' })])).toBe('1 batch · 1 running');
    expect(subtitle([])).toBe('No batches yet');
  });
});

describe('labels and tones', () => {
  it.each([
    ['review', 'Ready', 'ok'],
    ['blocked', 'Blocked', 'warn'],
    ['failed', 'Failed', 'bad'],
    ['running', 'Running', 'info'],
    ['queued', 'Queued', 'info'],
    ['approved', 'Approved', 'ok'],
  ] as const)('%s is "%s" with tone %s', (status, label, tone) => {
    const card = makeCard({ status });
    expect(chipLabel(card)).toBe(label);
    expect(toneOf(card)).toBe(tone);
  });
});

describe('stageSegments', () => {
  it('marks done, current and to-do stages while running', () => {
    expect(stageSegments(makeCard({ status: 'running', stagePosition: 3, stageCount: 5 }))).toEqual(['done', 'done', 'run', 'todo', 'todo']);
  });
  it('stops at the stage where a batch is blocked or failed', () => {
    expect(stageSegments(makeCard({ status: 'blocked', stagePosition: 3 }))).toEqual(['done', 'done', 'run', 'todo', 'todo']);
    expect(stageSegments(makeCard({ status: 'failed', stagePosition: 1 }))).toEqual(['run', 'todo', 'todo', 'todo', 'todo']);
  });
  it('is all done for finished batches and all to do when queued', () => {
    expect(stageSegments(makeCard({ status: 'review', stagePosition: 5 }))).toEqual(['done', 'done', 'done', 'done', 'done']);
    expect(stageSegments(makeCard({ status: 'queued' }))).toEqual(['todo', 'todo', 'todo', 'todo', 'todo']);
  });
  it('shows a pass that failed before any stage started as not started, and a starting pass at its first stage', () => {
    expect(stageSegments(makeCard({ status: 'failed', stagePosition: 0 }))).toEqual(['todo', 'todo', 'todo', 'todo', 'todo']);
    expect(stageSegments(makeCard({ status: 'running', stagePosition: 0 }))).toEqual(['run', 'todo', 'todo', 'todo', 'todo']);
  });
  it('copes with no stages or an out-of-range position', () => {
    expect(stageSegments(makeCard({ stageCount: 0 }))).toEqual([]);
    expect(stageSegments(makeCard({ status: 'running', stagePosition: 9, stageCount: 3 }))).toEqual(['done', 'done', 'run']);
  });
});

describe('queueCaption', () => {
  it('says Next, then how many batches come first', () => {
    expect(queueCaption(makeCard({ queuePosition: 0 }))).toBe('Next');
    expect(queueCaption(makeCard({ queuePosition: 1 }))).toBe('Starts after 1 batch');
    expect(queueCaption(makeCard({ queuePosition: 3 }))).toBe('Starts after 3 batches');
    expect(queueCaption(makeCard({ queuePosition: null }))).toBe('');
  });
});

describe('clock', () => {
  it('formats seconds as mm:ss', () => {
    expect(clock(58.4)).toBe('00:58');
    expect(clock(125)).toBe('02:05');
    expect(clock(3725)).toBe('62:05');
    expect(clock(-3)).toBe('00:00');
    expect(clock(Number.NaN)).toBe('00:00');
  });
});

describe('a status this version does not know', () => {
  const odd = () => makeCard({ status: 'paused' as never });

  it('lands in Needs attention instead of breaking the board', () => {
    expect(columnOf(odd())).toBe('attention');
    expect(groupCards([makeCard({ status: 'queued' }), odd()]).attention).toHaveLength(1);
    expect(subtitle([makeCard({ status: 'queued' }), odd()])).toBe('2 batches · 1 queued · 1 need attention');
  });

  it('shows the raw status as its label with a warning tone', () => {
    expect(chipLabel(odd())).toBe('paused');
    expect(toneOf(odd())).toBe('warn');
    expect(stageSegments(odd())).toHaveLength(5);
  });
});

describe('stageSegments limits', () => {
  it('never builds more than 50 segments, however many stages the server claims', () => {
    expect(stageSegments(makeCard({ status: 'queued', stageCount: 5_000_000 }))).toHaveLength(50);
  });
});
