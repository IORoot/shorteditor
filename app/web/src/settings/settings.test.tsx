import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SettingsPage } from './SettingsPage';

describe('SettingsPage', () => {
  it('saves a new key and shows only its last four characters', async () => {
    const api = {
      aiKey: vi.fn().mockResolvedValue({ keySet: false, keyHint: null }),
      saveAiKey: vi.fn().mockResolvedValue({ keySet: true, keyHint: '...1234' }),
    };
    render(<SettingsPage api={api} />);
    expect(await screen.findByText('No key saved yet')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('OpenRouter API key'), { target: { value: 'sk-or-1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save key' }));
    await waitFor(() => expect(api.saveAiKey).toHaveBeenCalledWith('sk-or-1234'));
    expect(await screen.findByText('A key is saved (...1234)')).toBeInTheDocument();
  });
});
