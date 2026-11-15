// Live camera scan of the target: the detector runs on the video a few times per second and its
// result (spot outlines, numbered arrows) is drawn over the live picture. When the same arrows stay
// in place for about a second the result locks by itself; "Take now" takes it at once.
// Nothing is recorded or stored: frames are analysed in memory and dropped.
import { h } from '../../core/dom.js';
import { icons } from '../icons.js';
import { detectArrows, consensus } from '../photoDetect.js';
import { scoreFromPoint, spotCentres } from '../scoring.js';

const FRAME_MAX = 560;
const VIEW_MAX = 1280; // the overlay and the kept picture: the whole frame, up to this size // frames are scaled to this many pixels on their long side for detection
const TICK_MS = 120; // pause between analyses (each takes 0.2–0.6 s on a phone)
const LOCK_MS = 1000; // the agreed reading must go back at least this long…
const LOCK_FRAMES = 5; // …and this many of the recent frames must agree on it
const WINDOW_FRAMES = 8; // how many recent readings are compared
const WINDOW_MS = 5000; // readings older than this are dropped

/**
 * Mark the found arrows on a picture so the hit itself stays visible: nothing is drawn over the
 * point of impact; beside it (on a thin line that ends on the point, away from the shaft) is a label
 * with the score read there.
 */
/** Where an arrow's score label sits on a picture of the given size: its centre and radius. */
export function arrowMarkLayout(width, height, spots, a, { long = false } = {}) {
  const o = (spots[a.spot ?? 0] || spots[0]).outer;
  const spotR = (o.rx + o.ry) / 2;
  const p = a.image;
  const r = Math.max(width / 45, Math.min(width / 18, 0.17 * spotR)); // the label's radius
  // On the far side of the point from the shaft (the shaft leans one way, the label goes the
  // other), so it never lies on the arrow. With no shaft seen: outwards from the spot's middle,
  // and for an arrow in the very middle up and to the right.
  let dx = p.x - o.cx;
  let dy = p.y - o.cy;
  const dist = Math.hypot(dx, dy);
  if (a.lean) {
    dx = -a.lean.x;
    dy = -a.lean.y;
  } else if (dist < 0.12 * spotR) {
    dx = 0.7;
    dy = -0.7;
  } else {
    dx /= dist;
    dy /= dist;
  }
  // `long`: where the labels are dragged by finger, the line is long enough that the finger on the
  // label does not cover the point of impact
  const reach = r + (long ? Math.max(0.75 * spotR, 3.4 * r) : Math.max(0.28 * spotR, 1.2 * r));
  return {
    r,
    lx: Math.max(r + 2, Math.min(width - r - 2, p.x + dx * reach)),
    ly: Math.max(r + 2, Math.min(height - r - 2, p.y + dy * reach)),
  };
}

