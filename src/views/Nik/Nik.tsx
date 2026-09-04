/**
 * The NIK dissector. DESIGN.md §5.4, PRD §3 and §5.4.
 *
 * Sixteen digit cells, segmented and labelled by what each segment encodes. A mask you
 * drag across the digits, and three live readouts: what remains known, the resulting
 * uniqueness in the current population, and the equivalent Sweeney configuration.
 *
 * Two presets side by side, permanently visible: card-style masking (last four shown)
 * and correct masking (head destroyed). The gap between their two uniqueness figures is
 * this view's entire argument, and it should require no explanation.
 *
 * Designed phone-first: sixteen digits across a phone width, thumb-draggable mask.
 */
import { useMemo, useState } from 'react';
import type { PersonRecord } from '../../engine/types';
import {
  NIK_SEGMENTS,
  applyMask,
  disclosure,
  emptyMask,
  sweeneyEquivalent,
  PRESET_CARD_MASK,
  PRESET_HEAD_MASK,
  type NikMask,
} from '../../engine/generate/nik';
import { empiricalUniqueness } from '../../engine/uniqueness';
import { Readout } from '../../ui/primitives';

export interface NikProps {
  records: readonly PersonRecord[];
}

/**
 * What a mask leaves an attacker, as a joinable key. A masked digit contributes nothing,
 * so two records with the same visible digits are indistinguishable on the NIK alone —
 * which is exactly the uniqueness question.
 */
function keysUnderMask(records: readonly PersonRecord[], mask: NikMask): string[] {
  const out: string[] = new Array(records.length);
  for (let i = 0; i < records.length; i++) {
    let key = '';
    const nik = records[i].nik;
    for (let d = 0; d < 16; d++) key += mask[d] ? '·' : nik[d];
    out[i] = key;
  }
  return out;
}

export function Nik({ records }: NikProps) {
  const [mask, setMask] = useState<NikMask>(() => emptyMask());
  const [index, setIndex] = useState(0);
  const record = records[Math.min(index, records.length - 1)];

  const uniquenessOf = useMemo(() => {
    const cache = new Map<string, number>();
    return (m: NikMask): number => {
      const key = m.map((v) => (v ? '1' : '0')).join('');
      const cached = cache.get(key);
      if (cached !== undefined) return cached;
      const value = empiricalUniqueness(keysUnderMask(records, m));
      cache.set(key, value);
      return value;
    };
  }, [records]);

  const current = disclosure(mask);
  const currentUniqueness = uniquenessOf(mask);
  const cardUniqueness = uniquenessOf(PRESET_CARD_MASK);
  const headUniqueness = uniquenessOf(PRESET_HEAD_MASK);

  const toggle = (i: number) => setMask((m) => m.map((v, j) => (j === i ? !v : v)));

  /** Thumb-draggable: pointer down then move paints the mask across digits. */
  const [painting, setPainting] = useState<boolean | null>(null);
  const paint = (i: number) => {
    if (painting === null) return;
    setMask((m) => m.map((v, j) => (j === i ? painting : v)));
  };

  return (
    <section className="panel" aria-label="NIK dissector">
      <div className="panel__title">NIK dissector</div>

      <p className="note">
        A NIK is sixteen digits with a published structure. It does not merely identify: it encodes
        region, date of birth and gender by construction — Sweeney's quasi-identifier triple, written
        into the number itself. Female records add 40 to the day-of-birth field, so the day digits
        carry gender too.
      </p>

      <div
        className="nik"
        onPointerUp={() => setPainting(null)}
        onPointerLeave={() => setPainting(null)}
      >
        <div className="nik__segments" aria-hidden="true">
          {NIK_SEGMENTS.map((segment) => (
            <div
              key={segment.id}
              className="nik__segment"
              style={{ gridColumn: `${segment.start + 1} / ${segment.end + 1}` }}
            >
              <span className="nik__segmentLabel">{segment.label}</span>
            </div>
          ))}
        </div>
        <div className="nik__digits" role="group" aria-label="Sixteen digit cells; activate a digit to mask it">
          {record.nik.split('').map((digit, i) => {
            const segment = NIK_SEGMENTS.find((s) => i >= s.start && i < s.end)!;
            return (
              <button
                key={i}
                type="button"
                className="nik__digit"
                data-masked={mask[i]}
                data-boundary={i === segment.start && i !== 0}
                aria-pressed={mask[i]}
                aria-label={`Digit ${i + 1}, ${segment.label}, encodes ${segment.encodes}. ${
                  mask[i] ? 'Masked' : 'Visible'
                }`}
                onPointerDown={() => {
                  setPainting(!mask[i]);
                  toggle(i);
                }}
                onPointerEnter={() => paint(i)}
              >
                {mask[i] ? '•' : digit}
              </button>
            );
          })}
        </div>
      </div>

      <div className="readout" style={{ marginTop: 'var(--s-3)' }}>
        <Readout
          label="Region still readable"
          value={current.region === 'none' ? 'none' : current.region}
        />
        <Readout label="Date precision" value={current.date} />
        <Readout label="Gender" value={current.gender ? 'disclosed' : 'hidden'} />
        <Readout
          label="Uniquely identified in this population"
          value={`${(currentUniqueness * 100).toFixed(1)}%`}
          exposed={currentUniqueness > 0.2}
        />
      </div>

      <p className="note" style={{ marginTop: 'var(--s-2)' }}>
        Equivalent Sweeney configuration: {sweeneyEquivalent(current)}.
      </p>

      {/* Two presets, side by side, permanently visible. The gap is the argument. */}
      <div className="nik__presets">
        <div className="nik__preset">
          <div className="panel__title">Card-style masking</div>
          <div className="nik__presetDigits">{applyMask(record.nik, PRESET_CARD_MASK)}</div>
          <div className="display">{(cardUniqueness * 100).toFixed(1)}%</div>
          <p className="note">
            Last four shown, as a payment card is masked. Region, date of birth and gender are all
            destroyed — but so is nothing an attacker needed, because those digits were the head, and
            what remains is the sequence number.
          </p>
        </div>
        <div className="nik__preset">
          <div className="panel__title">Head destroyed</div>
          <div className="nik__presetDigits">{applyMask(record.nik, PRESET_HEAD_MASK)}</div>
          <div className="display">{(headUniqueness * 100).toFixed(1)}%</div>
          <p className="note">
            The first twelve digits removed and the tail kept. A sequence number within an unknown
            region and date narrows nothing.
          </p>
        </div>
      </div>

      <p className="note">
        Card masking keeps the last four digits because on a card the leading digits are the issuer
        and the tail is what distinguishes one card from another. On a NIK the arrangement is
        reversed: the head is the identifying part and the tail is registration order. Applying the
        card convention to a NIK preserves what identifies and hides what does not.
      </p>

      <div className="buttons">
        <button type="button" className="button button--quiet" onClick={() => setMask(PRESET_CARD_MASK)}>
          Apply card-style masking
        </button>
        <button type="button" className="button button--quiet" onClick={() => setMask(PRESET_HEAD_MASK)}>
          Apply head masking
        </button>
        <button type="button" className="button button--quiet" onClick={() => setMask(emptyMask())}>
          Clear the mask
        </button>
        <button
          type="button"
          className="button button--quiet"
          onClick={() => setIndex((i) => (i + 1) % records.length)}
        >
          Another record
        </button>
      </div>
    </section>
  );
}
