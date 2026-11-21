import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SettingsPage } from './SettingsPage';

const DEFAULT = 'nvidia/nemotron-3.5-super-vl';

function api(over: Record<string, unknown> = {}) {
  return {
    aiKey: vi.fn().mockResolvedValue({ keySet: true, keyHint: '...1234', model: DEFAULT }),
    saveAiKey: vi.fn().mockResolvedValue({ keySet: true, keyHint: '...1234', model: DEFAULT }),
    saveAiModel: vi.fn().mockResolvedValue({ keySet: true, keyHint: '...1234', model: 'openai/gpt-6.2-astra' }),
    postiz: vi.fn().mockResolvedValue({ url: null, keySet: false, keyHint: null }),
    savePostiz: vi.fn().mockResolvedValue({ url: 'https://postiz.example/api', keySet: true, keyHint: '...9876' }),
    testPostiz: vi.fn().mockResolvedValue({ channels: [{ id: 'c1', name: 'London Parkour', identifier: 'instagram' }], folders: 4 }),
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

  describe('Post-iz', () => {
    const saved = { url: 'https://postiz.example/api', keySet: true, keyHint: '...9876' };

    it('shows the saved address and a key hint, never the key', async () => {
      render(<SettingsPage api={api({ postiz: vi.fn().mockResolvedValue(saved) })} />);
      expect(await screen.findByLabelText('Postiz address')).toHaveValue('https://postiz.example/api');
      expect(screen.getByText('A Postiz key is saved (...9876)')).toBeInTheDocument();
      expect(screen.getByLabelText('Postiz API key')).toHaveValue('');
    });

    it('saves a new address and key', async () => {
      const a = api();
      render(<SettingsPage api={a} />);
      fireEvent.change(await screen.findByLabelText('Postiz address'), { target: { value: 'postiz.example' } });
      fireEvent.change(screen.getByLabelText('Postiz API key'), { target: { value: 'abc9876' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save Post-iz' }));
      await waitFor(() => expect(a.savePostiz).toHaveBeenCalledWith({ url: 'postiz.example', key: 'abc9876' }));
      expect(await screen.findByText('A Postiz key is saved (...9876)')).toBeInTheDocument();
      expect(screen.getByLabelText('Postiz API key')).toHaveValue('');
    });

    it('sends only what changed', async () => {
      const a = api({ postiz: vi.fn().mockResolvedValue(saved) });
      render(<SettingsPage api={a} />);
      fireEvent.change(await screen.findByLabelText('Postiz API key'), { target: { value: 'newkey1' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save Post-iz' }));
      await waitFor(() => expect(a.savePostiz).toHaveBeenCalledWith({ key: 'newkey1' }));
    });

    it('removes the key', async () => {
      const a = api({ postiz: vi.fn().mockResolvedValue(saved), savePostiz: vi.fn().mockResolvedValue({ ...saved, keySet: false, keyHint: null }) });
      render(<SettingsPage api={a} />);
      fireEvent.click(await screen.findByRole('button', { name: 'Remove Postiz key' }));
      await waitFor(() => expect(a.savePostiz).toHaveBeenCalledWith({ key: '' }));
      expect(await screen.findByText('No Postiz key saved yet')).toBeInTheDocument();
    });

    it('is not testable until an address and key are saved', async () => {
      render(<SettingsPage api={api()} />);
      expect(await screen.findByRole('button', { name: 'Test connection' })).toBeDisabled();
    });

    it('Test connection shows the channels found', async () => {
      const a = api({ postiz: vi.fn().mockResolvedValue(saved) });
      render(<SettingsPage api={a} />);
      fireEvent.click(await screen.findByRole('button', { name: 'Test connection' }));
      expect(await screen.findByText(/Connected/)).toHaveTextContent('London Parkour (instagram)');
      expect(screen.getByRole('status')).toHaveTextContent('4 media folders');
    });

    it('Test connection shows the error text on a refusal', async () => {
      const a = api({ postiz: vi.fn().mockResolvedValue(saved), testPostiz: vi.fn().mockRejectedValue(new Error('Postiz said 401 for /public/v1/integrations')) });
      render(<SettingsPage api={a} />);
      fireEvent.click(await screen.findByRole('button', { name: 'Test connection' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Postiz said 401');
    });
  });
});
