// Log tab: new session setup → arrow-by-arrow logging with the M/S grading sheet (HANDOFF §3).
import { h, s } from '../../core/dom.js';
import { confirmDialog } from './confirm.js';
import {
  scoreFromPoint,
  locateOnSheet,
  sheetPoint,
  isMultiSpot,
  spotCentres,
  zoneOf,
} from '../scoring.js';
import { sumArrows, computeStats, fmt } from '../stats.js';
import * as L from '../sessionLogic.js';
import { T } from '../strings.js';
import { icons } from '../icons.js';
import { card, gearCard } from './common.js';
import { faceSheet, faceViewBox, VB } from './face.js';
import { SESSION_TYPES, TYPE_LABELS, isScored, sessionType } from '../sessionTypes.js';
import { renderTypeChoice, renderScoredSetup, renderFormSetup } from './sessionSetup.js';
import { sessionTimer } from './timer.js';
import * as APL from '../../ui/apl/index.js';
import { detectArrows } from '../photoDetect.js';
import { drawArrowMarks, liveScan } from './liveScan.js';
import { PREVIEW_MARGIN, spotsBox, resultOnCrop } from '../scanGeometry.js';
import { PHOTO_MAX, canScan, createScan } from '../scan.js';
import { loupeCorner, loupeBox } from '../loupePlacement.js';

/**
 * The running session's questions to the archer, as dialogs (the `confirm` adapter of
 * runningSession.js).
 */
export function askAboutRunningSession(q) {
  if (q.kind === 'replace') {
    return confirmDialog({
      title: 'A session is in progress',
      message: q.willFinish ? T.confirmReplaceFinish : T.confirmReplaceDiscard,
      confirmLabel: q.willFinish ? 'Finish & start' : 'Discard & start',
      danger: !q.willFinish,
    });
  }
  if (q.kind === 'finish') {
    return confirmDialog({
      title: 'Finish session?',
      message: `${TYPE_LABELS[sessionType(q.session)]} · ${q.ends} ${q.ends === 1 ? 'end' : 'ends'}. The session opens in History.`,
      confirmLabel: 'OK',
      icon: 'check',
    });
  }
  return confirmDialog({ title: 'Discard session?', message: T.confirmDiscard, confirmLabel: 'Discard', danger: true });
}

/**
 * The open form session's questions to the archer, as dialogs (the `confirm` adapter of
 * openFormSession.js).
 */
export function askAboutOpenFormSession(q) {
  if (q.kind === 'save') {
    // Save asks only OK / Cancel; the duration (from the timer) and the note are then edited on the
    // session's History page, which opens next.
    const { type, fields, minutes } = q;
    const facts = [
      type === 'blank' || type === 'manual' ? `${fields.arrows || 0} ${fields.arrows === 1 ? 'arrow' : 'arrows'}` : null,
      minutes != null ? `${minutes} min` : null,
    ].filter(Boolean);
    return confirmDialog({
      title: 'Save session?',
      message: `${TYPE_LABELS[type]}${facts.length ? ` · ${facts.join(' · ')}` : ''}. The duration and a note can be changed on the next page.`,
      confirmLabel: 'OK',
      icon: 'check',
    });
  }
  return confirmDialog({
    title: 'Discard session?',
    // "blank bale session", but "SPT session": an abbreviation keeps its capitals
    message: `This ${TYPE_LABELS[q.type] === TYPE_LABELS[q.type].toUpperCase() ? TYPE_LABELS[q.type] : TYPE_LABELS[q.type].toLowerCase()} session is not saved, and its timer stops.`,
    confirmLabel: 'Discard',
    danger: true,
  });
}

export function renderLog(ctx) {
  const active = ctx.running.get();
  // no session running (e.g. it was just finished or discarded): choose a type for a new one
  return active ? renderActive(ctx, active) : renderTypeChoice(ctx);
}

/** New-session setup, reachable from the bottom bar even while a session is in progress. */
/** New session: step 1 picks the type (#/new), step 2 asks that type's details (#/new/<type>). */
export function renderNewSession(ctx, params = []) {
  const type = params[0];
  if (!SESSION_TYPES.includes(type)) return renderTypeChoice(ctx);
  if (isScored(type)) return renderScoredSetup(ctx, type, ctx.running.get());
  return renderFormSetup(ctx, type);
}

/** Apply a session transition to the running session; the page is drawn again when it changed. */
function update(ctx, fn, { rerender = true } = {}) {
  if (ctx.running.apply(fn) && rerender) ctx.rerender();
}

// ---------------------------------------------------------------- active session

