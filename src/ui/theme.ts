/**
 * The ground: ledger or plate. DESIGN.md §2.1.
 *
 * Two grounds, one system. The choice is a reading preference, not part of the
 * configuration a link describes, so it stays in local storage and never touches the URL
 * (CLAUDE.md §9 — the URL carries a population and a configuration and nothing else).
 */

export type Ground = 'ledger' | 'plate';

export const GROUND_KEY = 'linkage.ground.v1';

export function readGround(): Ground {
  if (typeof window === 'undefined') return 'ledger';
  try {
    const stored = window.localStorage.getItem(GROUND_KEY);
    if (stored === 'ledger' || stored === 'plate') return stored;
  } catch {
    // Storage unavailable. The system preference is a fine answer.
  }
  const dark = window.matchMedia?.('(prefers-color-scheme: dark)');
  return dark && dark.matches ? 'plate' : 'ledger';
}

/**
 * Applied to the document element rather than to a React subtree, so the ground reaches
 * the body ruling and the canvas both, and so a redraw is not needed to change it.
 */
export function applyGround(ground: Ground): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', ground);
  try {
    window.localStorage.setItem(GROUND_KEY, ground);
  } catch {
    // A preference that cannot be stored is still a preference for this session.
  }
}
