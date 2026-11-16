import { describe, it, expect } from 'vitest';
import {
  faceParts,
  faceId,
  FACE_SIZES,
  kindsForSize,
  faceForSize,
  faceForKind,
  hasCompound,
} from '../public/js/app/views/setupFaces.js';
import { SETUP_FACES } from '../public/js/app/scoring.js';

describe('setup faces as size and kind', () => {
  it('splits a face id into its size, kind and scoring and back', () => {
    expect(faceParts('40t')).toEqual({ size: 40, kind: 'triple', compound: false });
    expect(faceParts('60s')).toEqual({ size: 60, kind: 'six', compound: false });
    expect(faceParts('80r')).toEqual({ size: 80, kind: 'ring6', compound: false });
    expect(faceParts('40vc')).toEqual({ size: 40, kind: 'vegas', compound: true });
    expect(faceParts('122')).toEqual({ size: 122, kind: 'full', compound: false });
    expect(faceParts('x')).toBeNull();
    for (const f of SETUP_FACES) {
      const { size, kind, compound } = faceParts(f);
      expect(faceId(size, kind, compound)).toBe(f);
    }
  });

  it('offers each size with only the kinds the app has', () => {
    expect(FACE_SIZES).toEqual([40, 60, 80, 122]);
    expect(kindsForSize(40)).toEqual(['full', 'six', 'triple', 'vegas']);
    expect(kindsForSize(60)).toEqual(['full', 'six', 'triple', 'vegas']);
    expect(kindsForSize(80)).toEqual(['full', 'ring6']);
    expect(kindsForSize(122)).toEqual(['full']);
  });

  it('keeps the kind when the new size has it, else the full face', () => {
    expect(faceForSize(80, '40s')).toBe('80');
    expect(faceForSize(60, '40t')).toBe('60t');
    expect(faceForSize(122, '80r')).toBe('122');
  });

  it('offers compound scoring on the indoor faces and keeps it where it can', () => {
    expect(hasCompound(40, 'triple')).toBe(true);
    expect(hasCompound(60, 'full')).toBe(true);
    expect(hasCompound(80, 'ring6')).toBe(false);
    expect(hasCompound(122, 'full')).toBe(false);
    expect(faceForSize(60, '40tc')).toBe('60tc');
    expect(faceForSize(122, '40tc')).toBe('122');
    expect(faceForKind('vegas', '40tc')).toBe('40vc');
    expect(faceForKind('six', '40t')).toBe('40s');
  });
});
