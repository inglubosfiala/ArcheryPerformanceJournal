// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { keepsScanPhotos, scanPhotoName, saveScanPhoto } from '../public/js/app/scanPhoto.js';
import { defaultSettings } from '../public/js/app/collections.js';

describe('keeping scan photos', () => {
  it('is on by default, also for settings saved before the switch existed', () => {
    expect(keepsScanPhotos(defaultSettings)).toBe(true);
    expect(keepsScanPhotos({})).toBe(true);
    expect(keepsScanPhotos(undefined)).toBe(true);
    expect(keepsScanPhotos({ saveScanPhotos: false })).toBe(false);
  });
});

describe('scanPhotoName', () => {
  const date = new Date(2026, 10, 19, 14, 5, 9);

  it('carries the time and the face', () => {
    expect(scanPhotoName({ face: '40t', date })).toBe('archery-scan-2026-11-19_14-05-09-40t.jpg');
  });

  it('follows the type of the photo', () => {
    expect(scanPhotoName({ face: '122', type: 'image/png', date })).toMatch(/-122\.png$/);
    expect(scanPhotoName({ face: '122', type: '', date })).toMatch(/\.jpg$/);
  });

  it('leaves the face out when there is none', () => {
    expect(scanPhotoName({ date })).toBe('archery-scan-2026-11-19_14-05-09.jpg');
  });
});

describe('saveScanPhoto', () => {
  afterEach(() => vi.restoreAllMocks());

  const downloads = () => {
    const clicked = [];
    vi.spyOn(globalThis.HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
      clicked.push({ name: this.download, href: this.href });
    });
    URL.createObjectURL = vi.fn(() => 'blob:scan');
    URL.revokeObjectURL = vi.fn();
    return clicked;
  };
  const date = new Date(2026, 10, 19, 14, 5, 9);

  it('downloads a photo file as it is', async () => {
    const clicked = downloads();
    const file = new File(['x'], 'IMG_1.png', { type: 'image/png' });
    expect(await saveScanPhoto({ file }, { face: '40t', date })).toBe('archery-scan-2026-11-19_14-05-09-40t.png');
    expect(URL.createObjectURL).toHaveBeenCalledWith(file);
    expect(clicked).toHaveLength(1);
    expect(clicked[0].name).toBe('archery-scan-2026-11-19_14-05-09-40t.png');
  });

  it('downloads a camera frame as JPEG', async () => {
    const clicked = downloads();
    const blob = new Blob(['x'], { type: 'image/jpeg' });
    const canvas = { toBlob: vi.fn((done) => done(blob)) };
    expect(await saveScanPhoto({ canvas }, { face: '122', date })).toMatch(/-122\.jpg$/);
    expect(canvas.toBlob.mock.calls[0][1]).toBe('image/jpeg');
    expect(clicked).toHaveLength(1);
  });

  it('never fails the Scan', async () => {
    const clicked = downloads();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await saveScanPhoto({ canvas: { toBlob: (done) => done(null) } })).toBeNull();
    expect(
      await saveScanPhoto({
        canvas: {
          toBlob: () => {
            throw new Error('tainted');
          },
        },
      }),
    ).toBeNull();
    expect(clicked).toHaveLength(0);
  });
});
