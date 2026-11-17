import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppShell } from './AppShell';

describe('AppShell', () => {
  it('renders every slot', () => {
    render(
      <AppShell
        sidebar={<p>side</p>}
        title={<h1>title</h1>}
        actions={<button type="button">act</button>}
        main={<p>main</p>}
        panel={<p>panel</p>}
      />,
    );
    for (const text of ['side', 'title', 'main', 'panel']) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'act' })).toBeInTheDocument();
  });

  it('puts the schedule section and the history in the same grid row', () => {
    render(<AppShell sidebar={null} title={null} actions={null} main={<p>main</p>} panel={<p>panel</p>} />);
    const main = screen.getByRole('main');
    const schedule = screen.getByRole('region', { name: 'Schedule' });
    expect(main.className).toContain('row-start-2');
    expect(schedule.className).toContain('row-start-2');
  });
});
