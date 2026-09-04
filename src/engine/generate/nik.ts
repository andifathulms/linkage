/**
 * NIK construction and dissection. PRD §3.
 *
 * Sixteen digits with a published structure:
 *
 *   PP KK CC DDMMYY SSSS
 *   0  2  4  6      12
 *
 *   PP     provinsi
 *   KK     kabupaten / kota
 *   CC     kecamatan
 *   DDMMYY date of birth, with 40 added to DD for female records
 *   SSSS   sequence within that region and date
 *
 * The consequence the app exists to show: a NIK encodes Sweeney's quasi-identifier
 * triple — region, date of birth, gender — by construction. The sequence tail carries
 * almost nothing. So card-style masking, which keeps the tail, keeps everything that
 * identifies and hides the one part that does not.
 */

export interface NikSegment {
  id: 'provinsi' | 'kabupaten' | 'kecamatan' | 'day' | 'month' | 'year' | 'sequence';
  label: string;
  /** Inclusive start index into the 16 digits. */
  start: number;
  /** Exclusive end. */
  end: number;
  /** What this segment discloses when unmasked. */
  encodes: string;
}

export const NIK_SEGMENTS: readonly NikSegment[] = [
  { id: 'provinsi', label: 'Provinsi', start: 0, end: 2, encodes: 'Province' },
  { id: 'kabupaten', label: 'Kabupaten/kota', start: 2, end: 4, encodes: 'Regency or city' },
  { id: 'kecamatan', label: 'Kecamatan', start: 4, end: 6, encodes: 'District' },
  { id: 'day', label: 'Day', start: 6, end: 8, encodes: 'Day of birth, and gender' },
  { id: 'month', label: 'Month', start: 8, end: 10, encodes: 'Month of birth' },
  { id: 'year', label: 'Year', start: 10, end: 12, encodes: 'Year of birth, last two digits' },
  { id: 'sequence', label: 'Sequence', start: 12, end: 16, encodes: 'Registration order' },
];

export interface NikParts {
  provinsi: string;
  kabupaten: string;
  kecamatan: string;
  /** True day of birth, 1–31, with the female offset already removed. */
  day: number;
  month: number;
  /** Two-digit year as written on the card. */
  year2: number;
  gender: 'M' | 'F';
  sequence: string;
}

/** Female records add 40 to the day-of-birth field. */
export const FEMALE_DAY_OFFSET = 40;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Build a NIK. `kelurahanCode` is 10 digits; only its first six — provinsi, kabupaten,
 * kecamatan — enter the NIK, which is itself worth noticing: the NIK does not go below
 * kecamatan, so kecamatan is the finest region a NIK alone discloses.
 */
export function buildNik(
  kelurahanCode: string,
  birthdate: string,
  gender: 'M' | 'F',
  sequence: number,
): string {
  const region = kelurahanCode.slice(0, 6);
  const [y, m, d] = birthdate.split('-');
  const day = Number(d) + (gender === 'F' ? FEMALE_DAY_OFFSET : 0);
  return `${region}${pad2(day)}${m}${y.slice(2)}${String(sequence % 10000).padStart(4, '0')}`;
}

export function dissectNik(nik: string): NikParts {
  const rawDay = Number(nik.slice(6, 8));
  const female = rawDay > FEMALE_DAY_OFFSET;
  return {
    provinsi: nik.slice(0, 2),
    kabupaten: nik.slice(2, 4),
    kecamatan: nik.slice(4, 6),
    day: female ? rawDay - FEMALE_DAY_OFFSET : rawDay,
    month: Number(nik.slice(8, 10)),
    year2: Number(nik.slice(10, 12)),
    gender: female ? 'F' : 'M',
    sequence: nik.slice(12, 16),
  };
}

/** A mask is one boolean per digit position: true means the digit is hidden. */
export type NikMask = readonly boolean[];

export function emptyMask(): NikMask {
  return new Array<boolean>(16).fill(false);
}

export function maskRange(mask: NikMask, start: number, end: number, hidden: boolean): NikMask {
  return mask.map((m, i) => (i >= start && i < end ? hidden : m));
}

export function applyMask(nik: string, mask: NikMask, fill = '•'): string {
  let out = '';
  for (let i = 0; i < 16; i++) out += mask[i] ? fill : nik[i];
  return out;
}

/** Card-style masking: last four shown. This is the wrong answer, and the app says why. */
export const PRESET_CARD_MASK: NikMask = Object.freeze(
  new Array(16).fill(true).map((_, i) => i < 12),
) as NikMask;

/**
 * Correct masking: destroy the head — region, date of birth and gender — and the tail
 * may safely remain, because a sequence number within an unknown region and date
 * narrows nothing.
 */
export const PRESET_HEAD_MASK: NikMask = Object.freeze(
  new Array(16).fill(false).map((_, i) => i < 12),
) as NikMask;

export interface NikDisclosure {
  /** Finest region level still readable. */
  region: 'kecamatan' | 'kabupaten' | 'provinsi' | 'none';
  /** Precision of the birth date still readable. */
  date: 'full' | 'month' | 'year' | 'none';
  gender: boolean;
  /** Sequence digits still readable, of four. */
  sequenceDigits: number;
}

/** What a mask leaves behind. This readout is the dissector's whole job (DESIGN §5.4). */
export function disclosure(mask: NikMask): NikDisclosure {
  const visible = (start: number, end: number): boolean => {
    for (let i = start; i < end; i++) if (mask[i]) return false;
    return true;
  };

  const region: NikDisclosure['region'] = visible(4, 6)
    ? 'kecamatan'
    : visible(2, 4)
      ? 'kabupaten'
      : visible(0, 2)
        ? 'provinsi'
        : 'none';

  // A visible day field carries gender as well as day, which is the whole trick.
  const dayVisible = visible(6, 8);
  const monthVisible = visible(8, 10);
  const yearVisible = visible(10, 12);
  const date: NikDisclosure['date'] =
    dayVisible && monthVisible && yearVisible
      ? 'full'
      : monthVisible && yearVisible
        ? 'month'
        : yearVisible
          ? 'year'
          : 'none';

  let sequenceDigits = 0;
  for (let i = 12; i < 16; i++) if (!mask[i]) sequenceDigits++;

  return { region, date, gender: dayVisible, sequenceDigits };
}

/**
 * The Sweeney configuration a given disclosure is equivalent to (PRD §2). Named so the
 * dissector can say which published figure the current mask corresponds to.
 */
export function sweeneyEquivalent(d: NikDisclosure): string {
  if (d.region === 'none' || d.date === 'none') return 'no region–date–gender triple remains';
  const regionLabel =
    d.region === 'kecamatan'
      ? 'district, comparable to a five-digit postcode'
      : d.region === 'kabupaten'
        ? 'city or town'
        : 'county-equivalent';
  const dateLabel =
    d.date === 'full' ? 'full date of birth' : d.date === 'month' ? 'month and year' : 'year only';
  const genderLabel = d.gender ? ' and gender' : '';
  return `${regionLabel}, ${dateLabel}${genderLabel}`;
}
