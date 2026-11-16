import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { makeCollector } from './test/fixtures';

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
});
