import { describe, it, expect } from 'vitest';
import {
  FACES,
  scoringZones,
  scoringProfile,
  scoreFromPoint,
  arrowValue,
  maxArrowValue,
  keypadValues,
  colourBands,
  zoneOf,
  cameraSupported,
  faceLabel,
  spotCentres,
} from '../public/js/app/scoring.js';
import { EXTRA_FACES } from '../public/js/app/targetCatalog.js';
import {
  faceParts,
  faceId,
  kindsForSize,
  faceForSize,
  faceSizesForFamily,
} from '../public/js/app/views/setupFaces.js';
import { sumArrows, computeStats } from '../public/js/app/stats.js';
import { endRows, sessionTotal } from '../public/js/app/endSummary.js';
import { averageDelta, gradeInsight, scoreSummary } from '../public/js/app/sessionInsights.js';
import { canScan } from '../public/js/app/scan.js';
import { detectArrows } from '../public/js/app/photoDetect.js';
import { createRepository } from '../public/js/storage/repository.js';
import { createMemoryAdapter } from '../public/js/storage/localStorageAdapter.js';
import { collections, defaultSettings } from '../public/js/app/collections.js';
import { serialiseBackup, parseBackup } from '../public/js/backup/backup.js';
import { createSession } from '../public/js/app/sessionLogic.js';

const indoor = 'ifaa-indoor-blue-single-40';
const five = 'ifaa-indoor-blue-five-16';
const field = 'ifaa-field-standard-single-35';
const wa = 'wa-field-teal-single-40';
const ends = [
  {
    arrows: [
      { v: 'X', m: 1 },
      { v: 5, m: 1 },
      { v: 4, m: 1 },
    ],
    ld: 0,
    cld: 0,
    note: '',
  },
];
const makeRepo = (adapter) =>
  createRepository({
    adapter,
    storageKey: 'targets',
    appId: 'apj',
    schemaVersion: 9,
    collections,
    defaultSettings,
    migrations: [],
  });

describe('extensible circular target catalog', () => {
  it('has explicit compatible definitions for every added face and variant', () => {
    expect(Object.keys(EXTRA_FACES).length).toBeGreaterThan(30);
    for (const [id, face] of Object.entries(EXTRA_FACES)) {
      const zones = scoringZones(id);
      expect(zones.at(-1).edge).toBe(1);
      expect(zones.every((z, i) => z.edge > (zones[i - 1]?.edge || 0))).toBe(true);
      for (const [i, zone] of zones.entries())
        expect(scoreFromPoint((zone.edge + (zones[i - 1]?.edge || 0)) / 2, 0, id)).toBe(zone.value);
      expect(scoreFromPoint(1.01, 0, id)).toBe('M');
      expect(colourBands(id).at(-1).edge).toBe(1);
      expect(maxArrowValue(id)).toBe(face.family === 'wa-field' ? 6 : 5);
      expect(cameraSupported(id)).toBe(true);
      const { size, kind, compound } = faceParts(id);
      expect(faceId(size, kind, compound)).toBe(id);
      expect(faceLabel(id)).toContain(String(face.size));
    }
  });

  it('implements WA Field six-zone geometry, both palettes and inward boundary scoring', () => {
    expect(scoringZones(wa).map((z) => [z.edge, z.value])).toEqual([
      [0.1, 6],
      [0.2, 5],
      [0.4, 4],
      [0.6, 3],
      [0.8, 2],
      [1, 1],
    ]);
    expect(scoreFromPoint(0.1, 0, wa)).toBe(6);
    expect(scoreFromPoint(0.10001, 0, wa)).toBe(5);
    expect(scoreFromPoint(1, 0, wa)).toBe(1);
    expect(keypadValues(wa)).toEqual([6, 5, 4, 3, 2, 1, 'M']);
    expect(colourBands(wa)).toEqual([
      { edge: 0.2, zone: 'gold' },
      { edge: 1, zone: 'teal' },
    ]);
    expect(zoneOf(5, wa)).toBe('gold');
    expect(zoneOf(4, wa)).toBe('teal');
    expect(spotCentres('wa-field-black-triple-20')).toHaveLength(3);
    expect(spotCentres('wa-field-teal-four-40')).toHaveLength(4);
    expect(spotCentres('wa-field-black-double-60')).toHaveLength(2);
  });

  it('implements IFAA Field and Hunter geometry with distinct palettes', () => {
    expect(scoringZones(field).map((z) => [z.edge, z.value])).toEqual([
      [0.2, 5],
      [0.6, 4],
      [1, 3],
    ]);
    expect(scoreFromPoint(0.2, 0, field)).toBe(4);
    expect(scoreFromPoint(0.6, 0, field)).toBe(3);
    expect(scoreFromPoint(1, 0, field)).toBe('M');
    expect(keypadValues(field)).toEqual([5, 4, 3, 'M']);
    expect(colourBands(field).map((b) => b.zone)).toEqual(['black', 'white', 'black']);
    expect(colourBands('ifaa-hunter-standard-single-35').map((b) => b.zone)).toEqual(['white', 'black']);
  });

  it('distinguishes five-point indoor and expert X from the old ten-point X', () => {
    expect(arrowValue('X', indoor)).toBe(5);
    expect(arrowValue('X', 'ifaa-expert-standard-single-65')).toBe(5);
    expect(arrowValue('X', '40t')).toBe(10);
    expect(arrowValue('X')).toBe(10);
    expect(keypadValues(five)).toEqual([5, 4, 'M']);
    expect(scoreFromPoint(0.499, 0, five)).toBe(5);
    expect(scoreFromPoint(0.5, 0, five)).toBe(4);
    expect(scoreFromPoint(0.501, 0, five)).toBe(4);
    expect(spotCentres(five)).toHaveLength(5);
    expect(scoringProfile(indoor).boundary).toBe('outer');
  });

  it('offers field and Flint sizes without silently returning to WA Target', () => {
    expect(faceSizesForFamily('ifaa-field')).toEqual([20, 35, 50, 65]);
    expect(faceSizesForFamily('wa-field')).toEqual([20, 40, 60, 80]);
    expect(faceSizesForFamily('ifaa-flint')).toEqual([20, 21, 35, 50]);
    expect(faceForSize(50, field)).toBe('ifaa-field-standard-single-50');
    expect(kindsForSize(40, 'wa-field')).toHaveLength(4);
    expect(scoringZones('ifaa-flint-centre-four-21').map((z) => [z.edge, z.value])).toEqual([
      [1 / 3, 5],
      [1, 4],
    ]);
  });

  it('enables registered targets and rejects unknown detector requests before accessing pixels', () => {
    expect(canScan({ face: field, view: null })).toBe(true);
    expect(canScan({ face: '40t', view: null })).toBe(true);
    expect(detectArrows(null, 'unknown-face', 4).error).toContain('not available');
    expect(cameraSupported('40tc')).toBe(true);
    expect(FACES['80s']).toBeDefined();
  });
});