function renderActive(ctx, session) {
  const { cursor } = session;
  const current = L.shownEnd(session); // the end on screen (the current one or a saved one)
  const viewing = session.view != null;
  const editing = L.isEditing(session);
  const enter = (v, x, y, spot) => update(ctx, (cur) => L.enterScore(cur, v, x, y, spot));

  const endNo = L.viewIndex(session) + 1;
  const totalEnds = session.ends.length + 1;
  const sight = findSightMark(ctx.repo, session.distance);

  // --- slots
  const slots = h(
    'div',
    {
      class: ['slots', current.arrows.length > 6 && 'slots-2col'],
      role: 'group',
      'aria-label': 'Arrows in this end',
    },
    current.arrows.map((a, i) => {
      const active = i === cursor;
      return h(
        'button',
        {
          type: 'button',
          class: ['slot', active && 'is-active', active && editing && 'is-moving'],
          'aria-label': `Arrow ${i + 1}${a.v == null ? ', empty' : `, ${a.v}`}${a.m ? `, M${a.m}` : ''}${a.s ? `, S${a.s}` : ''}${active ? ', selected' : ''}`,
          dataset: { fk: `slot-${i}` },
          'aria-pressed': String(active && editing),
          onClick: () => update(ctx, (cur) => L.selectArrow(cur, i)),
        },
        h('span', { class: `score-chip z-${zoneOf(a.v)}` }, a.v == null ? String(i + 1) : String(a.v)),
        // M and S as small badges in the grade colours — as visible as the score
        h(
          'span',
          { class: 'slot-grades', 'aria-hidden': 'true' },
          h('span', { class: `mini-grade ${a.m ? `g${a.m}` : 'empty'}` }, `M${a.m ?? ''}`),
          h('span', { class: `mini-grade ${a.s ? `g${a.s}` : 'empty'}` }, `S${a.s ?? ''}`),
        ),
      );
    }),
  );

  // Clear: shown when an arrow was tapped on the left and has a score or grades; empties that arrow
  const picked = session.pinned ? L.shownEnd(session).arrows[session.cursor] : null;
  const clearable = !!picked && (picked.v != null || picked.m != null || picked.s != null);
  const input = targetInput(session, enter, slots, {
    onMove: (i, v, x, y, spot) => update(ctx, (cur) => L.moveArrow(cur, i, v, x, y, spot)),
    clearable,
    clearLabel: `Clear arrow ${session.cursor + 1}`,
    onClear: () => update(ctx, L.clearArrow),
  });

  // session timer: tap to pause / resume
  // sessions started before the timer existed show it stopped at 0:00; one tap starts it
  const timerBtn = sessionTimer(session.timer, () =>
    update(ctx, (c) => (c.timer?.running ? L.pauseTimer(c) : L.resumeTimer(c))),
  );

  // Tapping an arrow on the left selects it: the next target touch / key replaces it, grades below apply to it;
  // tapping it again deselects it.
  const grades = gradePanel(session, { onGrade: (kind, g) => update(ctx, (c) => L.gradeArrow(c, kind, g)) });

  const endCard = card(
    { class: 'card-bleed', 'aria-label': `End ${endNo}` },
    h(
      'div',
      { class: 'end-head' },
      // only the end's name up here; Previous / Next end are under the grades
      h(
        'div',
        { class: 'end-nav' },
        h(
          'h2',
          { class: 'end-title' },
          `${T.end} ${endNo}`,
          h('span', { class: 'end-of muted' }, totalEnds > 1 ? ` / ${totalEnds}` : ''),
        ),
      ),
      h('div', { class: 'end-totals' }, timerBtn),
    ),
    input,
    grades,
    // Previous end (disabled on the first end) and the camera (score the end from the target, at the
    // thumb). Next end is the screen's primary action, in the bottom bar.
    h(
      'div',
      { class: 'apl-grid-2' },
      APL.Button({
        children: T.prevShort,
        variant: 'secondary',
        leadingIcon: 'back',
        // the button itself says just "Previous", so it fits
        label: T.prevEnd,
        disabled: !L.canPrevEnd(session),
        onClick: () => update(ctx, L.prevEnd),
        fk: 'end-prev',
      }),
      photoButton(ctx, session),
    ),
  );

  // Next end: on the newest end it saves it and starts a new one (it needs at least one arrow); on
  // an earlier end it moves one end forward.
  const nextBtn = APL.Button({
    children: T.nextEnd,
    trailingIcon: 'arrowRight',
    label: viewing ? T.nextEnd : `${T.nextEnd} (saves end ${endNo})`,
    disabled: !L.canNextEnd(session),
    onClick: () => update(ctx, L.nextEnd),
    fk: 'end-next',
  });

  // --- end details
  const stepper = (key, label) =>
    APL.Section({
      label,
      id: `end-${key}`,
      children: APL.Stepper({
        label: label.toLowerCase(),
        value: current[key],
        min: 0,
        onChange: (v) => update(ctx, (c) => L.bump(c, key, v - current[key])),
        fk: key,
      }),
    });

  const canFinish = L.canFinish(session);
  // Finish asks OK / Cancel first; the timer is paused meanwhile and runs on if it is cancelled
  const finish = async () => {
    const res = await ctx.running.finish();
    if (res.status === 'finished') ctx.navigate(`history/${res.session.id}`, { replace: true });
  };
  const discard = async () => {
    const res = await ctx.running.discard();
    if (res.status === 'discarded') ctx.navigate('home', { replace: true });
  };

  const details = card(
    { class: 'end-details' },
    h('div', { class: 'apl-grid-2' }, stepper('ld', T.letDowns), stepper('cld', T.correctLetDowns)),
    APL.TextArea({
      label: T.noteForEnd,
      rows: 2,
      placeholder: T.notePh,
      value: current.note,
      fk: 'note',
      onInput: (e) => update(ctx, (c) => L.setNote(c, e.target.value), { rerender: false }),
    }),
    // looking at an earlier end: jump straight back to the one being shot
    viewing
      ? APL.Button({
          children: T.backToEnd(totalEnds),
          variant: 'secondary',
          onClick: () => update(ctx, (c) => L.goToEnd(c, null)),
          fk: 'back-current',
        })
      : null,
    APL.Button({ children: T.finish, variant: 'secondary', disabled: !canFinish, onClick: finish, fk: 'finish' }),
  );

  // --- saved ends (newest first)
  let run = 0;
  const rows = session.ends.map((e, i) => {
    const sc = sumArrows(e.arrows);
    run += sc;
    const st = computeStats([e]);
    return h(
      'li',
      null,
      h(
        'button',
        {
          type: 'button',
          class: ['saved-end', session.view === i && 'is-viewed'],
          'aria-label': `Open end ${i + 1}`,
          'aria-current': session.view === i ? 'true' : null,
          onClick: () => update(ctx, (c) => L.goToEnd(c, i)),
        },
        h('span', { class: 'saved-end-no' }, `E${i + 1}`),
        h(
          'div',
          { class: 'saved-end-body' },
          h(
            'div',
            { class: 'saved-end-arrows' },
            e.arrows.map((a) => (a.v == null ? '–' : String(a.v))).join('  '),
          ),
          h('div', { class: 'muted small' }, `M ${fmt(st.avgM)} · S ${fmt(st.avgS)} · LD ${e.cld}/${e.ld}`),
        ),
        h(
          'div',
          { class: 'saved-end-score' },
          h('strong', null, String(sc)),
          h('span', { class: 'muted xsmall' }, `Σ ${run}`),
        ),
      ),
    );
  });

  // Distance, face and arrows/end are already in the header subtitle; only the sight mark is shown here.
  const pills =
    sight && (sight.elevation || sight.windage)
      ? h(
          'div',
          { class: 'end-sight' },
          APL.Badge({ children: `Sight ${[sight.elevation, sight.windage].filter(Boolean).join(' / ')}`, tone: 'neutral' }),
        )
      : null;

  const total =
    session.ends.reduce((n, e) => n + sumArrows(e.arrows), 0) + (viewing ? 0 : sumArrows(current.arrows));
  return {
    content: h(
      'div',
      { class: 'apl-screen' },
      h(
        'div',
        { class: 'apl-screen-body log-body' },
        pills,
        endCard,
        details,
        rows.length
          ? card(
              { class: 'card-list', 'aria-label': 'Saved ends' },
              h('ol', { class: 'saved-ends', reversed: true }, rows.reverse()),
            )
          : null,
        gearCard(ctx, session),
        h('button', { type: 'button', class: 'btn btn-text danger apl-discard', onClick: discard }, T.discardSession),
      ),
      APL.BottomBar({
        summary: `${T.end} ${endNo} · Total ${total}`,
        children: nextBtn,
      }),
    ),
  };
}

