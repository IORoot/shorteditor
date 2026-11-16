export interface TokenInfo {
  token: string;
  example: string;
}

export const TOKENS: TokenInfo[] = [
  { token: '{date:YYYY-MM-DD}', example: '2026-11-14' },
  { token: '{weekday}', example: 'Sat' },
  { token: '{suffix}', example: 'coach' },
  { token: '{window:name}', example: 'Morning' },
  { token: '{window:start}', example: '09-00' },
  { token: '{counter}', example: '01' },
];

export function insertToken(value: string, token: string, start: number, end: number): { value: string; cursor: number } {
  const from = Math.max(0, Math.min(start, value.length));
  const to = Math.max(from, Math.min(end, value.length));
  return { value: value.slice(0, from) + token + value.slice(to), cursor: from + token.length };
}
