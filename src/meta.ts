/**
 * What the application is, in one place.
 *
 * These strings are the on-page content and the page metadata at once. The thesis below
 * is the heading case 1 renders over the field; the description is what a shared link
 * shows. Nothing here is duplicated into index.html by hand, because a description that
 * drifts from the page is worse than no description: vite.config.ts reads this module at
 * build time and writes the tags from it.
 *
 * Plain constants, no imports. The build reads it in Node and the application imports it
 * in the browser, so it has to be safe in both.
 */

/** The product name. */
export const NAME = 'Linkage';

/** PRD §1, and the heading case 1 sets over the field. */
export const THESIS = 'Removing names does not anonymize anything';

/**
 * One sentence for a link preview and the meta description. Says what the thing is and
 * states the constraint that defines it, because the synthetic-data commitment is the
 * first question anyone sensible asks (PRD §0.1).
 */
export const DESCRIPTION =
  'An explainer on re-identification, with every attack scored against ground truth. ' +
  "All records are generated. No real person's data is used or accepted.";

/** The static page that explains the project to someone who has not opened it yet. */
export const LANDING_TITLE = `${NAME}. ${THESIS}`;

/** The application itself. */
export const APP_TITLE = `${NAME}. ${THESIS}`;

/**
 * The brand palette, from the export's own README.
 *
 * Quoted here because the export is not in the repository and the manifest needs two of
 * these values. The reserved one is coral: it means one record, re-identified, and the
 * export is explicit that nothing else may use it. The application's own --exposed token
 * is a different value, tuned for its two grounds; these are the mark's colours, not the
 * interface's.
 */
export const BRAND = {
  /** Ink ground. */
  ink: '#0B0D0F',
  /** Paper, and the icon's field. */
  paper: '#E8ECEE',
  /** Reserved. One record, re-identified. Never decorative. */
  coral: '#F4523B',
  /** The crowd: records still at k greater than one. */
  slate: '#5C6B73',
} as const;

/**
 * Who made this.
 *
 * Here rather than inside the component because two surfaces render it: the application's
 * footer, and the landing page, which is a static file the build annotates. One array, so
 * a changed handle is changed once.
 */
export const MAKER = {
  name: 'Andi Fathul Mukminin',
  portfolio: 'https://andifathulms.github.io/en/',
  links: [
    { label: 'Portfolio', href: 'https://andifathulms.github.io/en/', icon: 'globe' },
    { label: 'GitHub', href: 'https://github.com/andifathulms', icon: 'github' },
    { label: 'LinkedIn', href: 'https://www.linkedin.com/in/andifathulmukminin/', icon: 'linkedin' },
    { label: 'Instagram', href: 'https://www.instagram.com/andifathulms/', icon: 'instagram' },
  ],
} as const;

export type MakerIcon = (typeof MAKER.links)[number]['icon'];
