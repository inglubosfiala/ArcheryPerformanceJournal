// The faces offered for a new session (scoring.js SETUP_FACES) seen as the APL setup shows them:
// a size (segmented control), a kind (pills: full, 10–6, 10–5, triple, Vegas) and, on the indoor
// faces, the scoring (standard or compound inner 10). Presentation only: the session still stores
// the face id ('40t', '60sc', '122', ...).
import { SETUP_FACES, FACES, targetFamily } from '../scoring.js';

const KINDS = ['full', 'six', 'ring6', 'triple', 'vegas'];
const SUFFIX = { full: '', six: 's', ring6: 'r', triple: 't', vegas: 'v' };
const KIND_OF = { '': 'full', s: 'six', r: 'ring6', t: 'triple', v: 'vegas' };

/** '40tc' → { size: 40, kind: 'triple', compound: true }; null for an id that is not a face. */
export function faceParts(face) {
  const f = FACES[face];
  if (f?.family) return { size: f.size, kind: f.kind, compound: false };
  const m = /^(\d+)([srtv]?)(c?)$/.exec(String(face ?? ''));
  return m ? { size: Number(m[1]), kind: KIND_OF[m[2]], compound: m[3] === 'c' } : null;
}

/** { 40, 'triple' } → '40t'; with `compound`, '40tc'. */
export const faceId = (size, kind, compound = false) => kind in SUFFIX ? `${size}${SUFFIX[kind]}${compound ? 'c' : ''}` : `${kind}-${size}`;

/** The sizes offered, smallest first: [40, 60, 80, 122]. */
export const FACE_SIZES = [...new Set(SETUP_FACES.filter((f) => targetFamily(f) === 'wa-target').map((f) => faceParts(f).size))].sort((a, b) => a - b);

/** The kinds offered for a size, in the order full, 10–6, 10–5, triple, Vegas. */
export const faceSizesForFamily = (family) => [...new Set(SETUP_FACES.filter((f) => targetFamily(f) === family).map((f) => FACES[f].size))].sort((a, b) => a - b);
export const defaultFamilyFace = (family) => SETUP_FACES.find((f) => targetFamily(f) === family);
export const faceKindLabel = (kind) => {
  const f = Object.values(FACES).find((f) => f.kind === kind);
  return f ? `${f.variant} · ${f.layout === 'five' ? 'five-spot' : f.layout}` : null;
};

export function kindsForSize(size, family = 'wa-target') {
  const offered = new Set(
    SETUP_FACES.filter((f) => targetFamily(f) === family).map(faceParts)
      .filter((p) => p.size === size)
      .map((p) => p.kind),
  );
  return family === 'wa-target' ? KINDS.filter((k) => offered.has(k)) : [...offered];
}

/** Whether a size and kind is also offered with the compound inner 10. */
export const hasCompound = (size, kind) => kind in SUFFIX && SETUP_FACES.includes(faceId(size, kind, true));

/**
 * The face after picking another size: the same kind when that size has it, else its first kind;
 * compound scoring is kept where the new face has it.
 */
export function faceForSize(size, current) {
  const parts = faceParts(current);
  const kinds = kindsForSize(size, targetFamily(current));
  const kind = kinds.includes(parts?.kind) ? parts.kind : kinds[0];
  return faceId(size, kind, !!parts?.compound && hasCompound(size, kind));
}

/** The face after picking another kind of the same size, keeping compound scoring where it exists. */
export function faceForKind(kind, current) {
  const { size, compound } = faceParts(current);
  return faceId(size, kind, compound && hasCompound(size, kind));
}
