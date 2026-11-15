// The interval ("Tabata") timer screen for a timed SPT drill: a full-screen countdown through the
// drill's holds and rests (see ../tabata.js for the plan). It beeps and buzzes at every change and
// on the last three seconds of a phase, so it can be followed without looking, and keeps the screen
// awake while it is open. Nothing is stored: closing it just returns to the session form.
import { h } from '../../core/dom.js';
import { icons } from '../icons.js';
import { tabataPlan, tabataAt, tabataStartOf, tabataClock } from '../tabata.js';

const PHASE_NAMES = { prepare: 'Get ready', work: 'Hold', rest: 'Rest', setRest: 'Rest between sets' };

/**
 * Open the timer for a drill. `work` and `rest` in seconds.
 * Resolves with { completed } when it is closed: true when the drill ran to its end.
 */
export function tabataTimer({ title, work, rest, reps, sets }) {
  return new Promise((resolve) => {
    const plan = tabataPlan({ work, rest, reps, sets });
    const returnFocus = document.activeElement;
    let closed = false;
    let running = true;
    let elapsed = 0; // ms run so far, pauses left out
    let last = performance.now();
    let frame = 0;
    let shown = { index: -1, sec: -1, done: false };
    let wakeLock = null;

    // --- sound: short beeps from an oscillator (no audio files). Created here, inside the tap
    // that opened the timer, which is what lets a phone play it.
    let audio = null;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audio = Ctx ? new Ctx() : null;
    } catch {
      audio = null;
    }
    const beep = (freq, ms, gain = 0.25) => {
      if (!audio) return;
      try {
        if (audio.state === 'suspended') audio.resume();
        const osc = audio.createOscillator();
        const vol = audio.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const t0 = audio.currentTime;
        vol.gain.setValueAtTime(gain, t0);
        vol.gain.exponentialRampToValueAtTime(0.001, t0 + ms / 1000);
        osc.connect(vol);
        vol.connect(audio.destination);
        osc.start(t0);
        osc.stop(t0 + ms / 1000 + 0.02);
      } catch {
        /* no sound on this device */
      }
    };
    const buzz = (pattern) => {
      if (navigator.vibrate) navigator.vibrate(pattern);
    };

    const phaseName = h('p', { class: 'tabata-phase', role: 'status', 'aria-live': 'assertive' });
    const clock = h('p', { class: 'tabata-clock', 'aria-hidden': 'true' });
    const counts = h('p', { class: 'tabata-counts' });
    const total = h('p', { class: 'tabata-total' });
    const bar = h('div', { class: 'tabata-bar-fill' });
    const pauseBtn = h('button', { type: 'button', class: 'btn btn-primary tabata-main', dataset: { fk: 'tabata-pause' }, onClick: () => toggle() });
    const skipBtn = h(
      'button',
      { type: 'button', class: 'btn btn-outline', dataset: { fk: 'tabata-skip' }, onClick: () => jump(1) },
      'Skip',
      icons.forward(),
    );
    const backBtn = h(
      'button',
      { type: 'button', class: 'btn btn-outline', dataset: { fk: 'tabata-back' }, onClick: () => jump(-1) },
      icons.back(),
      'Back',
    );
    const dialog = h(
      'dialog',
      { class: 'tabata', 'aria-label': `${title}: interval timer` },
      h(
        'div',
        { class: 'tabata-top' },
        h('span', { class: 'tabata-title' }, title),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close the timer', dataset: { fk: 'tabata-close' }, onClick: () => finish(false) }, icons.close()),
      ),
      h('div', { class: 'tabata-face' }, phaseName, clock, counts),
      h('div', { class: 'tabata-bar', 'aria-hidden': 'true' }, bar),
      total,
      h('div', { class: 'tabata-actions' }, backBtn, pauseBtn, skipBtn),
    );

    function setPauseLabel(done) {
      pauseBtn.replaceChildren(done ? 'Done' : running ? icons.pause() : icons.play(), done ? '' : running ? 'Pause' : 'Resume');
    }

    function render() {
      const at = tabataAt(plan, elapsed);
      const sec = Math.ceil(at.leftMs / 1000);
      if (at.done) {
        if (!shown.done) {
          shown = { index: at.index, sec: 0, done: true };
          running = false;
          dialog.dataset.phase = 'done';
          phaseName.textContent = 'Done';
          clock.textContent = '0:00';
          counts.textContent = `${plan.sets} × ${plan.reps} holds`;
          total.textContent = '';
          bar.style.width = '100%';
          skipBtn.disabled = true;
          setPauseLabel(true);
          beep(880, 180);
          setTimeout(() => beep(1175, 420), 200);
          buzz([120, 80, 300]);
        }
        return;
      }
      if (at.index !== shown.index || shown.done) {
        // a new phase: its name, colour and a signal (high for a hold, low for a rest)
        const first = shown.index === -1;
        shown = { index: at.index, sec, done: false };
        const p = at.phase;
        dialog.dataset.phase = p.kind;
        phaseName.textContent = PHASE_NAMES[p.kind];
        counts.textContent = plan.sets > 1 ? `Hold ${p.rep} of ${plan.reps} · set ${p.set} of ${plan.sets}` : `Hold ${p.rep} of ${plan.reps}`;
        skipBtn.disabled = false;
        setPauseLabel(false);
        if (!first) {
          beep(p.kind === 'work' ? 988 : 523, 420);
          buzz(p.kind === 'work' ? [250] : [90, 60, 90]);
        }
      } else if (sec !== shown.sec) {
        shown.sec = sec;
        // the last three seconds of a phase tick
        if (sec <= 3 && sec >= 1 && running) beep(660, 90, 0.18);
      }
      backBtn.disabled = at.index === 0 && elapsed < 1000;
      clock.textContent = tabataClock(at.leftMs);
      total.textContent = `${tabataClock(at.totalLeftMs)} left`;
      bar.style.width = `${Math.round((1 - at.leftMs / (at.phase.sec * 1000)) * 1000) / 10}%`;
    }

    function tick() {
      if (closed) return;
      const now = performance.now();
      if (running) elapsed += now - last;
      last = now;
      render();
      frame = setTimeout(tick, 100);
    }

    function toggle() {
      if (shown.done) {
        finish(true);
        return;
      }
      running = !running;
      last = performance.now();
      setPauseLabel(false);
      dialog.classList.toggle('is-paused', !running);
    }

    // Skip: on to the next phase. Back: to the start of this phase, or of the one before when this
    // one has only just begun.
    function jump(dir) {
      const at = tabataAt(plan, elapsed);
      let index = at.done ? plan.phases.length : at.index;
      if (dir > 0) index += 1;
      else if (at.done || at.phase.sec * 1000 - at.leftMs < 1500) index -= 1;
      elapsed = tabataStartOf(plan, index);
      if (shown.done) {
        running = true;
        dialog.classList.remove('is-paused');
      }
      shown = { index: -2, sec: -1, done: false };
      last = performance.now();
      render();
    }

    async function keepAwake() {
      try {
        wakeLock = (await navigator.wakeLock?.request('screen')) || null;
      } catch {
        wakeLock = null; // not supported, or refused: the timer still works
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !closed) keepAwake();
    };

    function finish(completed) {
      if (closed) return;
      closed = true;
      clearTimeout(frame);
      document.removeEventListener('visibilitychange', onVisible);
      wakeLock?.release?.().catch(() => {});
      audio?.close?.().catch(() => {});
      dialog.close();
      dialog.remove();
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
      resolve({ completed });
    }
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(false);
    });
    dialog.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') e.stopPropagation();
    });

    document.body.append(dialog);
    dialog.showModal();
    document.addEventListener('visibilitychange', onVisible);
    keepAwake();
    pauseBtn.focus({ preventScroll: true });
    tick();
  });
}