// ---------------------------------------------------------------- the Scan

/**
 * Camera button: scan the target with the live camera (or take / pick a photo from there); arrows
 * found fill the end after a preview. Best effort: wrong ones are dragged on the picture
 * afterwards. Pictures are only used in memory and are never stored.
 */
function photoButton(ctx, session) {
  return APL.Button({
    children: 'Scan',
    variant: 'secondary',
    leadingIcon: icons.camera(),
    label: 'Score arrows with the camera',
    disabled: !canScan(session),
    onClick: () => scanTarget(ctx),
    fk: 'photo',
  });
}

/**
 * Scan the target into the shown end. The sequence (a full end first, the two looks at a photo,
 * the found arrows, Use) is scan.js's; this page lends it the camera, the photo, the detector and
 * the preview dialog.
 */
async function scanTarget(ctx) {
  const scan = createScan({
    running: ctx.running,
    // the live camera locks by itself (or Take now); its frame is previewed cut to the sheet
    camera: async (room) => {
      const got = await liveScan({ face: room.face, maxArrows: room.empty, spotHint: room.spotHint });
      return got && !got.file ? cropToSpots(got.canvas, got.res) : got;
    },
    openPhoto,
    detect: (canvas, room) =>
      detectArrows(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height), room.face, room.empty, { spotHint: room.spotHint }),
    preview: ({ found, picture, again }) => previewFound(picture, found, { cancelLabel: again ? 'Back to camera' : 'Cancel' }),
    onChange: () => ctx.rerender(),
  });
  const res = await scan.start();
  if (res.status === 'used') ctx.rerender();
  else if (res.status === 'unreadable') ctx.toast('Could not open the photo.');
  else if (res.status === 'no-target') ctx.toast(res.error);
}

/**
 * The preview of a live frame shows just the sheet: the picture cut to the box around the spots
 * (the camera frame is mostly background), with the result's picture coordinates moved to match.
 */
function cropToSpots(source, res) {
  const box = spotsBox(res.spots, { margin: PREVIEW_MARGIN, bounds: { x: 0, y: 0, w: source.width, h: source.height } });
  const w = Math.max(1, box.w);
  const hgt = Math.max(1, box.h);
  const k = Math.min(3, PHOTO_MAX / Math.max(w, hgt));
  const canvas = h('canvas', { class: 'photo-preview' });
  canvas.width = Math.round(w * k);
  canvas.height = Math.round(hgt * k);
  canvas.getContext('2d').drawImage(source, box.x, box.y, w, hgt, 0, 0, canvas.width, canvas.height);
  return { picture: canvas, res: resultOnCrop(res, box, k) };
}

