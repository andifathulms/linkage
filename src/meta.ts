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
