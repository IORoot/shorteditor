import { describe, expect, it } from 'vitest';
import { folderTemplateError, previewFolderName } from './folderTemplate';

describe('folder name template', () => {
  it('accepts the default and tags with spaces inside the braces', () => {
    expect(folderTemplateError('{{name}}-{{id}}')).toBeNull();
    expect(folderTemplateError('{{ date }}_{{id}}')).toBeNull();
  });

  it('refuses unknown tags, odd characters, a missing id and a long template', () => {
    expect(folderTemplateError('{{nope}}-{{id}}')).toContain('nope');
    expect(folderTemplateError('{{name}}/{{id}}')).toContain('Remove any other characters');
    expect(folderTemplateError('{{name}}')).toContain('{{id}}');
    expect(folderTemplateError(`${'x'.repeat(101)}{{id}}`)).toContain('1 to 100');
  });

  it('previews the name a batch would get, with the name made safe', () => {
    expect(previewFolderName('{{name}}-{{id}}', 'Coach Saturdays', 12, '2026-11-20')).toBe('Coach-Saturdays-12');
    expect(previewFolderName('{{date}}-{{id}}', 'x', 3, '2026-11-20')).toBe('2026-11-20-3');
    expect(previewFolderName('{{name}}-{{id}}', '../../evil', 4, '2026-11-20')).toBe('evil-4');
  });
});