/** A photo opened for the Scan: a part of it is drawn on a canvas of its own (see createScan). */
async function openPhoto(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }
  return {
    width: bitmap.width,
    height: bitmap.height,
    draw(box, scale) {
      const canvas = h('canvas', { class: 'photo-preview' });
      canvas.width = Math.round(box.w * scale);
      canvas.height = Math.round(box.h * scale);
      canvas
        .getContext('2d', { willReadFrequently: true })
        .drawImage(bitmap, box.x, box.y, box.w, box.h, 0, 0, canvas.width, canvas.height);
      return canvas;
    },
    close: () => bitmap.close(),
  };
}

/**
 * Show the picture with what was found (the face's rings, each arrow numbered with its score);
 * dragging a score label moves its arrow. Resolves with the archer's answer (Use / OK, or not).
 */
async function previewFound(canvas, found, { cancelLabel }) {
  const g = canvas.getContext('2d');
  // the clean photo is kept, so the marks can be drawn again when a label is dragged
  const photo = document.createElement('canvas');
  photo.width = canvas.width;
  photo.height = canvas.height;
  photo.getContext('2d').drawImage(canvas, 0, 0);
  // Where the detector thinks the scoring rings are: drawn over the photo, so a ring that does not
  // sit on the printed one shows at a glance.
  const ringPath = (o, f) => g.ellipse(o.cx, o.cy, o.rx * f, o.ry * f, o.angle, 0, Math.PI * 2);
  const redraw = () => {
    g.drawImage(photo, 0, 0);
    // while an arrow is dragged, the ring it is in right now is tinted
    const held = found.heldRing();
    if (held) {
      g.beginPath();
      ringPath(held.outer, held.edge);
      if (held.inner > 0) ringPath(held.outer, held.inner);
      g.fillStyle = 'rgba(0, 229, 255, 0.38)';
      g.fill('evenodd');
    }
    const line = Math.max(2, canvas.width / 220);
    g.strokeStyle = '#00e5ff';
    for (const s of found.spots) {
      found.rings.forEach((f) => {
        // the outer edge as before; the rings inside it thinner, so the photo stays readable
        g.lineWidth = f === 1 ? line : Math.max(1, line * 0.45);
        g.globalAlpha = f === 1 ? 1 : 0.8;
        g.beginPath();
        ringPath(s.outer, f);
        g.stroke();
      });
    }
    g.globalAlpha = 1;
    drawArrowMarks(g, found.spots, found.arrows, found.scores(), { active: found.held, long: true });
  };
  redraw();

  // --- dragging a score label moves its arrow: the line's end is the point of impact, the label
  // keeps its distance to it, and the score in the label follows the rings under the point
  const pictureXY = (ev) => {
    const r = canvas.getBoundingClientRect();
    // the canvas is shown with object-fit: contain, so it may be letterboxed inside its box
    const k = Math.max(canvas.width / r.width, canvas.height / r.height);
    return {
      x: (ev.clientX - (r.left + r.width / 2)) * k + canvas.width / 2,
      y: (ev.clientY - (r.top + r.height / 2)) * k + canvas.height / 2,
      k,
    };
  };
  let pointer = null; // the pointer holding a label
  canvas.addEventListener('pointerdown', (ev) => {
    if (!ev.isPrimary || ev.button > 0 || pointer !== null) return;
    const p = pictureXY(ev);
    // the nearest label (or its point of impact) within about a fingertip
    if (!found.grab(p, 26 * p.k)) return;
    ev.preventDefault();
    try {
      canvas.setPointerCapture(ev.pointerId);
    } catch {
      /* pointer already gone */
    }
    pointer = ev.pointerId;
    if (navigator.vibrate) navigator.vibrate(15);
    redraw();
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (pointer === null || ev.pointerId !== pointer) return;
    found.drag(pictureXY(ev));
    redraw();
  });
  const drop = (ev) => {
    if (pointer === null || ev.pointerId !== pointer) return;
    pointer = null;
    found.drop();
    redraw();
  };
  canvas.addEventListener('pointerup', drop);
  canvas.addEventListener('pointercancel', drop);
  canvas.classList.add('is-adjustable');

  // Just the picture with the found arrows and the two buttons. Only when nothing was found does
  // the dialog say so (a picture without marks would explain nothing).
  return confirmDialog(
    found.arrows.length
      ? { title: `Found arrows: ${found.scores().join(', ')}`, bare: true, confirmLabel: 'Use', cancelLabel, body: canvas }
      : {
          title: 'No arrows found',
          message: 'Try a photo taken straight at the target, close enough that the face fills the picture.',
          confirmLabel: 'OK',
          cancelLabel,
          icon: 'camera',
          body: canvas,
        },
  );
}

function findSightMark(repo, distance) {
  return repo.list('sightMarks').find((m) => parseInt(m.distance, 10) === distance) || null;
}

// ---------------------------------------------------------------- target face

const LOUPE_SPAN = 24; // viewBox units shown in the magnifier (the face is 202 wide → ~3× zoom)
// A finger aiming a new arrow aims this many screen pixels above itself, so it never hides the point.
const AIM_OFFSET_PX = 64;
const LOUPE_SIZE = 132; // the loupe's lens, in px (base.css .loupe-lens)
// The spot an arrow was just placed on (multi-spot sheets): placing re-renders the page, and the new
// target starts zoomed on this spot and animates out to the whole sheet (the reverse of the zoom in).
let zoomOutFrom = null;

