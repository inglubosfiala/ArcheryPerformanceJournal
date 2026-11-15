// Live camera scan of the target: the detector runs on the video a few times per second and its
// result (spot outlines, numbered arrows) is drawn over the live picture. When the same arrows stay
// in place for about a second the result locks by itself; "Take now" takes it at once.
// Nothing is recorded or stored: frames are analysed in memory and dropped.
import { h } from '../../core/dom.js';
import { icons } from '../icons.js';
import { detectArrows, matchArrows } from '../photoDetect.js';
import { scoreFromPoint } from '../scoring.js';

const FRAME_MAX = 512; // frames are scaled to this many pixels on their long side for detection
const TICK_MS = 120; // pause between analyses (each takes 0.2–0.6 s on a phone)
const LOCK_MS = 1000; // the arrows must hold still this long…
const LOCK_FRAMES = 4; // …over at least this many analysed frames

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
    let hold = null; // { since, frames, first, sums: [{ x, y }], latest: [image] } while the arrows stay in place

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

    function draw(res) {
      octx.clearRect(0, 0, overlay.width, overlay.height);
      if (!res || res.error) return;
      const line = Math.max(2, overlay.width / 200);
      octx.lineWidth = line;
      octx.strokeStyle = '#00e5ff';
      for (const s of res.spots) {
        octx.beginPath();
        octx.ellipse(s.outer.cx, s.outer.cy, s.outer.rx, s.outer.ry, s.outer.angle, 0, Math.PI * 2);
        octx.stroke();
      }
      res.arrows.forEach((a, i) => {
        const r = Math.max(8, overlay.width / 42);
        octx.beginPath();
        octx.arc(a.image.x, a.image.y, r, 0, Math.PI * 2);
        octx.fillStyle = '#E5007E';
        octx.fill();
        octx.strokeStyle = '#ffffff';
        octx.stroke();
        octx.fillStyle = '#ffffff';
        octx.font = `700 ${Math.round(r * 1.1)}px system-ui, sans-serif`;
        octx.textAlign = 'center';
        octx.textBaseline = 'middle';
        octx.fillText(String(i + 1), a.image.x, a.image.y + 1);
      });
    }

    // the frame result to hand over: positions averaged over the frames the arrows held still
    function steady() {
      if (!hold || !last) return last?.res ?? null;
      const n = hold.frames;
      return {
        ...last.res,
        // on the face: the average over the held frames; in the picture: where it is in the last
        // frame (the one shown in the preview), since the camera moves a little between frames
        arrows: hold.first.map((a, i) => ({
          ...a,
          x: hold.sums[i].x / n,
          y: hold.sums[i].y / n,
          image: hold.latest[i],
        })),
      };
    }

    function take() {
      const res = steady();
      if (!res) return;
      finish({ canvas: shot, res });
    }

    function onResult(res) {
      if (closed) return;
      if (res.error === 'retry') return;
      draw(res);
      if (res.error) {
        last = null;
        hold = null;
        takeBtn.disabled = true;
        bar.style.width = '0%';
        status.textContent = 'Point the camera at the target.';
        return;
      }
      // keep the analysed frame for the preview
      shot.width = work.width;
      shot.height = work.height;
      shot.getContext('2d').drawImage(work, 0, 0);
      last = { res };
      takeBtn.disabled = false;
      if (!res.arrows.length) {
        hold = null;
        bar.style.width = '0%';
        status.textContent = 'Target found. Looking for arrows…';
        return;
      }
      const map = hold ? matchArrows(hold.first, res.arrows) : null;
      const now = performance.now();
      if (map) {
        hold.frames++;
        map.forEach((j, i) => {
          const a = res.arrows[j];
          hold.sums[i].x += a.x;
          hold.sums[i].y += a.y;
          hold.latest[i] = a.image;
        });
      } else {
        hold = {
          since: now,
          frames: 1,
          first: res.arrows,
          sums: res.arrows.map((a) => ({ x: a.x, y: a.y })),
          latest: res.arrows.map((a) => a.image),
        };
      }
      const held = Math.min((now - hold.since) / LOCK_MS, hold.frames / LOCK_FRAMES);
      bar.style.width = `${Math.round(Math.min(1, held) * 100)}%`;
      status.textContent = `${values(res.arrows).join(' · ')}: hold steady…`;
      if (now - hold.since >= LOCK_MS && hold.frames >= LOCK_FRAMES) {
        if (navigator.vibrate) navigator.vibrate(40);
        take();
      }
    }

    async function tick() {
      if (closed) return;
      if (!busy && video.readyState >= 2 && video.videoWidth) {
        busy = true;
        const k = Math.min(1, FRAME_MAX / Math.max(video.videoWidth, video.videoHeight));
        const w = Math.round(video.videoWidth * k);
        const hgt = Math.round(video.videoHeight * k);
        if (work.width !== w || work.height !== hgt) {
          work.width = w;
          work.height = hgt;
          overlay.width = w;
          overlay.height = hgt;
          stage.style.aspectRatio = `${w} / ${hgt}`;
        }
        wctx.drawImage(video, 0, 0, w, hgt);
        try {
          onResult(await detect(wctx.getImageData(0, 0, w, hgt)));
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
        status.textContent = 'Point the camera at the target.';
        tick();
      })
      .catch(() => {
        status.textContent = 'The camera is not available (permission refused or no camera). Use Photo instead.';
      });
  });
}
