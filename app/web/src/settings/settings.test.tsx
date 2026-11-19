import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SettingsPage } from './SettingsPage';

const DEFAULT = 'nvidia/nemotron-3.5-super-vl';

function api(over: Record<string, unknown> = {}) {
  return {
    aiKey: vi.fn().mockResolvedValue({ keySet: true, keyHint: '...1234', model: DEFAULT }),
    saveAiKey: vi.fn().mockResolvedValue({ keySet: true, keyHint: '...1234', model: DEFAULT }),
    saveAiModel: vi.fn().mockResolvedValue({ keySet: true, keyHint: '...1234', model: 'openai/gpt-6.2-astra' }),
    ...over,
  };
}

describe('SettingsPage', () => {
  it('saves a new key and shows only its last four characters', async () => {
    const a = api({ aiKey: vi.fn().mockResolvedValue({ keySet: false, keyHint: null, model: DEFAULT }) });
    render(<SettingsPage api={a} />);
    expect(await screen.findByText('No key saved yet')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('OpenRouter API key'), { target: { value: 'sk-or-1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save key' }));
    await waitFor(() => expect(a.saveAiKey).toHaveBeenCalledWith('sk-or-1234'));
    expect(await screen.findByText('A key is saved (...1234)')).toBeInTheDocument();
  });

  it('shows the saved model, and saves a different one typed in', async () => {
    const a = api();
    render(<SettingsPage api={a} />);
    const model = await screen.findByLabelText('Model');
    expect(model).toHaveValue(DEFAULT);
    expect(screen.getByRole('button', { name: 'Save model' })).toBeDisabled();
    fireEvent.change(model, { target: { value: 'openai/gpt-6.2-astra' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save model' }));
    await waitFor(() => expect(a.saveAiModel).toHaveBeenCalledWith('openai/gpt-6.2-astra'));
  });

  it('sends an empty model when the default is typed back in', async () => {
    const a = api({ aiKey: vi.fn().mockResolvedValue({ keySet: true, keyHint: '...1234', model: 'openai/gpt-6.2-astra' }) });
    render(<SettingsPage api={a} />);
    fireEvent.change(await screen.findByLabelText('Model'), { target: { value: DEFAULT } });
    fireEvent.click(screen.getByRole('button', { name: 'Save model' }));
    await waitFor(() => expect(a.saveAiModel).toHaveBeenCalledWith(''));
  });
});