function arrowDots(session) {
  const at = (a) => sheetPoint(a, session.face);
  // only the shown end's arrows: dots of the other ends lay under these and looked like arrows that
  // would not delete
  const cur = L.shownEnd(session)
    .arrows.map((a, i) => ({ a, i }))
    .filter(({ a }) => a.x != null);
  const movingIdx = L.isEditing(session) ? session.cursor : -1;
  return [
    ...cur.map(({ a, i }) =>
      s(
        'g',
        { transform: `translate(${at(a).x} ${at(a).y})`, opacity: i === movingIdx ? 0.55 : null, 'data-arrow': i },
        // the arrow being moved gets a dashed ring so you can see which one will change
        i === movingIdx
          ? s('circle', {
              r: 10,
              fill: 'none',
              stroke: '#E5007E',
              'stroke-width': 1.4,
              'stroke-dasharray': '2.5 2',
            })
          : null,
        s('circle', { r: 6.4, fill: '#E5007E', stroke: '#FFFFFF', 'stroke-width': 1.3 }),
        s(
          'text',
          { y: 2.3, 'text-anchor': 'middle', 'font-size': 6.5, 'font-weight': 700, fill: '#FFFFFF' },
          String(i + 1),
        ),
      ),
    ),
  ];
}

/**
 * Target face input. Touch (or press) shows a magnifier with the exact hit point and its score;
 * moving the finger fine-tunes the position; releasing registers the arrow. Cancel = no arrow.
 * Multi-spot sheets (triple, Vegas): the first tap zooms into the spot tapped, so it fills the
 * target area; the arrow is then placed on it the same way, and the view zooms back out.
 * A finger aims a little above itself (AIM_OFFSET_PX); the magnifier docks in a corner of the stage
 * away from the finger and the aimed point.
 */
