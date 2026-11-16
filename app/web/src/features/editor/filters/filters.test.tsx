import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeConfig } from '../../../test/fixtures';
import { newRule } from '../../../lib/filters';
import type { FilterRule } from '../../../lib/types';
import { DateSourcesSection } from './DateSourcesSection';
import { FilterGroupCard } from './FilterGroupCard';
import { FilterRuleRow } from './FilterRuleRow';
import { FiltersSection } from './FiltersSection';
import { RandomSelectionField } from './RandomSelectionField';
import { RuleInputs } from './RuleInputs';

describe('RuleInputs', () => {
  const noop = () => undefined;

  it('edits the value of name, glob and regex rules', () => {
    const onChange = vi.fn();
    render(<RuleInputs rule={newRule('glob')} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Rule value'), { target: { value: 'GX01*.MP4' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ kind: 'glob', value: 'GX01*.MP4' }));
  });

  it('edits both ends of a date range', () => {
    const onChange = vi.fn();
    render(<RuleInputs rule={newRule('date_range')} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2026-11-01' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ dateFrom: '2026-11-01' }));
    fireEvent.change(screen.getByLabelText('To date'), { target: { value: '2026-11-30' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ dateTo: '2026-11-30' }));
  });

  it('edits the days of a weekday rule', () => {
    const onChange = vi.fn();
    render(<RuleInputs rule={newRule('weekday')} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sunday' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ days: [0, 6] }));
  });

  it('edits days and times of a window rule', () => {
    const onChange = vi.fn();
    render(<RuleInputs rule={newRule('window')} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '08:30' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ start: '08:30' }));
    fireEvent.change(screen.getByLabelText('End time'), { target: { value: '12:00' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ end: '12:00' }));
    fireEvent.click(screen.getByRole('button', { name: 'Monday' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ days: [1, 6] }));
  });

  it('shows a helpful placeholder per text kind', () => {
    const { rerender } = render(<RuleInputs rule={newRule('regex')} onChange={noop} />);
    expect(screen.getByLabelText('Rule value')).toHaveAttribute('placeholder', '^GX\\d{4}');
    rerender(<RuleInputs rule={newRule('name')} onChange={noop} />);
    expect(screen.getByLabelText('Rule value')).toHaveAttribute('placeholder', 'proxy');
  });
});

describe('FilterRuleRow', () => {
  it('switches between include and exclude', () => {
    const onChange = vi.fn();
    render(<FilterRuleRow rule={newRule()} onChange={onChange} onRemove={() => undefined} />);
    fireEvent.change(screen.getByLabelText('Include or exclude'), { target: { value: 'exclude' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ exclude: true }));
  });

  it('resets the fields when the kind changes but keeps include/exclude', () => {
    const onChange = vi.fn();
    const rule: FilterRule = { ...newRule('name', true), value: 'proxy' };
    render(<FilterRuleRow rule={rule} onChange={onChange} onRemove={() => undefined} />);
    fireEvent.change(screen.getByLabelText('Rule type'), { target: { value: 'window' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ kind: 'window', exclude: true, value: '', start: '09:00' }));
  });

  it('removes the rule', () => {
    const onRemove = vi.fn();
    render(<FilterRuleRow rule={newRule()} onChange={() => undefined} onRemove={onRemove} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove rule' }));
    expect(onRemove).toHaveBeenCalled();
  });
});

describe('FilterGroupCard', () => {
  it('adds, edits and removes rules inside the group', () => {
    const onChange = vi.fn();
    const group = { rules: [newRule(), newRule('glob')] };
    render(<FilterGroupCard index={1} group={group} onChange={onChange} onRemove={() => undefined} />);
    expect(screen.getByRole('group', { name: 'Group 2' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add rule' }));
    expect(onChange.mock.calls[0][0].rules).toHaveLength(3);
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove rule' })[0]);
    expect(onChange.mock.calls[1][0].rules).toHaveLength(1);
    fireEvent.change(screen.getAllByLabelText('Rule value')[1], { target: { value: '*.mp4' } });
    expect(onChange.mock.calls[2][0].rules[1].value).toBe('*.mp4');
  });

  it('removes the group and explains an empty one', () => {
    const onRemove = vi.fn();
    render(<FilterGroupCard index={0} group={{ rules: [] }} onChange={() => undefined} onRemove={onRemove} />);
    expect(screen.getByText(/An empty group is ignored/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Remove group/ }));
    expect(onRemove).toHaveBeenCalled();
  });
});

describe('FiltersSection', () => {
  it('explains that with no filters everything is collected', () => {
    render(<FiltersSection config={makeConfig()} onChange={() => undefined} />);
    expect(screen.getByText(/every video file in the input folder is collected/)).toBeInTheDocument();
  });

  it('adds a group', () => {
    const onChange = vi.fn();
    render(<FiltersSection config={makeConfig()} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add group' }));
    expect(onChange.mock.calls[0][0].filters).toHaveLength(1);
  });

  it('shows OR between groups and removes one', () => {
    const onChange = vi.fn();
    const config = makeConfig({ filters: [{ rules: [newRule()] }, { rules: [newRule('glob')] }] });
    render(<FiltersSection config={config} onChange={onChange} />);
    expect(screen.getByText('OR')).toBeInTheDocument();
    const second = screen.getByRole('group', { name: 'Group 2' });
    fireEvent.click(within(second).getByRole('button', { name: /Remove group/ }));
    expect(onChange.mock.calls[0][0].filters).toHaveLength(1);
  });

  it('edits a rule inside a group', () => {
    const onChange = vi.fn();
    render(<FiltersSection config={makeConfig({ filters: [{ rules: [newRule()] }] })} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Rule value'), { target: { value: 'coach' } });
    expect(onChange.mock.calls[0][0].filters[0].rules[0].value).toBe('coach');
  });
});

describe('RandomSelectionField', () => {
  const base = { enabled: true, mode: 'percent' as const, value: 30, scope: 'overall' as const, seed: 42 };

  it('hides the controls until enabled and enables with the toggle', () => {
    const onChange = vi.fn();
    render(<RandomSelectionField value={{ ...base, enabled: false }} onChange={onChange} />);
    expect(screen.queryByLabelText('Amount')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch', { name: 'Random selection' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
  });

  it('edits amount, type, scope and seed', () => {
    const onChange = vi.fn();
    render(<RandomSelectionField value={base} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '12' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ value: 12 }));
    fireEvent.change(screen.getByLabelText('Amount type'), { target: { value: 'count' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ mode: 'count' }));
    fireEvent.change(screen.getByLabelText('Selection scope'), { target: { value: 'folder' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ scope: 'folder' }));
    fireEvent.change(screen.getByLabelText('Seed'), { target: { value: '7' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ seed: 7 }));
  });

  it('turns non-numeric or empty input into a safe number', () => {
    const onChange = vi.fn();
    render(<RandomSelectionField value={base} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: 'abc' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ value: 0 }));
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ value: 0 }));
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '-5' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ value: 0 }));
  });
});

