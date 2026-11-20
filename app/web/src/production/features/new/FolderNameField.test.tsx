import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { FolderNameField } from './FolderNameField';

function Harness() {
  const [value, setValue] = useState('{{name}}-{{id}}');
  return <FolderNameField value={value} onChange={setValue} outputRoot="/Volumes/Out" />;
}

describe('FolderNameField', () => {
  it('shows where the videos will go and refuses a tag it does not know', async () => {
    render(<Harness />);
    expect(screen.getByText(/\/Volumes\/Out\/My-batch-12\/pass-1/)).toBeInTheDocument();
    const input = screen.getByLabelText('Folder name');
    fireEvent.change(input, { target: { value: '{{nope}}-{{id}}' } });
    expect(screen.getByText(/nope/)).toBeInTheDocument();
    expect(screen.queryByText(/Videos go in/)).not.toBeInTheDocument();
  });
});
