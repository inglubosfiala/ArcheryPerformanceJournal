// Experimental multi-view fusion using the detector's existing per-spot ellipse coordinates.
// This is not calibrated 3D reconstruction. Keep the target upright and use a shallow sweep.
import { matchArrows } from './photoDetect.js';
import { withArrows } from './scanGeometry.js';
import { scoreFromPoint } from './scoring.js';

export const MULTI_VIEW_MIN = 3;
export const MULTI_VIEW_GOAL = 5;
const INTERVAL_MS = 350;
const MATCH_TOLERANCE = 0.18;
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

// Appearance diversity is a proxy, not proof of camera translation: panning can change it too.
// Measure in target radii, rather than image pixels, so automatic crop changes do not count.
function appearance(res) {
  const first = res.spots[0].outer;
  const radius = Math.max(first.rx, first.ry);
  return res.arrows.map((arrow) => {
    const o = res.spots[arrow.spot ?? 0].outer;
    return [
      (o.cx - first.cx) / radius,
      (o.cy - first.cy) / radius,
      Math.min(o.rx, o.ry) / Math.max(o.rx, o.ry),
      arrow.lean?.x ?? 0,
      arrow.lean?.y ?? 0,
    ];
  });
}

export function createMultiViewReading({ face, maxArrows }) {
  let views = [];
  let last = null;
  let lastTime = -Infinity;

  const take = () => {
    if (views.length < MULTI_VIEW_MIN) return null;
    const arrows = views[0].arrows.map((a, i) => ({
      ...a,
      x: median(views.map((v) => v.arrows[i].x)),
      y: median(views.map((v) => v.arrows[i].y)),
      // Directions belong to a particular image, not the combined coordinates.
      lean: last.arrows[i].lean,
    }));
    return withArrows(last, arrows);
  };

  function read(res, now) {
    let accepted = false;
    let message = 'Move slowly sideways, keeping the whole target visible.';
    if (res.error) message = 'Target lost. Bring it back into the frame, or reset the sweep.';
    else if (res.partial) message = 'Show the whole target sheet for multi-view scanning.';
    else if (!res.arrows.length) message = 'Target found. Looking for arrows…';
    else if (res.arrows.length !== maxArrows)
      message = `Show all ${maxArrows} arrows before collecting views.`;
    else if (res.arrows.some((a) => !Number.isFinite(a.x) || !Number.isFinite(a.y)))
      message = 'Reading arrow positions…';
    else if (now - lastTime >= INTERVAL_MS && views.length < MULTI_VIEW_GOAL) {
      const map = views.length
        ? matchArrows(views[0].arrows, res.arrows, MATCH_TOLERANCE)
        : res.arrows.map((_, i) => i);
      // Reject ambiguous association when two arrows on the same spot are very close together.
      const ambiguous = res.arrows.some((a, i) =>
        res.arrows.some((b, j) => i !== j && a.spot === b.spot && Math.hypot(a.x - b.x, a.y - b.y) < 0.12),
      );
      if (!map || ambiguous)
        message = 'Readings disagree or arrows overlap. Adjust the angle, or reset the sweep.';
      else {
        const aligned = { ...res, arrows: map.map((i) => res.arrows[i]) };
        const pose = appearance(aligned);
        const distinct =
          !views.length ||
          views.every((v) =>
            pose.some((p, i) => p.some((value, k) => Math.abs(value - v.pose[i][k]) >= 0.04)),
          );
        if (!distinct) message = 'Change the viewing angle slightly; this view is already collected.';
        else {
          views.push({ arrows: aligned.arrows, pose });
          last = aligned;
          lastTime = now;
          accepted = true;
        }
      }
    }
    const fused = take();
    // Draw combined coordinates only on the accepted frame they belong to.
    const show = accepted && fused ? fused : res.error ? null : res;
    return {
      accepted,
      count: views.length,
      canTake: !!fused,
      locked: accepted && views.length === MULTI_VIEW_GOAL,
      progress: views.length / MULTI_VIEW_GOAL,
      show,
      scores: show ? show.arrows.map((a) => scoreFromPoint(a.x, a.y, face)) : [],
      hollow: !fused || !accepted,
      message,
    };
  }

  return {
    read,
    take,
    reset() {
      views = [];
      last = null;
      lastTime = -Infinity;
    },
  };
}