describe('DateSourcesSection', () => {
  it('numbers the enabled sources and lists unused ones unchecked', () => {
    render(<DateSourcesSection sources={['filename', 'mtime']} filenamePattern="" onChange={() => undefined} />);
    expect(screen.getByLabelText('Video metadata')).not.toBeChecked();
    expect(screen.getByLabelText('Filename pattern', { selector: 'input[type=checkbox]' })).toBeChecked();
    expect(screen.getByLabelText('File modified time')).toBeChecked();
  });

  it('enables a source (added last) and disables one', () => {
    const onChange = vi.fn();
    render(<DateSourcesSection sources={['mtime']} filenamePattern="" onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Video metadata'));
    expect(onChange).toHaveBeenLastCalledWith(['mtime', 'metadata'], '');
    fireEvent.click(screen.getByLabelText('File modified time'));
    expect(onChange).toHaveBeenLastCalledWith([], '');
  });

  it('reorders enabled sources and disables arrows that cannot move', () => {
    const onChange = vi.fn();
    render(<DateSourcesSection sources={['metadata', 'mtime']} filenamePattern="" onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Move Video metadata up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move File modified time down' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Move File modified time up' }));
    expect(onChange).toHaveBeenLastCalledWith(['mtime', 'metadata'], '');
  });

  it('shows and edits the filename pattern when that source is on', () => {
    const onChange = vi.fn();
    render(<DateSourcesSection sources={['filename', 'mtime']} filenamePattern="GX_YYYYMMDD" onChange={onChange} />);
    const pattern = screen.getByPlaceholderText('GX_YYYYMMDD_HHmmss');
    expect(pattern).toHaveValue('GX_YYYYMMDD');
    fireEvent.change(pattern, { target: { value: 'VID_YYYYMMDD' } });
    expect(onChange).toHaveBeenLastCalledWith(['filename', 'mtime'], 'VID_YYYYMMDD');
  });

  it('hides the pattern field when the filename source is off', () => {
    render(<DateSourcesSection sources={['mtime']} filenamePattern="" onChange={() => undefined} />);
    expect(screen.queryByPlaceholderText('GX_YYYYMMDD_HHmmss')).not.toBeInTheDocument();
  });
});
