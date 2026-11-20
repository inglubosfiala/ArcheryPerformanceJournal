// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { liveScan } from '../public/js/app/views/liveScan.js';
import { renderLog } from '../public/js/app/views/log.js';
import { createSession } from '../public/js/app/sessionLogic.js';
import { detectArrows } from '../public/js/app/photoDetect.js';

vi.mock('../public/js/app/photoDetect.js', async (original) => ({
  ...(await original()),
  detectArrows: vi.fn(),
}));
let stop;
let frame;
beforeEach(() => {
  vi.useFakeTimers();
  stop = vi.fn();
  frame = 0;
  vi.stubGlobal(
    'Worker',
    class {
      constructor() {
        throw new Error('Use synchronous detector in this test');
      }
    },
  );
  vi.stubGlobal('navigator', {
    mediaDevices: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] }) },
  });
  vi.spyOn(HTMLMediaElement.prototype, 'srcObject', 'set').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(2);
  Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => 640 });
  Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, get: () => 480 });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function () {
    return new Proxy(
      { canvas: this, getImageData: () => ({ width: 8, height: 8, data: new Uint8ClampedArray(256) }) },
      {
        get: (target, key) => (key in target ? target[key] : () => {}),
      },
    );
  });
  vi.mocked(detectArrows).mockImplementation(() => {
    const angle = frame++ * 0.05;
    return {
      partial: false,
      spots: [{ outer: { cx: 150, cy: 150, rx: 100, ry: 90, angle: 0 } }],
      arrows: [
        {
          x: 0.2,
          y: 0.1,
          spot: null,
          image: { x: 170, y: 159 },
          lean: { x: Math.cos(angle), y: Math.sin(angle) },
        },
      ],
    };
  });
});
afterEach(() => {
  delete HTMLVideoElement.prototype.videoWidth;
  delete HTMLVideoElement.prototype.videoHeight;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.body.replaceChildren();
});
const button = (fk) => document.querySelector(`[data-fk="${fk}"]`);

describe('separate multi-view camera mode', () => {
  it('keeps the existing four-button row and adds a separate multi-view button', () => {
    const session = {
      ...createSession({ date: '2026-11-20', distance: 18, face: '122', arrowsPerEnd: 3 }),
      id: 'session',
    };
    const ctx = { running: { get: () => session }, ui: { get: () => ({}) } };
    const { content } = renderLog(ctx);
    expect([...content.querySelector('.score-actions').children].map((b) => b.dataset.fk)).toEqual([
      'end-prev',
      'end-next',
      'watch-scan',
      'photo',
    ]);
    expect(content.querySelector('[data-fk="photo"]').textContent).toBe('Scan');
    expect(content.querySelector('[data-fk="photo-multiview"]').disabled).toBe(false);
    session.view = 0;
    session.ends = [session.current];
    const previous = renderLog(ctx).content;
    expect(previous.querySelector('[data-fk="photo"]').disabled).toBe(true);
    expect(previous.querySelector('[data-fk="photo-multiview"]').disabled).toBe(true);
  });

  it('leaves the original camera controls and steady auto-lock behavior intact', async () => {
    const result = liveScan({ face: '122', maxArrows: 1 });
    expect(button('live-photo')).not.toBeNull();
    expect(button('live-gallery')).not.toBeNull();
    expect(button('multi-reset')).toBeNull();
    await vi.advanceTimersByTimeAsync(1000);
    expect((await result).res.arrows[0].x).toBeCloseTo(0.2);
    expect(stop).toHaveBeenCalledOnce();
  });

  it('collects five observations without using the old steady lock and releases the camera', async () => {
    const result = liveScan({ face: '122', maxArrows: 1, multiView: true });
    expect(button('live-photo')).toBeNull();
    expect(button('live-gallery')).toBeNull();
    expect(button('multi-reset')).not.toBeNull();
    await vi.advanceTimersByTimeAsync(800);
    expect(button('live-take').textContent).toBe('Review 3 views');
    expect(document.querySelector('dialog')).not.toBeNull();
    await vi.advanceTimersByTimeAsync(1000);
    const got = await result;
    expect(got.res.arrows[0].x).toBe(0.2);
    expect(got.canvas.width).toBeGreaterThan(0);
    expect(stop).toHaveBeenCalledOnce();
    expect(document.querySelector('dialog')).toBeNull();
  });

  it('allows manual review after three views', async () => {
    const result = liveScan({ face: '122', maxArrows: 1, multiView: true });
    expect(button('live-take').disabled).toBe(true);
    await vi.advanceTimersByTimeAsync(800);
    expect(button('live-take').disabled).toBe(false);
    button('live-take').click();
    expect((await result).res.arrows).toHaveLength(1);
  });

  it('reset disables review and closing cancels without saving', async () => {
    const result = liveScan({ face: '122', maxArrows: 1, multiView: true });
    await vi.advanceTimersByTimeAsync(800);
    button('multi-reset').click();
    expect(button('live-take').disabled).toBe(true);
    button('live-close').click();
    expect(await result).toBeNull();
    expect(stop).toHaveBeenCalledOnce();
  });
});
