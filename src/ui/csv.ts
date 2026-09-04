/**
 * CSV export. PRD §8.8: populations and results export as CSV.
 *
 * Export only. There is no import, and there is no code path that reads a file
 * (PRD §0.1). The download is constructed in memory and handed to the browser as a blob
 * URL on an anchor the user clicked; nothing is read back.
 */

export function toCsv(headers: readonly string[], rows: ReadonlyArray<ReadonlyArray<string | number>>): string {
  const escape = (value: string | number): string => {
    const s = String(value);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(escape).join(',')];
  for (const row of rows) lines.push(row.map(escape).join(','));
  return lines.join('\n');
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.setAttribute('download', filename);
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