export function drawArrowMarks(g, spots, arrows, labels, { hollow = false, active = -1, long = false } = {}) {
  const { width, height } = g.canvas;
  g.save();
  g.lineCap = 'round';
  arrows.forEach((a, i) => {
    const p = a.image;
    const { r, lx, ly } = arrowMarkLayout(width, height, spots, a, { long });
    const thin = Math.max(1.5, width / 320);
    const stroke = (colour, w, path) => {
      g.beginPath();
      path();
      g.strokeStyle = colour;
      g.lineWidth = w;
      g.stroke();
    };
    const leader = () => {
      g.moveTo(p.x, p.y); // the line ends exactly on the point of impact, with nothing drawn over it
      g.lineTo(lx, ly);
    };
    // white under pink, so the marks show on any ring colour
    stroke('#ffffff', thin * 2.4, leader);
    stroke('#E5007E', thin, leader);
    if (i === active) {
      // the label being dragged: a halo around it
      g.beginPath();
      g.arc(lx, ly, r * 1.45, 0, Math.PI * 2);
      g.fillStyle = 'rgba(229, 0, 126, 0.3)';
      g.fill();
    }
    g.beginPath();
    g.arc(lx, ly, r, 0, Math.PI * 2);
    g.fillStyle = hollow ? 'rgba(229, 0, 126, 0.45)' : '#E5007E';
    g.fill();
    g.strokeStyle = '#ffffff';
    g.lineWidth = thin * 1.3;
    g.stroke();
    g.fillStyle = '#ffffff';
    const text = String(labels[i]);
    g.font = `700 ${Math.round(r * (text.length > 1 ? 1 : 1.2))}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, lx, ly + 1);
  });
  g.restore();
}

/**
 * Open the live view. Resolves with
 *   { canvas, res }  the locked (or taken) frame and its detection result,
 *   { file }         a photo chosen instead (the Photo button), or
 *   null             closed without a result.
 */
export function liveScan({ face, maxArrows, spotHint = 0 }) {
  return new Promise((resolve) => {
    let closed = false;
    let stream = null;
    let worker = null;
    let timer = 0;
    let busy = false;
    let seq = 0;
    let last = null; // the latest result without an error
    let recent = []; // the last readings: [{ t, arrows }]
    let hold = null; // what most of them agree on: { arrows, count, since }, or null

    const video = h('video', { class: 'live-video', playsinline: true, muted: true, autoplay: true });
    video.muted = true;
    const overlay = h('canvas', { class: 'live-overlay', 'aria-hidden': 'true' });
    const stage = h('div', { class: 'live-stage' }, video, overlay);
    const status = h('p', { class: 'live-status', role: 'status', 'aria-live': 'polite' }, 'Starting the camera…');
    const bar = h('div', { class: 'live-progress-bar' });
    const progress = h('div', { class: 'live-progress', 'aria-hidden': 'true' }, bar);
    const fileInput = h('input', {
      type: 'file',
      accept: 'image/*',
      capture: 'environment',
      class: 'sr-only',
      tabindex: '-1',
      'aria-hidden': 'true',
      onChange: (e) => {
        const file = e.target.files?.[0];
        if (file) finish({ file });
      },
    });
    const takeBtn = h(
      'button',
      { type: 'button', class: 'btn btn-primary live-take', disabled: true, dataset: { fk: 'live-take' }, onClick: () => take() },
      'Take now',
    );
    const dialog = h(
      'dialog',
      { class: 'live-scan', 'aria-label': 'Scan the target with the camera' },
      h(
        'div',
        { class: 'live-top' },
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close the camera', dataset: { fk: 'live-close' }, onClick: () => finish(null) }, icons.close()),
      ),
      stage,
      progress,
      status,
      h(
        'div',
        { class: 'live-actions' },
        h('button', { type: 'button', class: 'btn btn-outline', dataset: { fk: 'live-photo' }, onClick: () => fileInput.click() }, icons.camera(), 'Photo'),
        takeBtn,
      ),
      fileInput,
    );

    // the frame being analysed, and a copy of the last analysed one (kept for the preview)
    const work = document.createElement('canvas');
    const wctx = work.getContext('2d', { willReadFrequently: true });
    const full = document.createElement('canvas'); // the whole frame of the moment being analysed
    const shot = document.createElement('canvas');
    const octx = overlay.getContext('2d');

    function finish(value) {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
      worker?.terminate();
      dialog.close();
      dialog.remove();
      resolve(value);
    }
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(null);
    });
    dialog.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') e.stopPropagation();
    });

    // --- detection: in a worker when possible, else on the main thread
    const waiting = new Map();
    try {
      worker = new Worker(new URL('../photoWorker.js', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => {
        waiting.get(e.data.id)?.(e.data.res);
        waiting.delete(e.data.id);
      };
      worker.onerror = () => {
        // module workers are not supported here: analyse on the main thread from now on
        worker?.terminate();
        worker = null;
        for (const done of waiting.values()) done({ error: 'retry' });
        waiting.clear();
      };
    } catch {
      worker = null;
    }
    const detect = (img) => {
      if (!worker) {
        const r = detectArrows(img, face, maxArrows, { spotHint });
        return Promise.resolve(r.error ? { error: r.error } : { partial: r.partial, spots: r.spots.map((s) => ({ outer: s.outer })), arrows: r.arrows });
      }
      return new Promise((done) => {
        const id = ++seq;
        waiting.set(id, done);
        worker.postMessage({ id, width: img.width, height: img.height, buffer: img.data.buffer, face, maxArrows, spotHint }, [img.data.buffer]);
      });
    };

    const values = (arrows) => arrows.map((a) => scoreFromPoint(a.x, a.y, face));

    // where a point of the face (relative to its spot's centre, spot radius 1) is in the picture
    function onPicture(spots, a) {
      const o = (spots[a.spot ?? 0] || spots[0]).outer;
      const cos = Math.cos(o.angle);
      const sin = Math.sin(o.angle);
      const u1 = (cos * a.x + sin * a.y) * o.rx;
      const u2 = (-sin * a.x + cos * a.y) * o.ry;
      return { x: o.cx + cos * u1 - sin * u2, y: o.cy + sin * u1 + cos * u2 };
    }

    function draw(res, hollow = false) {
      octx.clearRect(0, 0, overlay.width, overlay.height);
      // the scan frame: what is outside it is dimmed (and not looked at)
      if (frame) {
        octx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        octx.fillRect(0, 0, overlay.width, frame.y);
        octx.fillRect(0, frame.y + frame.h, overlay.width, overlay.height - frame.y - frame.h);
        octx.fillRect(0, frame.y, frame.x, frame.h);
        octx.fillRect(frame.x + frame.w, frame.y, overlay.width - frame.x - frame.w, frame.h);
        octx.lineWidth = Math.max(2, overlay.width / 240);
        octx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        octx.strokeRect(frame.x, frame.y, frame.w, frame.h);
      }
      if (!res || res.error) return;
      const line = Math.max(2, overlay.width / 200);
      octx.lineWidth = line;
      octx.strokeStyle = '#00e5ff';
      for (const s of res.spots) {
        octx.beginPath();
        octx.ellipse(s.outer.cx, s.outer.cy, s.outer.rx, s.outer.ry, s.outer.angle, 0, Math.PI * 2);
        octx.stroke();
      }
      drawArrowMarks(octx, res.spots, res.arrows, values(res.arrows), { hollow });
    }

    // The result to hand over: the agreed arrows (their average place on the face over the frames
    // that agree), drawn on the latest frame's outline; or the latest reading when nothing agrees yet.
    function steady() {
      if (!last) return null;
      if (!hold) return last.res;
      return { ...last.res, arrows: hold.arrows.map((a) => ({ ...a, image: onPicture(last.res.spots, a) })) };
    }

    function take() {
      const res = steady();
      if (!res) return;
      finish({ canvas: shot, res });
    }

    function onResult(res) {
      if (closed) return;
      if (res.error) {
        draw(res);
        last = null;
        hold = null;
        recent = [];
        takeBtn.disabled = true;
        bar.style.width = '0%';
        status.textContent = 'Fit the target in the frame.';
        return;
      }
      // keep the analysed moment (the whole frame) for the preview
      shot.width = full.width;
      shot.height = full.height;
      shot.getContext('2d').drawImage(full, 0, 0);
      last = { res };
      takeBtn.disabled = false;
      const now = performance.now();
      if (!res.arrows.length) {
        draw(res);
        hold = null;
        recent = [];
        bar.style.width = '0%';
        status.textContent = 'Target found. Looking for arrows…';
        return;
      }
      // A gate: with several arrows to place on a sheet of several spots, all its spots must be in
      // the picture. A view of one spot alone never locks by itself ("Take now" still takes it).
      if (res.partial && maxArrows > 1) {
        hold = null;
        recent = [];
        draw(res, true);
        bar.style.width = '0%';
        status.textContent = 'Show all the spots of the sheet (or Take now for this spot only).';
        return;
      }
      // The last few readings, and what most of them agree on. A frame that reads something else
      // now and then (blur, a reflection) changes nothing: the markers show the agreed arrows, and
      // the result locks once enough of the recent frames agree for long enough.
      recent.push({ t: now, arrows: res.arrows });
      recent = recent.filter((f) => now - f.t < WINDOW_MS).slice(-WINDOW_FRAMES);
      const agreed = consensus(recent.map((f) => f.arrows));
      hold = agreed && agreed.count >= 2 ? { ...agreed, since: recent[agreed.oldest].t } : null;
      const shown = steady();
      // a reading nothing else agrees with yet is drawn hollow
      draw(shown, !hold);
      const held = hold ? Math.min((now - hold.since) / LOCK_MS, hold.count / LOCK_FRAMES) : 0;
      bar.style.width = `${Math.round(Math.min(1, held) * 100)}%`;
      status.textContent = hold ? `${values(shown.arrows).join(' · ')}: hold steady…` : 'Reading the arrows…';
      if (hold && now - hold.since >= LOCK_MS && hold.count >= LOCK_FRAMES) {
        if (navigator.vibrate) navigator.vibrate(40);
        take();
      }
    }

    // The part of the video frame that is analysed (video pixels). At first the whole frame; once the
    // spots are found, just the sheet around them, so the same number of analysed pixels covers the
    // target in much more detail (shafts a few pixels wide instead of one).
    let region = null;
    // The scan frame: a box in the shape of the selected sheet (one face: square; a triple: tall),
    // centred in the picture. Only what is inside it is analysed, so a second target hanging next
    // to this one is not read as well. In video pixels (`guide`) and overlay pixels (`frame`).
    const centres = spotCentres(face);
    const span = (k) => Math.max(...centres.map((c) => c[k])) - Math.min(...centres.map((c) => c[k])) + 230; // spot Ø 200 + margin
    const shape = span(0) / span(1); // width / height
    let guide = null;
    let frame = null;

    async function tick() {
      if (closed) return;
      if (!busy && video.readyState >= 2 && video.videoWidth) {
        busy = true;
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        // the overlay and the kept picture cover the whole frame
        const ko = Math.min(1, VIEW_MAX / Math.max(vw, vh));
        const ow = Math.round(vw * ko);
        const oh = Math.round(vh * ko);
        if (overlay.width !== ow || overlay.height !== oh) {
          overlay.width = ow;
          overlay.height = oh;
          full.width = ow;
          full.height = oh;
          stage.style.aspectRatio = `${ow} / ${oh}`;
          const gw = Math.min(0.96 * vw, 0.96 * vh * shape);
          guide = { x: Math.round((vw - gw) / 2), y: Math.round((vh - gw / shape) / 2), w: Math.round(gw), h: Math.round(gw / shape) };
          frame = { x: guide.x * ko, y: guide.y * ko, w: guide.w * ko, h: guide.h * ko };
          region = null;
          if (!last) draw(null);
        }
        const r = region || guide;
        const k = Math.min(1, FRAME_MAX / Math.max(r.w, r.h));
        const w = Math.max(8, Math.round(r.w * k));
        const hgt = Math.max(8, Math.round(r.h * k));
        if (work.width !== w || work.height !== hgt) {
          work.width = w;
          work.height = hgt;
        }
        // the same moment twice: the analysed part, and the whole frame for the preview
        wctx.drawImage(video, r.x, r.y, r.w, r.h, 0, 0, w, hgt);
        full.getContext('2d').drawImage(video, 0, 0, ow, oh);
        try {
          const res = await detect(wctx.getImageData(0, 0, w, hgt));
          if (res.error === 'retry') {
            // the worker gave up: nothing to show for this frame
          } else if (res.error) {
            region = null; // lost the target: look at the whole frame again
            onResult(res);
          } else {
            // analysed-part pixels → whole-frame overlay pixels
            const sx = (px) => (r.x + px / k) * ko;
            const sy = (py) => (r.y + py / k) * ko;
            const sc = ko / k;
            const spots = res.spots.map((s) => ({
              outer: { cx: sx(s.outer.cx), cy: sy(s.outer.cy), rx: s.outer.rx * sc, ry: s.outer.ry * sc, angle: s.outer.angle },
            }));
            const arrows = res.arrows.map((a) => ({ ...a, image: { x: sx(a.image.x), y: sy(a.image.y) } }));
            // next time, analyse just the sheet: the box around the spots, with a margin
            let x0 = Infinity;
            let y0 = Infinity;
            let x1 = -Infinity;
            let y1 = -Infinity;
            for (const s of spots) {
              const rad = (Math.max(s.outer.rx, s.outer.ry) * 1.3) / ko;
              x0 = Math.min(x0, s.outer.cx / ko - rad);
              y0 = Math.min(y0, s.outer.cy / ko - rad);
              x1 = Math.max(x1, s.outer.cx / ko + rad);
              y1 = Math.max(y1, s.outer.cy / ko + rad);
            }
            x0 = Math.max(guide.x, Math.floor(x0));
            y0 = Math.max(guide.y, Math.floor(y0));
            x1 = Math.min(guide.x + guide.w, Math.ceil(x1));
            y1 = Math.min(guide.y + guide.h, Math.ceil(y1));
            const box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
            // …but only once every spot of the sheet is seen. While only some are (the camera came
            // in on one spot first), keep looking at the whole frame, or the others are never found.
            region = !res.partial && box.w > 16 && box.h > 16 && box.w * box.h < 0.8 * guide.w * guide.h ? box : null;
            onResult({ ...res, spots, arrows });
          }
        } catch (err) {
          console.error(err);
        }
        busy = false;
      }
      timer = setTimeout(tick, TICK_MS);
    }

    document.body.append(dialog);
    dialog.showModal();

    const media = navigator.mediaDevices;
    if (!media?.getUserMedia) {
      status.textContent = 'This browser has no camera access here. Use Photo instead.';
      return;
    }
    media
      .getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      .then((s) => {
        if (closed) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        video.srcObject = s;
        video.play().catch(() => {});
        status.textContent = 'Fit the target in the frame.';
        tick();
      })
      .catch(() => {
        status.textContent = 'The camera is not available (permission refused or no camera). Use Photo instead.';
      });
  });
}
