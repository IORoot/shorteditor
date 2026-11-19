import { useEffect, useState } from 'react';

/** The address of one batch's review page: #/production/batches/7. */
export function reviewHash(batchId: number): string {
  return `#/production/batches/${batchId}`;
}

/** The batch a hash addresses, or null when the hash is not a review page. */
export function batchIdFromHash(hash: string): number | null {
  const match = /^#\/production\/batches\/(\d+)$/.exec(hash);
  return match ? Number(match[1]) : null;
}

/** The current hash, kept up to date as the user moves back and forward. */
export function useHash(): string {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash;
}

/** Moves to a page. An empty target goes back to the main board. */
export function goTo(hash: string): void {
  if (window.location.hash !== hash) window.location.hash = hash;
}
