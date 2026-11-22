import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ScheduleDraft } from '../../lib/types';
import { SchedulePanel } from './SchedulePanel';

const draft: ScheduleDraft = { enabled: true, kind: 'daily', time: '02:00', weekdays: [], dayOfMonth: 1, cron: '0 2 * * *', mode: 'schedule', pollSeconds: 60, settleSeconds: 120, maxFiles: 50 };

function renderPanel(overrides: Partial<Parameters<typeof SchedulePanel>[0]> = {}) {
  const props = {
    draft,
    summary: 'Every day at 02:00',
    nextRun: 'Sun 22 Nov, 02:00',
    saving: false,
    error: null,
    onChange: vi.fn(),
    onSave: vi.fn(),
    ...overrides,
  };
  render(<SchedulePanel {...props} />);
  return props;
}

describe('SchedulePanel', () => {
  it('shows the summary and next run', { tags: ['full'] }, () => {
    renderPanel();
    expect(screen.getByText('Every day at 02:00')).toBeInTheDocument();
    expect(screen.getByText('Next run Sun 22 Nov, 02:00')).toBeInTheDocument();
  });

  it('shows the time field for daily schedules', { tags: ['full'] }, () => {
    renderPanel();
    expect(screen.getByLabelText('Time')).toHaveValue('02:00');
    expect(screen.queryByRole('group', { name: 'Days' })).not.toBeInTheDocument();
  });

  it('shows the day picker for weekly schedules', { tags: ['full'] }, () => {
    renderPanel({ draft: { ...draft, kind: 'weekly', weekdays: [0] } });
    expect(screen.getByRole('button', { name: 'Sunday' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows the cron field for cron schedules', { tags: ['full'] }, () => {
    renderPanel({ draft: { ...draft, kind: 'cron', cron: '5 4 * * 1' } });
    expect(screen.getByLabelText('Cron expression')).toHaveValue('5 4 * * 1');
  });

  it('sends a draft change when the schedule type changes', { tags: ['full'] }, () => {
    const props = renderPanel();
    fireEvent.click(screen.getByRole('radio', { name: 'Monthly' }));
    expect(props.onChange).toHaveBeenCalledWith({ ...draft, kind: 'monthly' });
  });

  it('calls onSave and disables the button while saving', { tags: ['full'] }, () => {
    const props = renderPanel({ saving: true });
    const button = screen.getByRole('button', { name: 'Saving…' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it('shows a save error', { tags: ['full'] }, () => {
    renderPanel({ error: 'Cron has 4 fields' });
    expect(screen.getByRole('alert')).toHaveTextContent('Cron has 4 fields');
  });

  it('switches the collector between a schedule and Auto-collect', () => {
    const props = renderPanel();
    expect(screen.queryByLabelText('Check every (seconds)')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Auto-collect' }));
    expect(props.onChange).toHaveBeenCalledWith({ ...draft, mode: 'auto' });
  });

  it('under Auto-collect shows the look interval, settle time and cap, not the schedule fields, and sends changes', () => {
    const props = renderPanel({ draft: { ...draft, mode: 'auto' } });
    expect(screen.getByLabelText('Check every (seconds)')).toHaveValue(60);
    expect(screen.getByLabelText('Wait until still for (seconds)')).toHaveValue(120);
    expect(screen.getByLabelText('Most files per run')).toHaveValue(50);
    expect(screen.queryByLabelText('Time')).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Weekly' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Check every (seconds)'), { target: { value: '90' } });
    expect(props.onChange).toHaveBeenLastCalledWith({ ...draft, mode: 'auto', pollSeconds: 90 });
  });

  it('says how many matching files are waiting before the first run', () => {
    renderPanel({ draft: { ...draft, mode: 'auto' }, waiting: 12 });
    expect(screen.getByText('12 matching files are waiting. The first run will take them.')).toBeInTheDocument();
  });
});
