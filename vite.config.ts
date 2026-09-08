/// <reference types="vitest" />
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { NAME, THESIS, DESCRIPTION, APP_TITLE, LANDING_TITLE } from './src/meta';

const BASE = process.env.VITE_BASE ?? '/linkage/';

/** Where the built site is served from. Override with VITE_SITE for another host. */
const SITE = (process.env.VITE_SITE ?? 'https://andifathulms.github.io').replace(/\/$/, '');

const APP_URL = `${SITE}${BASE}`;
const LANDING_URL = `${APP_URL}landing.html`;

/**
 * Metadata, generated rather than typed twice.
 *
 * Every string here comes from src/meta.ts, which is the same module the application
 * imports for its on-page heading. A description that has drifted from the page is worse
 * than none, and the only way to be sure it has not is to have one source.
 *
 * No og:image: the project ships no raster assets by design, and summary is the correct
 * card for a page without one. A card claiming an image that does not exist renders
 * worse than a card that does not claim one.
 */
function tagsFor(title: string, url: string): string {
  const escape = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return [
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${escape(NAME)}" />`,
    `<meta property="og:title" content="${escape(title)}" />`,
    `<meta property="og:description" content="${escape(DESCRIPTION)}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${escape(title)}" />`,
    `<meta name="twitter:description" content="${escape(DESCRIPTION)}" />`,
  ]
    .map((tag) => '    ' + tag)
    .join('\n');
}

function metadata(): Plugin {
  return {
    name: 'linkage-metadata',
    /**
     * The application's own document. Title and description are replaced from the same
     * source, and a noscript block is added: the application renders into an empty root,
     * so anything that does not run scripts saw nothing at all and had no way to reach
     * the static page that explains the project.
     */
    transformIndexHtml(html) {
      return html
        .replace(/<title>[^<]*<\/title>/, `<title>${APP_TITLE}</title>`)
        .replace(
          /<meta\s+name="description"[\s\S]*?\/>/,
          `<meta name="description" content="${DESCRIPTION}" />`,
        )
        .replace('</head>', `${tagsFor(APP_TITLE, APP_URL)}\n  </head>`)
        .replace(
          '<div id="root"></div>',
          `<div id="root"></div>
    <noscript>
      <h1>${THESIS}</h1>
      <p>${DESCRIPTION}</p>
      <p>
        This is an interactive simulator and needs JavaScript to run.
        <a href="landing.html">Read what it does and what it refuses to do</a>.
      </p>
    </noscript>`,
        );
    },
    /**
     * The landing page ships from public/ as a self-contained file, so it never passes
     * through transformIndexHtml. It gets the same tags from the same source here, plus
     * robots.txt and a sitemap naming both documents, which is what makes the static page
     * reachable at all.
     */
    closeBundle() {
      const out = resolve(__dirname, 'dist');
      const landing = resolve(out, 'landing.html');
      try {
        const html = readFileSync(landing, 'utf8');
        writeFileSync(
          landing,
          html
            .replace(/<title>[^<]*<\/title>/, `<title>${LANDING_TITLE}</title>`)
            .replace('</head>', `${tagsFor(LANDING_TITLE, LANDING_URL)}\n  </head>`),
        );
      } catch {
        // No landing page in this build. Nothing to annotate.
      }
      writeFileSync(
        resolve(out, 'robots.txt'),
        `User-agent: *\nAllow: /\nSitemap: ${SITE}${BASE}sitemap.xml\n`,
      );
      writeFileSync(
        resolve(out, 'sitemap.xml'),
        `<?xml version="1.0" encoding="UTF-8"?>\n` +
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
          `  <url><loc>${APP_URL}</loc></url>\n` +
          `  <url><loc>${LANDING_URL}</loc></url>\n` +
          `</urlset>\n`,
      );
    },
  };
}

// Base path for GitHub Pages project sites; override with VITE_BASE.
export default defineConfig({
  base: BASE,
  plugins: [react(), metadata()],
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    reportCompressedSize: true,
    // Vite's module-preload polyfill calls fetch(). The app makes no network requests at
    // runtime (PRD §6.5) and the bundle grep enforces that, so the polyfill goes. The
    // build targets browsers with native modulepreload.
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        // React is isolated into its own chunk so the bundle grep can hold app code to
        // the full forbidden-API list. React's synthetic event table names
        // `clipboardData`; the app registers no paste handler, and separating the chunks
        // is what lets the test assert that rather than assume it.
        manualChunks: (id) => (id.includes('node_modules') ? 'vendor' : undefined),
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
});
