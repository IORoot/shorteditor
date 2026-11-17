import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';
import { Checkbox } from './Checkbox';
import { FormField } from './FormField';
import { SegmentedControl } from './SegmentedControl';
import { StatusChip } from './StatusChip';
import { SelectField } from './SelectField';
import { Toggle } from './Toggle';

describe('Button', () => {
  it('renders as a button with the variant class and calls onClick', { tags: ['full'] }, () => {
    const onClick = vi.fn();
    render(<Button variant="primary" onClick={onClick}>Run now</Button>);
    const button = screen.getByRole('button', { name: 'Run now' });
    expect(button).toHaveClass('btn-primary');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('defaults to the secondary variant and type=button', { tags: ['full'] }, () => {
    render(<Button>Edit</Button>);
    const button = screen.getByRole('button', { name: 'Edit' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button.className).toContain('bg-fill-2');
  });

  it('renders the danger variant', { tags: ['full'] }, () => {
    render(<Button variant="danger">Delete</Button>);
    expect(screen.getByRole('button', { name: 'Delete' }).className).toContain('bg-bad-soft');
  });
});

describe('Toggle', () => {
  it('reports the new checked value', { tags: ['full'] }, () => {
    const onChange = vi.fn();
    render(<Toggle label="Schedule" checked={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Schedule' }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('can be disabled', { tags: ['full'] }, () => {
    render(<Toggle label="Schedule" checked disabled onChange={() => undefined} />);
    expect(screen.getByRole('switch', { name: 'Schedule' })).toBeDisabled();
  });
});

describe('StatusChip', () => {
  it('shows the text with the tone classes', { tags: ['full'] }, () => {
    render(<StatusChip tone="bad">1 failed</StatusChip>);
    const chip = screen.getByText('1 failed');
    expect(chip.className).toContain('text-bad');
  });

  it('uses the ok tone', { tags: ['full'] }, () => {
    render(<StatusChip tone="ok">Done</StatusChip>);
    expect(screen.getByText('Done').className).toContain('text-ok');
  });
});

describe('FormField', () => {
  it('links the label to the input', { tags: ['full'] }, () => {
    render(<FormField label="Cron expression" />);
    expect(screen.getByLabelText('Cron expression')).toBeInTheDocument();
  });

  it('shows the error and marks the input invalid', { tags: ['full'] }, () => {
    render(<FormField label="Time" error="Enter a time" helper="Use 24h" />);
    expect(screen.getByText('Enter a time')).toHaveClass('text-bad');
    expect(screen.getByLabelText('Time')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByText('Use 24h')).not.toBeInTheDocument();
  });

  it('shows helper text when there is no error', { tags: ['full'] }, () => {
    render(<FormField label="Time" helper="Use 24h" />);
    expect(screen.getByText('Use 24h')).toHaveClass('text-text-3');
    expect(screen.getByLabelText('Time')).not.toHaveAttribute('aria-invalid');
  });
});

describe('Checkbox', () => {
  it('reports changes', { tags: ['full'] }, () => {
    const onChange = vi.fn();
    render(<Checkbox label="Undo later" checked={false} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Undo later'));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe('SegmentedControl', () => {
  it('marks the active option and reports the selected value', { tags: ['full'] }, () => {
    const onChange = vi.fn();
    const options = [
      { value: 'daily', label: 'Daily' },
      { value: 'weekly', label: 'Weekly' },
    ] as const;
    render(<SegmentedControl label="Type" options={[...options]} value="daily" onChange={onChange} />);
    expect(screen.getByRole('radio', { name: 'Daily' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('radio', { name: 'Weekly' }));
    expect(onChange).toHaveBeenCalledWith('weekly');
  });
});

describe('SelectField', () => {
  it('shows the options and reports the selected value', { tags: ['full'] }, () => {
    const onChange = vi.fn();
    render(<SelectField label="Scope" value="a" options={[{ value: 'a', label: 'All' }, { value: 'b', label: 'Each' }]} onChange={onChange} />);
    expect(screen.getByLabelText('Scope')).toHaveValue('a');
    fireEvent.change(screen.getByLabelText('Scope'), { target: { value: 'b' } });
    expect(onChange).toHaveBeenCalledWith('b');
  });
});
