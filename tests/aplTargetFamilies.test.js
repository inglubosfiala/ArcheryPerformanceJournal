// @vitest-environment happy-dom
import { describe, expect, it, vi, afterEach } from 'vitest';
import { renderShootingSetup } from '../public/js/app/views/shootingSetup.js';
import { renderLog } from '../public/js/app/views/log.js';
import { renderOverview } from '../public/js/app/views/sessionOverview.js';
import { createState } from '../public/js/core/state.js';
import { createRepository } from '../public/js/storage/repository.js';
import { createMemoryAdapter } from '../public/js/storage/localStorageAdapter.js';
import { collections, defaultSettings } from '../public/js/app/collections.js';
import { createSession } from '../public/js/app/sessionLogic.js';
import { faceRings } from '../public/js/app/views/face.js';
import { EXTRA_FACES } from '../public/js/app/targetCatalog.js';
import { TARGET_COLOURS, colourBands } from '../public/js/app/scoring.js';

function context() {
  const repo = createRepository({
    adapter: createMemoryAdapter(),
    storageKey: 'ui',
    appId: 'apj',
    schemaVersion: 9,
    collections,
    defaultSettings,
    migrations: [],
  });
  repo.init();
  return {
    repo,
    ui: createState(),
    running: { get: () => null, start: vi.fn().mockResolvedValue({ status: 'started' }) },
    navigate: vi.fn(),
    finished: { list: () => [] },
  };
}
const control = (root, fk) => root.querySelector(`[data-fk="${fk}"]`);
afterEach(() => vi.useRealTimers());

describe('target-family setup and rendering', () => {
  it('selects family, size and layout, converts yards, and starts with the exact new face', async () => {
    const ctx = context();
    const render = () => renderShootingSetup(ctx, 'training').content;
    control(render(), 'face-family-ifaa-indoor').click();
    let root = render();
    expect(root.textContent).toContain('Camera scanning is not available');
    expect(control(root, 'face-scoring-compound')).toBeNull();
    control(root, 'face-size-16').click();
    root = render();
    expect(root.querySelector('svg[role="img"]').getAttribute('aria-label')).toContain('five-spot');
    const yards = control(root, 'distance-yards');
    yards.value = '20';
    yards.dispatchEvent(new Event('change'));
    root = render();
    expect(control(root, 'distance-metres').value).toBe('18.288');
    control(root, 'setup-start').click();
    await Promise.resolve();
    expect(ctx.running.start).toHaveBeenCalledWith(
      expect.objectContaining({ face: 'ifaa-indoor-blue-five-16', distance: 18.288, arrowsPerEnd: 5 }),
    );
  });

  it('keeps non-WA faces when distance changes and restores original WA controls when selected', () => {
    const ctx = context();
    const render = () => renderShootingSetup(ctx, 'training').content;
    control(render(), 'face-family-ifaa-field').click();
    control(render(), 'face-size-35').click();
    control(render(), 'dist-30').click();
    expect(ctx.ui.get().setup.kinds.training.face).toBe('ifaa-field-standard-single-35');
    control(render(), 'face-family-wa-target').click();
    expect(control(render(), 'face-scoring-compound')).not.toBeNull();
    expect(control(render(), 'distance-yards')).toBeNull();
  });

  it('draws every added target with its palette and scoring boundaries', () => {
    for (const id of Object.keys(EXTRA_FACES)) {
      const circles = faceRings(id);
      expect(circles.length).toBeGreaterThan(0);
      const colours = new Set(colourBands(id).map((b) => TARGET_COLOURS[b.zone]));
      for (const circle of circles) expect(colours.has(circle.getAttribute('fill'))).toBe(true);
    }
  });

  it('shows five spots and face-specific score keys, and disables both incompatible cameras', () => {
    vi.useFakeTimers();
    const ctx = context();
    const session = {
      ...createSession({
        date: '2026-11-20',
        distance: 18.288,
        face: 'ifaa-indoor-blue-five-16',
        arrowsPerEnd: 5,
      }),
      id: 'active',
    };
    ctx.running.get = () => session;
    const root = renderLog(ctx).content;
    expect(control(root, 'photo').disabled).toBe(true);
    expect(control(root, 'photo-multiview').disabled).toBe(true);
    expect(root.textContent).toContain('Camera scanning is not available');
    const keys = [...root.querySelectorAll('[aria-label^="Score "]')].map((node) =>
      node.getAttribute('aria-label'),
    );
    expect(keys).toContain('Score 5');
    expect(keys).toContain('Score 4');
    expect(keys).not.toContain('Score X');
    expect(keys).not.toContain('Score 10');
  });

  it('shows five-point X totals and labels in History and keeps end scores consistent', () => {
    const ctx = context();
    const session = {
      ...createSession({
        date: '2026-11-20',
        distance: 18.288,
        face: 'ifaa-indoor-blue-single-40',
        arrowsPerEnd: 3,
      }),
      id: 'finished',
      status: 'finished',
    };
    session.ends = [
      {
        ...session.current,
        arrows: [
          { v: 'X', m: 1, s: 1 },
          { v: 5, m: 1, s: 1 },
          { v: 4, m: 1, s: 1 },
        ],
      },
    ];
    const { content } = renderOverview(ctx, session);
    expect(content.querySelector('h1').textContent).toContain('14');
    expect([...content.querySelectorAll('.ov-count-l')].map((el) => el.textContent)).toEqual([
      'X',
      '5',
      '4',
      '3 and less',
    ]);
    expect(content.querySelector('.ov-end-sum').textContent).toBe('14');
  });
});
