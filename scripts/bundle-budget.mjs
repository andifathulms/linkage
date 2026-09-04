/**
 * PRD §8.10: bundle under 250 KB gzipped.
 *
 * Run after `npm run build`. Exits non-zero over budget, so the number is enforced
 * rather than aspired to.
 */
import { gzipSync } from 'node:zlib';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const BUDGET_BYTES = 250 * 1024;
const DIST = 'dist';

function files(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...files(full));
    else out.push(full);
  }
  return out;
}

let total = 0;
const rows = [];
for (const file of files(DIST)) {
  if (!/\.(js|css|html)$/.test(file)) continue;
  const gz = gzipSync(readFileSync(file)).length;
  total += gz;
  rows.push([file, gz]);
}

rows.sort((a, b) => b[1] - a[1]);
for (const [file, gz] of rows) {
  console.log(`${(gz / 1024).toFixed(1).padStart(8)} KB gzip  ${file}`);
}
console.log(`${(total / 1024).toFixed(1).padStart(8)} KB gzip  total (budget ${BUDGET_BYTES / 1024} KB)`);

if (total > BUDGET_BYTES) {
  console.error(`Over budget by ${((total - BUDGET_BYTES) / 1024).toFixed(1)} KB.`);
  process.exit(1);
}
