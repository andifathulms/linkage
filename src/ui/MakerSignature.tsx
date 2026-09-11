/**
 * The maker's mark.
 *
 * A quiet credit in the footer, kept visually apart from the notice beside it. That
 * notice says what the application does with data and is the only thing in the footer a
 * reader might rely on; this is a name. Merging them would let one borrow the other's
 * weight, so they sit at opposite ends of the same bar and share its one seam.
 *
 * Identity and links live in src/meta.ts, because the landing page renders this too and
 * is a static file the build annotates rather than a component that can import one.
 */
import { MAKER, type MakerIcon } from '../meta';

/**
 * Hand-drawn because the project has no icon dependency and is not getting one for four
 * glyphs. Two are the platforms' own marks and are filled; two are drawn as strokes.
 * Both take their colour from the link, so one hover rule covers all four.
 */
function Glyph({ name }: { name: MakerIcon }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    'aria-hidden': true,
    focusable: 'false' as const,
  };
  switch (name) {
    case 'globe':
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.6">
          <circle cx="12" cy="12" r="9.25" />
          <path d="M2.75 12h18.5" />
          <path d="M12 2.75c2.4 2.5 3.6 5.6 3.6 9.25s-1.2 6.75-3.6 9.25c-2.4-2.5-3.6-5.6-3.6-9.25S9.6 5.25 12 2.75Z" />
        </svg>
      );
    case 'github':
      return (
        <svg {...common} fill="currentColor">
          <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.7 4.7 18.7 5 18.7 5c.6 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3Z" />
        </svg>
      );
    case 'linkedin':
      return (
        <svg {...common} fill="currentColor">
          <path d="M20.4 20.5h-3.6v-5.6c0-1.3 0-3-1.8-3s-2.2 1.4-2.2 2.9v5.7H9.4V9h3.4v1.6h.05c.5-.9 1.6-1.9 3.4-1.9 3.6 0 4.3 2.4 4.3 5.5v6.3ZM5.3 7.4a2.1 2.1 0 1 1 0-4.1 2.1 2.1 0 0 1 0 4.1Zm1.8 13.1H3.6V9h3.5v11.5ZM22.2 0H1.8C.8 0 0 .8 0 1.7v20.5C0 23.2.8 24 1.8 24h20.4c1 0 1.8-.8 1.8-1.7V1.7C24 .8 23.2 0 22.2 0Z" />
        </svg>
      );
    case 'instagram':
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.6">
          <rect x="2.75" y="2.75" width="18.5" height="18.5" rx="5" />
          <circle cx="12" cy="12" r="4.25" />
          <circle cx="17.4" cy="6.6" r="1.15" fill="currentColor" stroke="none" />
        </svg>
      );
  }
}

export function MakerSignature() {
  // Render time, so the year is right without anyone remembering to change it.
  const year = new Date().getFullYear();

  return (
    <div className="maker">
      <p className="maker__line">
        Designed &amp; built by{' '}
        <a
          className="maker__name"
          href={MAKER.portfolio}
          target="_blank"
          rel="noopener noreferrer"
        >
          {MAKER.name}
        </a>{' '}
        <span aria-hidden="true">·</span> © <span className="maker__year">{year}</span>
      </p>
      <ul className="maker__links">
        {MAKER.links.map((link) => (
          <li key={link.label}>
            <a
              className="maker__link"
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={link.label}
            >
              <Glyph name={link.icon} />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