function targetInput(session, enter, slots, { clearable = false, clearLabel = 'Clear arrow', onClear, onMove } = {}) {
  const selectedValue = L.shownEnd(session).arrows[session.cursor]?.v ?? null;
  // magnifier: zoomed copy of the face centred on the aimed point, with a crosshair and the live score
  const marker = s(
    'g',
    null,
    s('circle', { r: 1.1, fill: '#E5007E', stroke: '#FFFFFF', 'stroke-width': 0.4 }),
    s('path', {
      d: 'M-4 0h2.4M1.6 0h2.4M0 -4v2.4M0 1.6v2.4',
      stroke: '#E5007E',
      'stroke-width': 0.45,
      'stroke-linecap': 'round',
    }),
  );
  const loupeSvg = s(
    'svg',
    { 'aria-hidden': 'true', focusable: 'false' },
    faceSheet(session.face),
    arrowDots(session),
    marker,
  );
  const loupeScore = h('span', { class: 'score-chip loupe-score' });
  // shown while a placed arrow is dragged: which arrow moves, and the score it had
  const loupeTag = h('span', { class: 'loupe-tag', hidden: true });
  // docked in a corner of the stage: the lens, and the live score under it
  const loupeLens = h('div', { class: 'loupe-lens' }, loupeSvg, loupeTag);
  const loupe = h('div', { class: 'loupe', 'aria-hidden': 'true', hidden: true }, loupeLens, loupeScore);
  // on the sheet, a move looks different from a new arrow: the arrow's own numbered dot travels with
  // the finger, tied to the place it came from by a dashed line
  const guideLine = s('line', { stroke: '#E5007E', 'stroke-width': 1.6, 'stroke-dasharray': '3.5 2.5', 'stroke-linecap': 'round' });
  const guideFrom = s('circle', { r: 9.5, fill: 'none', stroke: '#E5007E', 'stroke-width': 1.4, 'stroke-dasharray': '2.5 2' });
  const guideNumber = s('text', { y: 2.6, 'text-anchor': 'middle', 'font-size': 7.5, 'font-weight': 700, fill: '#FFFFFF' });
  const guideDot = s(
    'g',
    null,
    s('circle', { r: 11, fill: 'rgba(229, 0, 126, 0.25)' }),
    s('circle', { r: 7.4, fill: '#E5007E', stroke: '#FFFFFF', 'stroke-width': 1.5 }),
    guideNumber,
  );
  const moveGuide = s('g', { class: 'move-guide', visibility: 'hidden' }, guideLine, guideFrom, guideDot);

  let active = null; // { id, p, mode } with p in sheet coordinates (one spot's radius = 1)
  const multi = isMultiSpot(session.face);
  let zoomed = null; // index of the spot zoomed into (multi-spot sheets), or null
  const sheet = s(
    'svg',
    { viewBox: faceViewBox(session.face), 'aria-hidden': 'true', focusable: 'false' },
    faceSheet(session.face),
    arrowDots(session),
    moveGuide,
  );
  const btn = h(
    'button',
    {
      type: 'button',
      class: ['target-btn', multi && 'target-sheet'],
      'aria-label': multi
        ? 'Target sheet: tap a spot to zoom in, then touch where the arrow landed, slide to fine-tune, release to score (keyboard users: use Keypad)'
        : 'Target face: touch where the arrow landed, slide to fine-tune, release to score (keyboard users: use Keypad)',
    },
    sheet,
  );

  // --- zoom (multi-spot sheets): animate the sheet's viewBox between the whole sheet and one spot
  const fullBox = faceViewBox(session.face).split(' ').map(Number);
  const spotBox = (i) => {
    const [cx, cy] = spotCentres(session.face)[i];
    return [cx - VB, cy - VB, VB * 2, VB * 2];
  };
  let anim = 0;
  const setBox = (to) => {
    cancelAnimationFrame(anim);
    const from = sheet.getAttribute('viewBox').split(' ').map(Number);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      sheet.setAttribute('viewBox', to.join(' '));
      return;
    }
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 200);
      const e = 1 - (1 - k) ** 3; // ease-out
      sheet.setAttribute('viewBox', from.map((f, j) => f + (to[j] - f) * e).join(' '));
      if (k < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  };
  const zoomOutBtn = h(
    'button',
    { type: 'button', class: 'zoom-out-btn', hidden: true, 'aria-label': 'Show all spots', onClick: () => zoomTo(null) },
    icons.back(),
    'All spots',
  );
  if (multi && zoomOutFrom != null) {
    sheet.setAttribute('viewBox', spotBox(zoomOutFrom).join(' '));
    zoomOutFrom = null;
    requestAnimationFrame(() => setBox(fullBox));
  }
  function zoomTo(i) {
    zoomed = i;
    setBox(i == null ? fullBox : spotBox(i));
    btn.classList.toggle('is-zoomed', i != null);
    zoomOutBtn.hidden = i == null;
  }

  // --- one gesture's geometry, read once when the pointer lands (no layout reads while it moves)
  let geo = null; // { rect, inv, unitsPerPx }
  const readGeometry = () => {
    const rect = btn.getBoundingClientRect();
    const vb = sheet.getAttribute('viewBox').split(' ').map(Number);
    return {
      rect,
      // screen → SVG units (the sheet may be letterboxed inside the square button)
      inv: sheet.getScreenCTM()?.inverse() ?? null,
      // one screen pixel in SVG units (the sheet is letterboxed with "meet")
      unitsPerPx: Math.max(vb[2] / rect.width, vb[3] / rect.height),
    };
  };
  const toSheet = (clientX, clientY) => {
    const pt = geo.inv ? new DOMPoint(clientX, clientY).matrixTransform(geo.inv) : { x: 0, y: 0 };
    return { x: pt.x / 100, y: pt.y / 100 };
  };
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  // A pointer position: `x`, `y` the aimed point on the sheet (one spot's radius = 1), `fx`, `fy`
  // the finger on the sheet, `px`, `py` the finger inside the stage. With `offset` (a finger aiming
  // a new arrow) the aimed point is AIM_OFFSET_PX above the finger, so the finger never hides it,
  // and kept inside the stage; the finger itself may go below it. A mouse or pen aims where it points.
  const toFace = (ev, { offset = false } = {}) => {
    const { rect } = geo;
    const finger = toSheet(ev.clientX, ev.clientY);
    const aim = offset
      ? toSheet(clamp(ev.clientX, rect.left, rect.right), clamp(ev.clientY - AIM_OFFSET_PX, rect.top, rect.bottom))
      : finger;
    const px = ev.clientX - rect.left;
    const py = ev.clientY - rect.top;
    // the aimed point inside the stage, in pixels (for docking the loupe away from it)
    const apx = offset ? clamp(px, 0, rect.width) : px;
    const apy = offset ? clamp(py - AIM_OFFSET_PX, 0, rect.height) : py;
    return { x: aim.x, y: aim.y, fx: finger.x, fy: finger.y, px, py, apx, apy };
  };

  // on the sheet while a finger aims: a crosshair at the aimed point, a faint ring where the finger
  // is, and a thin line between them (drawn in screen pixels, scaled to the sheet per gesture)
  const crosshair = s(
    'g',
    null,
    s('path', { d: 'M0 -17v11M0 6v11M-17 0h11M6 0h11', stroke: '#14181C', 'stroke-opacity': 0.6, 'stroke-width': 4, 'stroke-linecap': 'round' }),
    s('path', { d: 'M0 -17v11M0 6v11M-17 0h11M6 0h11', stroke: '#FFFFFF', 'stroke-width': 2, 'stroke-linecap': 'round' }),
    s('circle', { r: 3, fill: '#14181C', stroke: '#FFFFFF', 'stroke-width': 1.5 }),
  );
  const fingerRing = s('circle', {
    r: 28,
    fill: 'rgba(255, 255, 255, 0.1)',
    stroke: 'rgba(255, 255, 255, 0.7)',
    'stroke-width': 2,
    'stroke-dasharray': '5 4',
  });
  const aimLine = s('line', { stroke: 'rgba(255, 255, 255, 0.7)', 'stroke-linecap': 'round' });
  const aimGuide = s('g', { class: 'aim-guide', visibility: 'hidden' }, aimLine, fingerRing, crosshair);
  sheet.append(aimGuide);
  const drawAimGuide = (p) => {
    const k = geo.unitsPerPx;
    const [ax, ay, fx, fy] = [p.x * 100, p.y * 100, p.fx * 100, p.fy * 100];
    crosshair.setAttribute('transform', `translate(${ax} ${ay}) scale(${k})`);
    fingerRing.setAttribute('transform', `translate(${fx} ${fy}) scale(${k})`);
    // the line runs from under the crosshair to the ring's edge, when there is room for it
    const d = Math.hypot(fx - ax, fy - ay);
    const from = 17 * k;
    const to = d - 28 * k;
    aimLine.setAttribute('visibility', to > from ? 'visible' : 'hidden');
    if (to > from) {
      const [ux, uy] = [(fx - ax) / d, (fy - ay) / d];
      aimLine.setAttribute('x1', ax + ux * from);
      aimLine.setAttribute('y1', ay + uy * from);
      aimLine.setAttribute('x2', ax + ux * to);
      aimLine.setAttribute('y2', ay + uy * to);
      aimLine.setAttribute('stroke-width', 1.5 * k);
    }
    aimGuide.setAttribute('visibility', 'visible');
  };

  // The loupe docks inside the stage, in a corner away from the finger and the aimed point
  // (loupePlacement.js); it changes corner only past a band, so it does not flicker.
  let corner = null;
  const dockLoupe = (p) => {
    const stage = { stageW: geo.rect.width, stageH: geo.rect.height, size: LOUPE_SIZE };
    const next = loupeCorner({ fingerX: p.px, fingerY: p.py, aimX: p.apx, aimY: p.apy, ...stage, prevCorner: corner });
    if (next === corner) return;
    corner = next;
    const box = loupeBox(corner, stage);
    loupe.style.left = `${Math.round(box.x)}px`;
    loupe.style.top = `${Math.round(box.y)}px`;
  };

  const show = (p) => {
    const cx = p.x * 100;
    const cy = p.y * 100;
    loupeSvg.setAttribute(
      'viewBox',
      `${cx - LOUPE_SPAN / 2} ${cy - LOUPE_SPAN / 2} ${LOUPE_SPAN} ${LOUPE_SPAN}`,
    );
    marker.setAttribute('transform', `translate(${cx} ${cy})`);
    const hit = locateOnSheet(p.x, p.y, session.face);
    const v = scoreFromPoint(hit.x, hit.y, session.face);
    loupeScore.textContent = String(v);
    loupeScore.className = `score-chip loupe-score z-${zoneOf(v)}`;
    dockLoupe(p);
    loupe.hidden = false;
    if (active?.offset) drawAimGuide(p);
    if (active?.mode === 'move') {
      const from = active.origin;
      guideLine.setAttribute('x1', from.x * 100);
      guideLine.setAttribute('y1', from.y * 100);
      guideLine.setAttribute('x2', cx);
      guideLine.setAttribute('y2', cy);
      guideFrom.setAttribute('cx', from.x * 100);
      guideFrom.setAttribute('cy', from.y * 100);
      guideDot.setAttribute('transform', `translate(${cx} ${cy})`);
    }
  };

  // the aimed point: the finger's, shifted by the grab offset (finger px / py stay the finger's)
  const aimFrom = (f, off) => ({
    ...f,
    x: f.x + off.x,
    y: f.y + off.y,
    apx: f.apx + (off.x * 100) / geo.unitsPerPx,
    apy: f.apy + (off.y * 100) / geo.unitsPerPx,
  });
  // the placed arrow of the shown end nearest the pointer, within `reachPx` on the screen
  const grabAt = (f, reachPx) => {
    const reach = (reachPx * geo.unitsPerPx) / 100;
    let best = null;
    L.shownEnd(session).arrows.forEach((a, i) => {
      if (a.v == null || a.x == null) return;
      const d = sheetPoint(a, session.face);
      const dot = { x: d.x / 100, y: d.y / 100 };
      const dist = Math.hypot(dot.x - f.x, dot.y - f.y);
      if (dist <= reach && (!best || dist < best.dist)) best = { i, dist, off: { x: dot.x - f.x, y: dot.y - f.y } };
    });
    return best;
  };

  // pointer moves are applied once per frame: the latest position wins
  let frame = 0;
  let pending = null;
  const applyMove = (pos) => {
    if (active.mode === 'pick') {
      active.p = toFace(pos);
      return;
    }
    active.moved = Math.max(active.moved, Math.hypot(pos.clientX - active.from.x, pos.clientY - active.from.y));
    active.p = aimFrom(toFace(pos, { offset: active.offset }), active.off);
    show(active.p);
  };
  const flushMove = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    const pos = pending;
    pending = null;
    if (pos && active) applyMove(pos);
  };

  const end = (ev, commit) => {
    if (!active || ev.pointerId !== active.id) return;
    // the last move counts (it may still be waiting for its frame); a cancelled touch drops it
    if (commit) flushMove();
    else {
      cancelAnimationFrame(frame);
      frame = 0;
      pending = null;
    }
    const { p, mode, idx, tapPicks, moved } = active;
    active = null;
    loupe.hidden = true;
    loupe.classList.remove('is-moving');
    loupeTag.hidden = true;
    moveGuide.setAttribute('visibility', 'hidden');
    aimGuide.setAttribute('visibility', 'hidden');
    btn.classList.remove('aiming', 'moving');
    sheet.querySelector('.is-grabbed')?.classList.remove('is-grabbed');
    if (!commit) return;
    // a tap on the whole sheet zooms into the spot tapped
    // (also a tap on an arrow there: only a drag moves it)
    if (mode === 'pick' || (tapPicks && moved < 8)) {
      zoomTo(locateOnSheet(p.x, p.y, session.face).spot);
      return;
    }
    if (multi) zoomOutFrom = zoomed;
    const hit = locateOnSheet(p.x, p.y, session.face);
    // a touch off the face keeps its score but no position (sessionLogic's ON_FACE rule)
    const args = [scoreFromPoint(hit.x, hit.y, session.face), hit.x, hit.y, hit.spot];
    // a placed arrow that was dragged moves; otherwise the touch enters a score
    if (mode === 'move') onMove(idx, ...args);
    else enter(...args);
    // nothing was entered (the page did not re-render): zoom out here instead
    if (multi && btn.isConnected) {
      zoomOutFrom = null;
      zoomTo(null);
    }
  };

  btn.addEventListener('pointerdown', (ev) => {
    if (!ev.isPrimary || ev.button > 0 || active) return;
    ev.preventDefault();
    try {
      btn.setPointerCapture(ev.pointerId); // keep receiving moves when the finger leaves the face
    } catch {
      /* pointer already gone */
    }
    geo = readGeometry();
    const p = toFace(ev); // the finger itself: picking a spot and grabbing an arrow work under it
    // Touching a placed arrow of this end grabs it: dragging moves it (the pointer keeps its distance
    // to the dot, so the dot does not jump under the finger). A finger covers the dot and lands
    // less exactly than a mouse, so it reaches further. On a sheet of several spots this works on
    // the whole sheet too, without zooming in first.
    const whole = multi && zoomed == null;
    const grab = onMove ? grabAt(p, ev.pointerType === 'mouse' ? 26 : whole ? 34 : 44) : null;
    // multi-spot sheet not zoomed yet: a touch off the arrows only picks the spot
    if (whole && !grab) {
      active = { id: ev.pointerId, p, mode: 'pick' };
      return;
    }
    const from = { x: ev.clientX, y: ev.clientY, moved: 0 };
    // a finger aiming a new arrow aims above itself; a mouse or pen where it points
    const offset = !grab && ev.pointerType === 'touch';
    active = grab
      ? { id: ev.pointerId, mode: 'move', idx: grab.i, off: grab.off, p: aimFrom(p, grab.off), origin: aimFrom(p, grab.off), from, moved: 0, tapPicks: whole }
      : { id: ev.pointerId, mode: 'aim', off: { x: 0, y: 0 }, offset, p: offset ? toFace(ev, { offset }) : p, from, moved: 0 };
    if (grab) {
      sheet.querySelector(`[data-arrow="${grab.i}"]`)?.classList.add('is-grabbed');
      guideNumber.textContent = String(grab.i + 1);
      moveGuide.setAttribute('visibility', 'visible');
      loupeTag.textContent = `Move ${grab.i + 1} · was ${L.shownEnd(session).arrows[grab.i].v}`;
      loupeTag.hidden = false;
      loupe.classList.add('is-moving');
      btn.classList.add('moving');
      if (navigator.vibrate) navigator.vibrate(15);
    }
    btn.classList.add('aiming');
    corner = null;
    show(active.p);
  });
  btn.addEventListener('pointermove', (ev) => {
    if (!active || ev.pointerId !== active.id) return;
    pending = { clientX: ev.clientX, clientY: ev.clientY };
    if (!frame) frame = requestAnimationFrame(flushMove);
  });
  btn.addEventListener('pointerup', (ev) => end(ev, true));
  btn.addEventListener('pointercancel', (ev) => end(ev, false));
  btn.addEventListener('contextmenu', (ev) => ev.preventDefault());

  return h(
    'div',
    { class: 'target-wrap' },
    // arrow slots in a column on the left, target face on the right
    h(
      'div',
      { class: ['aim-row', session.arrowsPerEnd > 6 && 'aim-row-wide'] },
      slots,
      h('div', { class: 'target-stage' }, btn, multi ? zoomOutBtn : null, loupe),
    ),
    APL.ScoreKeypad({
      label: 'Quick score without position',
      keys: ['X', 10, 9, 8, 7, 6, 'M'].map((k) => ({
        value: k,
        zone: zoneOf(k),
        ariaLabel: `Score ${k === 'M' ? 'miss' : k}`,
      })),
      // the selected arrow's score is shown pressed; the other keys dim (like the grade rows)
      value: selectedValue,
      onKey: (k) => enter(k, null, null),
      // at the thumb's end of the row; its place is kept (invisible) when no arrow is picked
      clear: { enabled: clearable, label: clearLabel, onClick: () => onClear?.() },
      fk: 'quick',
    }),
  );
}


// ---------------------------------------------------------------- inline grades

/** Two compact rows (M and S, grades 1–5) for the selected arrow, styled like the score keys. */
function gradePanel(session, { onGrade }) {
  const a = L.shownEnd(session).arrows[session.cursor];
  const row = (kind, label, full) =>
    APL.GradeKeys({
      label: `${full} for arrow ${session.cursor + 1}`,
      rowLabel: label,
      value: a[kind],
      keyLabel: (g) => `${full} ${g}`,
      onChange: (g) => onGrade(kind, g),
      fk: `grade-${kind}`,
    });
  return h('div', { class: 'grade-panel' }, row('m', 'M', T.mentalProgram), row('s', 'S', T.shootingCycle));
}
