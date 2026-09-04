/**
 * CLAUDE.md non-negotiable 1 and PRD §8.2. The single most important rule in the project.
 *
 * The app generates its populations in the browser. There is no file input, no
 * drag-and-drop, no paste-a-CSV, and no code path that accepts a record from outside.
 *
 * This test greps the built bundle, not the source, because a dependency or a build
 * transform could introduce one of these APIs without any source file mentioning it, and
 * the constraint is about what ships.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it, beforeAll } from 'vitest';

const ROOT = resolve(__dirname, '..');
const DIST = join(ROOT, 'dist');

/**
 * Ingest APIs: banned in every file that ships, React's chunk included. These are the
 * ones that could actually carry a record in from outside, and there is no acceptable
 * occurrence of them anywhere.
 */
const FORBIDDEN_INGEST: ReadonlyArray<{ pattern: RegExp; why: string }> = [
  { pattern: /type\s*=\s*["']file["']/i, why: 'a file input element' },
  { pattern: /type:\s*["']file["']/i, why: 'a file input element built in JS' },
  { pattern: /\bnew\s+FileReader\b/, why: 'FileReader' },
  { pattern: /\bFileReader\b/, why: 'FileReader' },
  { pattern: /\bshowOpenFilePicker\b/, why: 'the File System Access API' },
  { pattern: /\bshowDirectoryPicker\b/, why: 'the File System Access API' },
  { pattern: /\bwebkitdirectory\b/i, why: 'directory upload' },
  { pattern: /\.files\b\s*\[/, why: 'reading a FileList' },
  { pattern: /\bDataTransferItemList\b/, why: 'drag-and-drop file transfer' },
  { pattern: /\bgetAsFileSystemHandle\b/, why: 'drag-and-drop file transfer' },
  { pattern: /['"`]ondrop['"`]|\bondrop\s*[:=]/, why: 'a drop handler' },
  { pattern: /addEventListener\(\s*["'`]drop["'`]/, why: 'a drop handler' },
  { pattern: /addEventListener\(\s*["'`]dragover["'`]/, why: 'a drag-over handler' },
  { pattern: /navigator\.clipboard\.readText/, why: 'reading the clipboard' },
];

/**
 * Paste APIs: banned in app code and in source, but not in React's chunk.
 *
 * React's synthetic event system carries a `clipboardData` entry in its event plugin
 * table whether or not any component listens for a paste. That string is unavoidable
 * while React is the renderer, so instead of weakening the rule for the whole bundle,
 * the build splits React into its own chunk (vite.config.ts) and this list applies to
 * every other file. The app therefore provably registers no paste handler; React merely
 * knows how to describe one nobody asked for.
 */
const FORBIDDEN_PASTE: ReadonlyArray<{ pattern: RegExp; why: string }> = [
  { pattern: /addEventListener\(\s*["'`]paste["'`]/, why: 'a paste handler' },
  { pattern: /\bonPaste\b/, why: 'a paste handler' },
  { pattern: /\bclipboardData\b/, why: 'reading the clipboard' },
];

const FORBIDDEN = [...FORBIDDEN_INGEST, ...FORBIDDEN_PASTE];

/** The one chunk exempt from FORBIDDEN_PASTE, and only from that list. */
const VENDOR = /vendor-[A-Za-z0-9_-]+\.js$/;

/** Network at runtime is forbidden too (PRD §6.5), and the bundle is where to check. */
const FORBIDDEN_NETWORK: ReadonlyArray<{ pattern: RegExp; why: string }> = [
  { pattern: /\bnew\s+XMLHttpRequest\b/, why: 'XMLHttpRequest' },
  { pattern: /\bnew\s+WebSocket\b/, why: 'a WebSocket' },
  { pattern: /\bnew\s+EventSource\b/, why: 'server-sent events' },
  { pattern: /\bnavigator\.sendBeacon\b/, why: 'sendBeacon' },
  { pattern: /\bfetch\s*\(/, why: 'fetch' },
];

function collectFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectFiles(full));
    else out.push(full);
  }
  return out;
}

let bundleFiles: string[] = [];

function grep(
  files: readonly string[],
  patterns: ReadonlyArray<{ pattern: RegExp; why: string }>,
): string[] {
  const hits: string[] = [];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const { pattern, why } of patterns) {
      if (pattern.test(text)) hits.push(`${file.replace(ROOT + '/', '')}: ${why} (${pattern})`);
    }
  }
  return hits;
}

describe('no file input in the built application', () => {
  beforeAll(() => {
    if (!existsSync(DIST)) {
      execFileSync('npx', ['vite', 'build'], { cwd: ROOT, stdio: 'inherit' });
    }
    bundleFiles = collectFiles(DIST).filter((f) => /\.(js|mjs|css|html)$/.test(f));
    expect(bundleFiles.length).toBeGreaterThan(0);
  });

  it('contains no API capable of ingesting a record, in any chunk', () => {
    const hits = grep(bundleFiles, FORBIDDEN_INGEST);
    expect(hits, `Forbidden ingest API in the bundle:\n${hits.join('\n')}`).toEqual([]);
  });

  it('registers no paste handler outside React\'s own chunk', () => {
    const appFiles = bundleFiles.filter((f) => !VENDOR.test(f));
    expect(appFiles.length).toBeGreaterThan(0);
    const hits = grep(appFiles, FORBIDDEN_PASTE);
    expect(hits, `Forbidden paste API in app code:\n${hits.join('\n')}`).toEqual([]);
  });

  it('actually splits React out, so the paste exemption stays narrow', () => {
    // If the chunk split silently stopped working, the exemption above would quietly
    // widen to cover app code. Assert the vendor chunk exists and app chunks do too.
    expect(bundleFiles.some((f) => VENDOR.test(f))).toBe(true);
  });

  it('contains no runtime network API', () => {
    const hits = grep(bundleFiles, FORBIDDEN_NETWORK);
    expect(hits, `Forbidden network API in the bundle:\n${hits.join('\n')}`).toEqual([]);
  });

  it('contains no file-input API in the source either', () => {
    // The bundle grep is the real gate. This one localises a failure to a source file.
    const sources = collectFiles(join(ROOT, 'src'));
    const hits: string[] = [];
    for (const file of sources) {
      const text = readFileSync(file, 'utf8');
      for (const { pattern, why } of FORBIDDEN) {
        // The rule text in a comment is allowed to name what it forbids; code is not.
        const codeOnly = text
          .split('\n')
          .filter((line: string) => !/^\s*(\/\/|\*|\/\*)/.test(line))
          .join('\n');
        if (pattern.test(codeOnly)) hits.push(`${file.replace(ROOT + '/', '')}: ${why}`);
      }
    }
    expect(hits, `Forbidden file-input API in source:\n${hits.join('\n')}`).toEqual([]);
  });

  it('declares no Math.random in source, so populations stay reproducible', () => {
    const sources = collectFiles(join(ROOT, 'src'));
    const hits: string[] = [];
    for (const file of sources) {
      const text = readFileSync(file, 'utf8');
      const codeOnly = text
        .split('\n')
        .filter((line: string) => !/^\s*(\/\/|\*|\/\*)/.test(line))
        .join('\n');
      if (/Math\.random/.test(codeOnly)) hits.push(file.replace(ROOT + '/', ''));
    }
    expect(hits).toEqual([]);
  });
});
