/** The folder a batch's videos go in, under its output folder. Tags are filled in from the batch. */
export const DEFAULT_FOLDER_TEMPLATE = '{{name}}-{{id}}';

export const FOLDER_TAGS = ['name', 'id', 'date'] as const;
const MAX_TEMPLATE = 100;
const TAG = /\{\{\s*(\w+)\s*\}\}/g;
const LITERAL = /^[A-Za-z0-9._-]*$/;

/** The reason a folder name template cannot be used, or null when it can. The server checks the same rules. */
export function folderTemplateError(template: string): string | null {
  const text = template.trim() || DEFAULT_FOLDER_TEMPLATE;
  if (text.length > MAX_TEMPLATE) return `The folder name must be 1 to ${MAX_TEMPLATE} characters`;
  for (const match of text.matchAll(TAG)) {
    if (!(FOLDER_TAGS as readonly string[]).includes(match[1])) return `{{${match[1]}}} is not a tag. Use {{name}}, {{id}} or {{date}}`;
  }
  if (!LITERAL.test(text.replace(TAG, ''))) return 'Use letters, numbers, dots, dashes and underscores, and the tags. Remove any other characters';
  if (!/\{\{\s*id\s*\}\}/.test(text)) return 'Use the {{id}} tag, so every batch gets its own folder';
  return null;
}

/** The folder name the template gives for a sample batch, for the preview under the field. */
export function previewFolderName(template: string, batchName: string, id: number, day: string): string {
  const safe = batchName.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 40) || 'batch';
  const text = (template.trim() || DEFAULT_FOLDER_TEMPLATE).replace(TAG, (_, key: string) => (key === 'name' ? safe : key === 'id' ? String(id) : day));
  return text.replace(/^[-.]+|[-.]+$/g, '') || `batch-${id}`;
}