describe('face-aware totals and persistence', () => {
  it('uses the selected face in end totals, stats, maxima and score buckets', () => {
    expect(sumArrows(ends[0].arrows, indoor)).toBe(14);
    expect(sumArrows(ends[0].arrows, '40t')).toBe(19);
    expect(computeStats(ends, indoor)).toMatchObject({ total: 14, max: 15, xs: 1, tens: 0 });
    expect(computeStats([{ arrows: [{ v: 6 }, { v: 5 }], ld: 0, cld: 0 }], wa)).toMatchObject({
      total: 11,
      max: 12,
    });
    const session = { face: indoor, ends: [], current: ends[0] };
    expect(sessionTotal(session)).toBe(14);
    expect(endRows(session)[0]).toMatchObject({ sum: 14, run: 14 });
    expect(scoreSummary(ends, indoor).map((b) => b.label)).toEqual(['X', '5', '4', '3 and less']);
  });

  it('uses five-point X in grade insights and comparisons with previous matching sessions', () => {
    const graded = [
      { ...ends[0], arrows: [...ends[0].arrows, ...ends[0].arrows.map((a) => ({ ...a, m: 3 }))] },
    ];
    expect(gradeInsight(graded, indoor).m1.avg).toBeCloseTo(14 / 3);
    const session = { id: 'new', face: indoor, distance: 18.288, date: '2026-11-20', ends };
    const prior = [1, 2, 3].map((id) => ({
      ...session,
      id: String(id),
      date: '2026-11-19',
      status: 'finished',
      type: 'training',
    }));
    expect(averageDelta(session, prior)).toMatchObject({ delta: 0, sessions: 3 });
    expect(averageDelta(session, prior).average).toBeCloseTo(14 / 3);
  });

  it('validates five spots, scores and catalog identifiers through repository save/reload', () => {
    const adapter = createMemoryAdapter();
    const repo = makeRepo(adapter);
    repo.init();
    const session = createSession({ date: '2026-11-20', distance: 18.288, face: five, arrowsPerEnd: 5 });
    session.current.arrows = session.current.arrows.map((a, spot) => ({ ...a, spot, v: 5, x: 0, y: 0 }));
    const saved = repo.save('sessions', session);
    expect(saved).toBeTruthy();
    const loaded = makeRepo(adapter);
    loaded.init();
    expect(loaded.get('sessions', saved.id).current.arrows[4].spot).toBe(4);
    const restored = makeRepo(createMemoryAdapter());
    restored.init();
    restored.importDocument(parseBackup(serialiseBackup(repo.exportDocument())), { mode: 'replace' });
    expect(restored.get('sessions', saved.id).face).toBe(five);
    expect(sessionTotal(restored.get('sessions', saved.id))).toBe(25);
    expect(() =>
      repo.save('sessions', {
        ...saved,
        current: { ...saved.current, arrows: saved.current.arrows.map((a) => ({ ...a, v: 10 })) },
      }),
    ).toThrow();
    expect(() =>
      repo.save('sessions', {
        ...saved,
        current: { ...saved.current, arrows: saved.current.arrows.map((a) => ({ ...a, spot: 5 })) },
      }),
    ).toThrow();
  });
});
