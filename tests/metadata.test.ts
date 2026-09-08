/**
 * The page metadata, against the source it is generated from.
 *
 * A description that has drifted from the page is worse than no description, and the
 * only defence against drift is that there is one source. src/meta.ts is that source:
 * the application imports it for the heading case 1 renders, and vite.config.ts reads it
 * at build time to write the tags. This asserts the two halves still agree, by checking
 * the built output against the module rather than against a copy of the strings.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it, beforeAll } from 'vitest';
import { NAME, THESIS, DESCRIPTION, APP_TITLE, LANDING_TITLE } from '../src/meta';

const ROOT = resolve(__dirname, '..');
const DIST = join(ROOT, 'dist');

let app = '';
let landing = '';

beforeAll(() => {
  if (!existsSync(join(DIST, 'index.html'))) {
    execFileSync('npx', ['vite', 'build'], { cwd: ROOT, stdio: 'inherit' });
  }
  app = readFileSync(join(DIST, 'index.html'), 'utf8');
  landing = readFileSync(join(DIST, 'landing.html'), 'utf8');
});

/** Attribute values are HTML-escaped on the way in, so compare on the same footing. */
const escaped = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

describe('the application document', () => {
  it('takes its title and description from the shared source', () => {
    expect(app).toContain(`<title>${APP_TITLE}</title>`);
    expect(app).toContain(`content="${escaped(DESCRIPTION)}"`);
  });

  it('declares a canonical address', () => {
    expect(app).toMatch(/<link rel="canonical" href="https?:\/\/[^"]+" \/>/);
  });

  it('carries a preview a shared link can render', () => {
    for (const tag of ['og:type', 'og:site_name', 'og:title', 'og:description', 'og:url']) {
      expect(app).toContain(`property="${tag}"`);
    }
    expect(app).toContain('name="twitter:card" content="summary"');
    // summary rather than summary_large_image: the project ships no raster assets, and a
    // card claiming an image that does not exist renders worse than one that does not.
    expect(app).not.toContain('summary_large_image');
    expect(app).not.toContain('og:image');
  });

  it('says something to a reader that does not run scripts', () => {
    // The application renders into an empty root, so without this a crawler and a
    // reader with scripting off both saw an empty document.
    expect(app).toContain('<noscript>');
    expect(app).toContain(THESIS);
    expect(app).toContain('landing.html');
  });

  it('names the product where a preview will show it', () => {
    expect(app).toContain(`content="${NAME}"`);
  });
});

describe('the landing page', () => {
  it('takes its title from the same source', () => {
    expect(landing).toContain(`<title>${LANDING_TITLE}</title>`);
  });

  it('carries its own canonical and preview, pointing at itself', () => {
    expect(landing).toContain('rel="canonical"');
    expect(landing).toContain('landing.html" />');
    expect(landing).toContain(`content="${escaped(DESCRIPTION)}"`);
  });
});

describe('the site can be found', () => {
  it('publishes a robots file naming the sitemap', () => {
    const robots = readFileSync(join(DIST, 'robots.txt'), 'utf8');
    expect(robots).toContain('User-agent: *');
    expect(robots).toMatch(/Sitemap: https?:\/\/\S+sitemap\.xml/);
  });

  it('lists both documents in the sitemap', () => {
    const sitemap = readFileSync(join(DIST, 'sitemap.xml'), 'utf8');
    expect(sitemap).toContain('<urlset');
    expect(sitemap).toContain('landing.html');
    // Two entries: the application and the page that explains it. If a third document
    // is ever published, it belongs here too.
    expect(sitemap.match(/<loc>/g) ?? []).toHaveLength(2);
  });
});

describe('the source the metadata is generated from', () => {
  it('states the synthetic-data commitment, because a preview is where it is asked', () => {
    // PRD §0.1 is the first question anyone sensible asks of a tool like this, and the
    // description is the only sentence most people will ever read.
    expect(DESCRIPTION).toContain('generated');
    expect(DESCRIPTION.toLowerCase()).toContain('no real person');
  });

  it('keeps the thesis short enough to be a heading and a title', () => {
    expect(THESIS.length).toBeLessThan(60);
    expect(APP_TITLE.length).toBeLessThan(70);
  });
});
