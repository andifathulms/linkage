/**
 * Mount test: the application boots in a DOM, effects run, and interaction works.
 *
 * The server-render smoke test (render.test.tsx) covers the first render. This covers
 * everything after it — effects, refs, the ResizeObserver, the canvas, and the case
 * progression — which is where the crash-after-first-paint bugs live and where a
 * server render cannot reach.
 *
 * @vitest-environment jsdom
 */
import { describe, expect, it, beforeAll, afterEach } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { App } from '../src/ui/App';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  // jsdom has neither, and the field needs both. Stubbing them here rather than
  // guarding in the component keeps the production path free of test scaffolding.
  class StubResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = StubResizeObserver as unknown as typeof ResizeObserver;

  // This jsdom build exposes `localStorage` as a bare object with no Storage methods, so
  // the progress store would throw rather than degrade. The application already treats
  // storage as optional; the stub is here so these tests exercise the path where it
  // works, which is the one worth covering.
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, String(value)),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() {
        return store.size;
      },
    },
  });

  HTMLCanvasElement.prototype.getContext = (() => ({
    setTransform() {},
    fillRect() {},
    strokeRect() {},
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
  })) as unknown as HTMLCanvasElement['getContext'];
});

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(<App />);
  });
  return container;
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  window.localStorage.clear();
});

function click(element: Element) {
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

describe('the application boots', () => {
  it('renders the shell with the field and the synthetic-data statement', () => {
    const el = mount();
    expect(el.querySelector('.header__name')?.textContent).toBe('Linkage');
    expect(el.querySelector('canvas')).not.toBeNull();
    expect(el.textContent).toContain("All records are generated. No real person's data is used or accepted.");
  });

  it('lands the linkage within the first render, with a scored count', () => {
    // PRD §8.4: a successful linkage within 60 seconds of first load. It is on screen
    // before the user does anything.
    const el = mount();
    expect(el.textContent).toContain('targets uniquely identified');
    expect(el.textContent).toMatch(/\d+ of \d+/);
  });

  it('locks later cases until the earlier ones are complete', () => {
    const el = mount();
    const items = [...el.querySelectorAll('.cases__item')] as HTMLButtonElement[];
    expect(items).toHaveLength(6);
    expect(items[0].disabled).toBe(false);
    // Case 2 unlocks only after the join has finished resolving, which has not happened
    // on the first render. Everything past it stays locked regardless.
    expect(items[1].disabled).toBe(true);
    expect(items[2].disabled).toBe(true);
    expect(items[5].disabled).toBe(true);
  });

  it('unlocks case 2 once the join has resolved, and no further', async () => {
    const el = mount();
    // Rows resolve one after another over the join duration; the case completes when the
    // last one has landed.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 800));
    });
    const items = [...el.querySelectorAll('.cases__item')] as HTMLButtonElement[];
    expect(items[1].disabled).toBe(false);
    expect(items[2].disabled).toBe(true);
  });

  it('opens the synthetic-data explanation without navigating away', () => {
    const el = mount();
    const marker = el.querySelector('.synthetic__marker') as HTMLButtonElement;
    click(marker);
    expect(el.querySelector('.synthetic__body')?.textContent).toContain('no file input');
  });

  it('opens a citation popover', () => {
    const el = mount();
    const cite = el.querySelector('.cite') as HTMLButtonElement;
    expect(cite.textContent).toBe('Sweeney 2000');
    click(cite);
    expect(el.querySelector('.cite__popover')?.textContent).toContain('Data Privacy Working Paper');
  });

  it('shows the field table equivalent on request', () => {
    const el = mount();
    const buttons = [...el.querySelectorAll('button')] as HTMLButtonElement[];
    const toggle = buttons.find((b) => b.textContent === 'Table equivalent')!;
    click(toggle);
    expect(el.textContent).toContain('Equivalence classes, smallest first');
  });

  it('opens the class inspector on the smallest class', () => {
    const el = mount();
    const buttons = [...el.querySelectorAll('button')] as HTMLButtonElement[];
    click(buttons.find((b) => b.textContent === 'Select the smallest class')!);
    expect(el.querySelector('.inspector')).not.toBeNull();
    expect(el.textContent).toContain('Generalised key');
  });

  it('puts the configuration in the URL and nothing else', () => {
    mount();
    const params = new URLSearchParams(window.location.search);
    expect(params.get('seed')).not.toBeNull();
    expect(params.get('v')).not.toBeNull();
    // Case progress and attack results stay local (CLAUDE.md §9).
    expect(params.get('progress')).toBeNull();
    expect(window.location.search).not.toContain('nik');
    expect(window.location.search).not.toContain('name');
  });

  it('makes the canvas keyboard reachable', () => {
    const el = mount();
    const canvas = el.querySelector('canvas') as HTMLCanvasElement;
    expect(canvas.tabIndex).toBe(0);
    expect(canvas.getAttribute('aria-label')).toContain('arrow keys');
  });

  it('has no file input anywhere in the mounted DOM', () => {
    const el = mount();
    expect(el.querySelector('input[type=file]')).toBeNull();
    const inputs = [...el.querySelectorAll('input')] as HTMLInputElement[];
    for (const input of inputs) expect(input.type).not.toBe('file');
  });
});

describe('the cases are reachable once unlocked', () => {
  it('walks all five cases and the sandbox without crashing', async () => {
    const el = mount();
    // Complete every case by hand, the way progress is stored, then remount.
    window.localStorage.setItem(
      'linkage.progress.v1',
      JSON.stringify(['linkage', 'k-anonymity', 'l-diversity', 'aggregates', 'budget']),
    );
    act(() => root!.unmount());
    el.remove();

    const again = mount();
    const items = [...again.querySelectorAll('.cases__item')] as HTMLButtonElement[];
    for (const item of items) {
      expect(item.disabled).toBe(false);
      await act(async () => {
        item.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(again.querySelector('.main')?.textContent?.length ?? 0).toBeGreaterThan(50);
    }
    // The last one is the sandbox, which carries the instruments.
    expect(again.textContent).toContain('Privacy–utility frontier');
  });
});
