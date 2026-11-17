import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { makeCollector } from './collection/test/fixtures';

const collector = makeCollector();

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
}

function mockBackend(handlers: Record<string, () => Promise<Response>>) {
  const fetchMock = vi.fn((url: string) => {
    const handler = handlers[url];
    return handler ? handler() : jsonResponse({ detail: 'not found' }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('App sections', () => {
  const second = makeCollector({ id: 2, name: 'Class Tuesdays' });

  function mockBoth(boardCalls: { count: number } = { count: 0 }) {
    return mockBackend({
      '/api/collectors': () => jsonResponse([collector, second]),
      '/api/collectors/1/runs': () => jsonResponse([]),
      '/api/collectors/2/runs': () => jsonResponse([]),
      '/api/production/batches': () => {
        boardCalls.count += 1;
        return jsonResponse([]);
      },
    });
  }

  it('switches to the Production board and back to Collection from the tabs', async () => {
    mockBoth();
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Coach Saturdays', level: 1 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Production' }));
    expect(await screen.findByRole('heading', { name: 'Production', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Production' })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(screen.getByRole('button', { name: 'Collection' }));
    expect(await screen.findByRole('heading', { name: 'Coach Saturdays', level: 1 })).toBeInTheDocument();
  });

  it('keeps one header that does not remount on a tab click', async () => {
    mockBoth();
    render(<App />);
    await screen.findByRole('heading', { name: 'Coach Saturdays', level: 1 });
    expect(screen.getAllByRole('banner')).toHaveLength(1);
    const tab = screen.getByRole('button', { name: 'Production' });
    tab.focus();
    fireEvent.click(tab);
    await screen.findByRole('heading', { name: 'Production', level: 1 });
    expect(screen.getByRole('button', { name: 'Production' })).toBe(tab);
    expect(document.activeElement).toBe(tab);
  });

  it('keeps the selected collector when the user visits Production and comes back', async () => {
    mockBoth();
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /Class Tuesdays/ }));
    expect(await screen.findByRole('heading', { name: 'Class Tuesdays', level: 1 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Production' }));
    await screen.findByRole('heading', { name: 'Production', level: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Collection' }));
    expect(await screen.findByRole('heading', { name: 'Class Tuesdays', level: 1 })).toBeInTheDocument();
  });

  it('does not lose an unsaved collector edit when the user clicks another tab', async () => {
    mockBackend({
      '/api/collectors': () => jsonResponse([collector, second]),
      '/api/collectors/1/runs': () => jsonResponse([]),
      '/api/preview/folder': () => jsonResponse({ relativePath: '2026-11-14_Sat_coach', fullPath: '/x' }),
      '/api/preview/filters': () => jsonResponse({ clips: [], selectedCount: 0, total: 0, truncated: false }),
      '/api/production/batches': () => jsonResponse([]),
    });
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    const name = await screen.findByLabelText('Name');
    fireEvent.change(name, { target: { value: 'Typed but not saved' } });
    fireEvent.click(screen.getByRole('button', { name: 'Production' }));
    await screen.findByRole('heading', { name: 'Production', level: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Collection' }));
    expect(await screen.findByLabelText('Name')).toHaveValue('Typed but not saved');
  });

  it('stops refreshing a running collector while the user is on Production', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const calls = { runs: 0 };
      mockBackend({
        '/api/collectors': () => jsonResponse([collector]),
        '/api/collectors/1/runs': () => {
          calls.runs += 1;
          return jsonResponse([{ id: 1, collectorId: 1, startedAt: '2026-11-17T10:00:00+00:00', trigger: 'manual', status: 'running', outcome: '', canUndo: false }]);
        },
        '/api/production/batches': () => jsonResponse([]),
      });
      render(<App />);
      await screen.findByRole('heading', { name: 'Coach Saturdays', level: 1 });
      fireEvent.click(screen.getByRole('button', { name: 'Production' }));
      await screen.findByRole('heading', { name: 'Production', level: 1 });
      const seen = calls.runs;
      await vi.advanceTimersByTimeAsync(10000);
      expect(calls.runs).toBe(seen);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops refreshing the board once the user leaves it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const calls = { count: 0 };
      mockBackend({
        '/api/collectors': () => jsonResponse([collector]),
        '/api/collectors/1/runs': () => jsonResponse([]),
        '/api/production/batches': () => {
          calls.count += 1;
          return jsonResponse([{ batchId: 1, passId: 1, name: 'Busy', inputFolder: '/in', pipeline: ['A'], status: 'running', stageTitle: 'A', stagePosition: 1, stageCount: 1, passNumber: 1, queuePosition: null, runOn: 'any', startedAt: null, blockedReason: null, blockedChoices: [], error: null, output: null }]);
        },
      });
      render(<App />);
      fireEvent.click(await screen.findByRole('button', { name: 'Production' }));
      await screen.findByText('Busy');
      fireEvent.click(screen.getByRole('button', { name: 'Collection' }));
      const seen = calls.count;
      await vi.advanceTimersByTimeAsync(20000);
      expect(calls.count).toBe(seen);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('App', () => {
  it('shows the collector, history and schedule once data loads', async () => {
    mockBackend({
      '/api/collectors': () => jsonResponse([collector]),
      '/api/collectors/1/runs': () => jsonResponse([]),
    });
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Coach Saturdays', level: 1 })).toBeInTheDocument();
    expect(await screen.findByText(/No runs yet/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Schedule' })).toBeInTheDocument();
  });

  it('shows an error state when the backend is down', async () => {
    mockBackend({ '/api/collectors': () => Promise.resolve(new Response('down', { status: 503 })) });
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t reach the backend');
  });

  it('shows the empty state when there are no collectors', async () => {
    mockBackend({ '/api/collectors': () => jsonResponse([]) });
    render(<App />);
    expect(await screen.findByText('No collectors yet.')).toBeInTheDocument();
  });

  it('saves the schedule and reloads collectors', async () => {
    const fetchMock = mockBackend({
      '/api/collectors': () => jsonResponse([collector]),
      '/api/collectors/1/runs': () => jsonResponse([]),
      '/api/collectors/1/schedule': () => jsonResponse(collector),
    });
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Save schedule' }));
    await waitFor(() => {
      const saveCall = fetchMock.mock.calls.find(([url]) => url === '/api/collectors/1/schedule');
      expect(saveCall).toBeDefined();
    });
  });

  it('opens the edit screen from the Edit button and returns on Cancel', async () => {
    mockBackend({
      '/api/collectors': () => jsonResponse([collector]),
      '/api/collectors/1/runs': () => jsonResponse([]),
      '/api/preview/folder': () => jsonResponse({ relativePath: '2026-11-14_Sat_coach', fullPath: '/x/2026-11-14_Sat_coach' }),
    });
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    expect(await screen.findByRole('heading', { name: 'Edit Collector' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('heading', { name: 'Coach Saturdays', level: 1 })).toBeInTheDocument();
  });

  const plan = {
    transfer: 'move',
    totalFiles: 2,
    totalBytes: 2048,
    folderCount: 1,
    groups: [{ folder: '2026-11-14_Sat_coach', path: '/out/2026-11-14_Sat_coach', renamed: false, count: 2, bytes: 2048, sample: ['a.mp4', 'b.mp4'] }],
    notes: ['Dates come from file modified time.'],
    unmatched: 0,
    notSelected: 0,
    leftInPlace: 0,
    leftSample: [],
  };
  const finishedRun = { id: 5, collectorId: 1, startedAt: 'Sat 14 Nov, 18:40', trigger: 'manual', status: 'done', outcome: 'Moved 2 clips into 1 folder', canUndo: true };

  it('Dry run shows the plan and changes nothing', async () => {
    const fetchMock = mockBackend({
      '/api/collectors': () => jsonResponse([collector]),
      '/api/collectors/1/runs': () => jsonResponse([]),
      '/api/collectors/1/dry-run': () => jsonResponse(plan),
    });
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Dry run' }));
    expect(await screen.findByText('2026-11-14_Sat_coach')).toBeInTheDocument();
    expect(screen.getByText('Preview only')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/collectors/1/run')).toBe(false);
  });

  it('Run now shows the plan first and only starts the run after confirming', async () => {
    const fetchMock = mockBackend({
      '/api/collectors': () => jsonResponse([collector]),
      '/api/collectors/1/runs': () => jsonResponse([]),
      '/api/collectors/1/dry-run': () => jsonResponse(plan),
      '/api/collectors/1/run': () => jsonResponse({ ...finishedRun, status: 'running' }, 202),
    });
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Run now' }));
    const confirm = await screen.findByRole('button', { name: 'Move 2 clips' });
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/collectors/1/run')).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url === '/api/collectors/1/run')).toBe(true));
    await waitFor(() => expect(screen.queryByRole('button', { name: /Move 2 clips|Starting/ })).not.toBeInTheDocument());
  });

  it('shows the reason when a dry run cannot be made', async () => {
    mockBackend({
      '/api/collectors': () => jsonResponse([collector]),
      '/api/collectors/1/runs': () => jsonResponse([]),
      '/api/collectors/1/dry-run': () => jsonResponse({ detail: 'Input folder not found: /nope' }, 422),
    });
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Dry run' }));
    expect(await screen.findByText('Input folder not found: /nope')).toBeInTheDocument();
  });

  it('shows why a run could not be started and stays open', async () => {
    mockBackend({
      '/api/collectors': () => jsonResponse([collector]),
      '/api/collectors/1/runs': () => jsonResponse([]),
      '/api/collectors/1/dry-run': () => jsonResponse(plan),
      '/api/collectors/1/run': () => jsonResponse({ detail: 'SSH sources can’t be scanned yet' }, 422),
    });
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Run now' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Move 2 clips' }));
    expect(await screen.findByText('SSH sources can’t be scanned yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move 2 clips' })).toBeEnabled();
  });

  it('Undo calls the API and refreshes the history', async () => {
    const fetchMock = mockBackend({
      '/api/collectors': () => jsonResponse([collector]),
      '/api/collectors/1/runs': () => jsonResponse([finishedRun]),
      '/api/runs/5/undo': () => jsonResponse({ ...finishedRun, canUndo: false }),
    });
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url === '/api/runs/5/undo')).toBe(true));
  });

  it('shows an error when Undo fails', async () => {
    mockBackend({
      '/api/collectors': () => jsonResponse([collector]),
      '/api/collectors/1/runs': () => jsonResponse([finishedRun]),
      '/api/runs/5/undo': () => jsonResponse({ detail: 'This run can’t be undone' }, 409),
    });
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(await screen.findByText('This run can’t be undone')).toBeInTheDocument();
  });

  it('polls while a run is running, shows progress and disables Run now', async () => {
    let calls = 0;
    mockBackend({
      '/api/collectors': () => jsonResponse([collector]),
      '/api/collectors/1/runs': () => {
        calls += 1;
        return jsonResponse([calls === 1 ? { ...finishedRun, status: 'running', outcome: 'Moving 1 of 2…', canUndo: false } : finishedRun]);
      },
    });
    render(<App />);
    expect(await screen.findByText('Moving 1 of 2…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run now' })).toBeDisabled();
    expect(await screen.findByText('Moved 2 clips into 1 folder', {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run now' })).toBeEnabled();
  });

  it('opens the edit screen even when the backend is older and sends no filter settings', async () => {
    const { filters, dateSource, filenamePattern, ...oldConfig } = collector.config;
    void filters; void dateSource; void filenamePattern;
    mockBackend({
      '/api/collectors': () => jsonResponse([{ ...collector, config: oldConfig }]),
      '/api/collectors/1/runs': () => jsonResponse([]),
      '/api/preview/folder': () => jsonResponse({ relativePath: 'x', fullPath: '/x' }),
    });
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    expect(await screen.findByRole('heading', { name: 'Edit Collector' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Filters' })).toBeInTheDocument();
    expect(screen.getByText(/every video file in the input folder is collected/)).toBeInTheDocument();
  });

  it('tells you to restart the backend when saving to an older one', async () => {
    const { filters, dateSource, filenamePattern, ...oldConfig } = collector.config;
    void filters; void dateSource; void filenamePattern;
    const old = { ...collector, config: oldConfig };
    mockBackend({
      '/api/collectors': () => jsonResponse([old]),
      '/api/collectors/1/runs': () => jsonResponse([]),
      '/api/preview/folder': () => jsonResponse({ relativePath: 'x', fullPath: '/x' }),
      '/api/collectors/1': () => jsonResponse(old),
    });
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Save collector' }));
    expect(await screen.findByText(/backend is out of date/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Edit Collector' })).toBeInTheDocument();
  });
});
