import { useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from './useReducedMotion';

/**
 * A figure that counts to its value rather than replacing it.
 *
 * Discrete control — a result arrived — so a timed transition (DESIGN §6.1). The ramp is
 * short and decelerating, and it never overshoots: a re-identification count that
 * bounced past its value and settled back would be a lie about the measurement, however
 * briefly.
 *
 * Under reduced motion the value is simply the value.
 */
export function useCountUp(value: number, duration = 520): number {
  const reducedMotion = usePrefersReducedMotion();
  // A result that is already on screen at first paint still counts to itself, because
  // the first thing case 1 does is arrive at a number. It starts at nothing, not at a
  // fraction of the answer, so no intermediate frame is a plausible wrong reading.
  const [shown, setShown] = useState(() => (reducedMotion ? value : 0));
  const from = useRef(reducedMotion ? value : 0);
  const frame = useRef(0);

  useEffect(() => {
    if (reducedMotion || duration <= 0) {
      from.current = value;
      setShown(value);
      return;
    }
    const start = performance.now();
    const origin = from.current;
    if (origin === value) return;

    const step = () => {
      const t = Math.min(1, (performance.now() - start) / duration);
      const eased = 1 - (1 - t) * (1 - t) * (1 - t);
      const next = origin + (value - origin) * eased;
      setShown(t < 1 ? Math.round(next) : value);
      if (t < 1) frame.current = requestAnimationFrame(step);
      else from.current = value;
    };
    frame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame.current);
  }, [value, duration, reducedMotion]);

  return shown;
}
