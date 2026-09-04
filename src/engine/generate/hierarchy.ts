/**
 * provinsi → kabupaten/kota → kecamatan → kelurahan.
 *
 * Provinsi names and their two-digit codes are the published national codes, because
 * the NIK dissector (PRD §5.4) is only legible if the leading digits mean what a reader
 * expects. Everything below provinsi is assembled from fragments — the names are
 * plausible, not real, and no real kelurahan roll is reproduced here.
 *
 * Cardinality at each level drives every result in the app (PRD §4.1), so fan-out is
 * derived from each unit's weight rather than being uniform: a heavy kabupaten has more
 * kecamatan, which is what makes region granularity a meaningful control.
 */
import type { Hierarchy, HierarchyNode, KelurahanRef } from '../types';
import { deriveRng, type Rng } from '../rng';

interface ProvinsiSeed {
  code: string;
  name: string;
  weight: number;
}

/** Published provinsi codes with roughly proportional population weights. */
const PROVINSI: readonly ProvinsiSeed[] = [
  { code: '11', name: 'Aceh', weight: 54 },
  { code: '12', name: 'Sumatera Utara', weight: 150 },
  { code: '13', name: 'Sumatera Barat', weight: 56 },
  { code: '14', name: 'Riau', weight: 66 },
  { code: '15', name: 'Jambi', weight: 36 },
  { code: '16', name: 'Sumatera Selatan', weight: 86 },
  { code: '17', name: 'Bengkulu', weight: 20 },
  { code: '18', name: 'Lampung', weight: 91 },
  { code: '31', name: 'DKI Jakarta', weight: 106 },
  { code: '32', name: 'Jawa Barat', weight: 500 },
  { code: '33', name: 'Jawa Tengah', weight: 370 },
  { code: '34', name: 'DI Yogyakarta', weight: 37 },
  { code: '35', name: 'Jawa Timur', weight: 410 },
  { code: '36', name: 'Banten', weight: 120 },
  { code: '51', name: 'Bali', weight: 43 },
  { code: '52', name: 'Nusa Tenggara Barat', weight: 54 },
  { code: '53', name: 'Nusa Tenggara Timur', weight: 55 },
  { code: '61', name: 'Kalimantan Barat', weight: 55 },
  { code: '63', name: 'Kalimantan Selatan', weight: 42 },
  { code: '64', name: 'Kalimantan Timur', weight: 39 },
  { code: '71', name: 'Sulawesi Utara', weight: 26 },
  { code: '73', name: 'Sulawesi Selatan', weight: 92 },
  { code: '81', name: 'Maluku', weight: 19 },
  { code: '94', name: 'Papua', weight: 44 },
];

const KABUPATEN_HEAD = ['Kabupaten', 'Kota'] as const;

const PLACE_STEM = [
  'Sari', 'Mekar', 'Tanjung', 'Sungai', 'Bukit', 'Muara', 'Padang', 'Batu',
  'Cempaka', 'Kenanga', 'Melati', 'Rawa', 'Sumber', 'Karang', 'Pasir', 'Cipta',
  'Waringin', 'Kalibaru', 'Panca', 'Wana', 'Tirta', 'Giri', 'Jati', 'Lembah',
];

const PLACE_TAIL = [
  'jaya', 'mulya', 'asih', 'indah', 'makmur', 'raya', 'baru', 'agung',
  'wangi', 'rahayu', 'sejahtera', 'utara', 'selatan', 'timur', 'barat',
];

function placeName(rng: Rng): string {
  const stem = PLACE_STEM[rng.int(PLACE_STEM.length)];
  const tail = PLACE_TAIL[rng.int(PLACE_TAIL.length)];
  return `${stem}${tail}`;
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

/**
 * Fan-out from weight: heavier units subdivide further. Clamped so that even the
 * lightest provinsi has a usable hierarchy and the heaviest does not explode.
 */
function fanOut(weight: number, base: number, min: number, max: number): number {
  const n = Math.round(min + (weight / base) * (max - min));
  return Math.max(min, Math.min(max, n));
}

export function buildHierarchy(seed: number, provinsiCount: number): Hierarchy {
  const rng = deriveRng(seed, 'hierarchy');
  const chosen = PROVINSI.slice(0, Math.max(1, Math.min(PROVINSI.length, provinsiCount)));
  const heaviest = chosen.reduce((m, p) => Math.max(m, p.weight), 1);

  const provinsi: HierarchyNode[] = [];
  const kelurahan: KelurahanRef[] = [];
  const byCode = new Map<string, KelurahanRef>();

  for (const p of chosen) {
    const kabCount = fanOut(p.weight, heaviest, 2, 12);
    const kabNodes: HierarchyNode[] = [];

    for (let ki = 0; ki < kabCount; ki++) {
      const kabCode = p.code + pad(ki + 1, 2);
      const head = KABUPATEN_HEAD[ki === 0 ? 1 : 0];
      const kabName = `${head} ${placeName(rng)}`;
      // Weight within a provinsi varies, so kabupaten are not interchangeable.
      const kabWeight = (p.weight / kabCount) * rng.range(0.5, 1.8);
      const kecCount = fanOut(kabWeight, heaviest / kabCount, 3, 16);
      const kecNodes: HierarchyNode[] = [];

      for (let ci = 0; ci < kecCount; ci++) {
        const kecCode = kabCode + pad(ci + 1, 2);
        const kecName = placeName(rng);
        const kecWeight = (kabWeight / kecCount) * rng.range(0.6, 1.6);
        const kelCount = fanOut(kecWeight, kabWeight / kecCount, 4, 14);
        const kelNodes: HierarchyNode[] = [];

        for (let li = 0; li < kelCount; li++) {
          const kelCode = kecCode + pad(li + 1, 4);
          const kelName = placeName(rng);
          const kelWeight = (kecWeight / kelCount) * rng.range(0.5, 1.7);
          const ref: KelurahanRef = {
            code: kelCode,
            name: kelName,
            weight: kelWeight,
            provinsi: { code: p.code, name: p.name },
            kabupaten: { code: kabCode, name: kabName },
            kecamatan: { code: kecCode, name: kecName },
          };
          kelurahan.push(ref);
          byCode.set(kelCode, ref);
          kelNodes.push({ code: kelCode, name: kelName, weight: kelWeight, children: [] });
        }

        kecNodes.push({ code: kecCode, name: kecName, weight: kecWeight, children: kelNodes });
      }

      kabNodes.push({ code: kabCode, name: kabName, weight: kabWeight, children: kecNodes });
    }

    provinsi.push({ code: p.code, name: p.name, weight: p.weight, children: kabNodes });
  }

  return { provinsi, kelurahan, byCode };
}

/** Count of distinct units at each level, which is what drives uniqueness. */
export function hierarchyCardinalities(h: Hierarchy): {
  provinsi: number;
  kabupaten: number;
  kecamatan: number;
  kelurahan: number;
} {
  let kabupaten = 0;
  let kecamatan = 0;
  for (const p of h.provinsi) {
    kabupaten += p.children.length;
    for (const kab of p.children) kecamatan += kab.children.length;
  }
  return {
    provinsi: h.provinsi.length,
    kabupaten,
    kecamatan,
    kelurahan: h.kelurahan.length,
  };
}
