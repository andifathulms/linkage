/// <reference types="vitest" />
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { NAME, THESIS, DESCRIPTION, APP_TITLE, LANDING_TITLE, BRAND, MAKER } from './src/meta';

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
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escape(title)}" />`,
    `<meta name="twitter:description" content="${escape(DESCRIPTION)}" />`,
    // The brand export ships a 1200x630 card, so a shared link can render a real
    // preview now. An earlier pass used twitter:card=summary because there was no
    // image to point at; there is one.
    `<meta property="og:image" content="${APP_URL}brand/og.png" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${escape(THESIS)}" />`,
    `<meta name="twitter:image" content="${APP_URL}brand/og.png" />`,
  ]
    .map((tag) => '    ' + tag)
    .join('\n');
}

/**
 * The maker's mark for the landing page.
 *
 * The application renders it as a component; the landing page is a static file, so the
 * build writes the same thing from the same array. Hand-copying it would be two places to
 * change a handle, and this is the same arrangement the metadata already uses.
 */
const GLYPHS: Record<string, string> = {
  globe:
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9.25"/><path d="M2.75 12h18.5"/><path d="M12 2.75c2.4 2.5 3.6 5.6 3.6 9.25s-1.2 6.75-3.6 9.25c-2.4-2.5-3.6-5.6-3.6-9.25S9.6 5.25 12 2.75Z"/></svg>',
  github:
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.7 4.7 18.7 5 18.7 5c.6 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3Z"/></svg>',
  linkedin:
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M20.4 20.5h-3.6v-5.6c0-1.3 0-3-1.8-3s-2.2 1.4-2.2 2.9v5.7H9.4V9h3.4v1.6h.05c.5-.9 1.6-1.9 3.4-1.9 3.6 0 4.3 2.4 4.3 5.5v6.3ZM5.3 7.4a2.1 2.1 0 1 1 0-4.1 2.1 2.1 0 0 1 0 4.1Zm1.8 13.1H3.6V9h3.5v11.5ZM22.2 0H1.8C.8 0 0 .8 0 1.7v20.5C0 23.2.8 24 1.8 24h20.4c1 0 1.8-.8 1.8-1.7V1.7C24 .8 23.2 0 22.2 0Z"/></svg>',
  instagram:
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true" focusable="false"><rect x="2.75" y="2.75" width="18.5" height="18.5" rx="5"/><circle cx="12" cy="12" r="4.25"/><circle cx="17.4" cy="6.6" r="1.15" fill="currentColor" stroke="none"/></svg>',
};

function makerMarkup(year: number): string {
  const links = MAKER.links
    .map(
      (link) =>
        `<li><a class="maker__link" href="${link.href}" target="_blank" rel="noopener noreferrer" aria-label="${link.label}">${GLYPHS[link.icon]}</a></li>`,
    )
    .join('');
  return `<div class="maker">
          <p class="maker__line">
            Designed &amp; built by
            <a class="maker__name" href="${MAKER.portfolio}" target="_blank" rel="noopener noreferrer">${MAKER.name}</a>
            <span aria-hidden="true">·</span> © <span class="maker__year">${year}</span>
          </p>
          <ul class="maker__links">${links}</ul>
        </div>`;
}

/** The same rules as the application's, in the landing page's own token names. */
const MAKER_CSS = `
      .maker { margin-left: auto; text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: var(--s-1); }
      .maker__line { margin: 0; font-size: var(--t-small-size); line-height: 1.5; color: var(--ink-mid); }
      .maker__name { color: var(--ink); text-decoration: underline; text-decoration-color: var(--rule-strong); text-underline-offset: 2px; transition: text-decoration-color var(--d-tap) var(--e-standard); }
      .maker__name:hover { text-decoration-color: var(--ink); }
      .maker__year { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
      .maker__links { display: flex; gap: var(--s-0); list-style: none; margin: 0; padding: 0; }
      .maker__link { display: grid; place-items: center; width: 28px; height: 28px; border-radius: var(--radius); color: var(--ink-faint); transition: color var(--d-tap) var(--e-standard), background-color var(--d-tap) var(--e-standard); }
      .maker__link:hover { color: var(--ink); background: var(--ledger-deep); }
      @media (max-width: 640px) { .maker { margin-left: 0; text-align: left; align-items: flex-start; } }
`;

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
        // Read the pristine source, never the output. Vite copies public/ into dist
        // before this runs, but a second build against an existing dist would otherwise
        // annotate an already-annotated file and the tags would accumulate. Reading the
        // source makes the result the same however many times it runs.
        const html = readFileSync(resolve(__dirname, 'public', 'landing.html'), 'utf8');
        writeFileSync(
          landing,
          html
            .replace(/<title>[^<]*<\/title>/, `<title>${LANDING_TITLE}</title>`)
            .replace('</head>', `${tagsFor(LANDING_TITLE, LANDING_URL)}\n  </head>`)
            .replace('    </style>', `${MAKER_CSS}    </style>`)
            .replace(
              '      </div>\n    </footer>',
              `        ${makerMarkup(new Date().getFullYear())}\n      </div>\n    </footer>`,
            ),
        );
      } catch {
        // No landing page in this build. Nothing to annotate.
      }
      /**
       * The web app manifest, so the mark is what an Android or desktop install shows.
       * No service worker: that would put a network layer in front of an application
       * whose whole claim is that it makes no requests, and there is nothing to cache
       * that the browser does not already cache.
       */
      writeFileSync(
        resolve(out, 'site.webmanifest'),
        JSON.stringify(
          {
            name: APP_TITLE,
            short_name: NAME,
            description: DESCRIPTION,
            start_url: BASE,
            scope: BASE,
            display: 'standalone',
            background_color: BRAND.paper,
            theme_color: BRAND.ink,
            icons: [
              { src: 'brand/icon-192.png', sizes: '192x192', type: 'image/png' },
              { src: 'brand/icon-512.png', sizes: '512x512', type: 'image/png' },
              {
                src: 'brand/icon-maskable-512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'maskable',
              },
            ],
          },
          null,
          2,
        ) + '\n',
      );
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
