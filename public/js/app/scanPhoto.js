// Keeping the raw picture of a Scan (Settings › Scan, on by default): the camera frame the arrows
// were read from, or the photo taken with Photo, is saved as a file on the phone, without the marks
// drawn over it, so a reading can be checked later. A web app cannot write to the gallery itself:
// the picture is downloaded, and the phone's gallery shows the Download folder as an album.
// A photo picked from the gallery is already there and is not saved again.

const EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif' };
const JPEG_QUALITY = 0.92;

/** Whether the pictures of a Scan are kept (settings.saveScanPhotos; on unless switched off). */
export const keepsScanPhotos = (settings) => settings?.saveScanPhotos !== false;

/** `archery-scan-2026-11-19_14-05-09-40t.jpg`: sorts by time, and says which face was scanned. */
export function scanPhotoName({ face, type = 'image/jpeg', date = new Date() }) {
  const p = (n) => String(n).padStart(2, '0');
  const day = `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
  const time = `${p(date.getHours())}-${p(date.getMinutes())}-${p(date.getSeconds())}`;
  const sheet = String(face ?? '').replace(/[^a-z0-9]+/gi, '');
  return `archery-scan-${day}_${time}${sheet ? `-${sheet}` : ''}.${EXTENSIONS[type] || 'jpg'}`;
}

/** The picture of a Scan as a blob: a canvas (the camera frame) as JPEG, a photo file as it is. */
function blobOf({ canvas, file }) {
  if (file) return Promise.resolve(file);
  return new Promise((done) => canvas.toBlob(done, 'image/jpeg', JPEG_QUALITY));
}

/**
 * Save the picture of a Scan ({ canvas } or { file }) to the phone. Best effort: a Scan goes on
 * whether or not the picture could be saved. Resolves with the file name, or null when not saved.
 */
export async function saveScanPhoto(source, { face, date = new Date() } = {}) {
  try {
    const blob = await blobOf(source);
    if (!blob) return null;
    const name = scanPhotoName({ face, type: blob.type, date });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return name;
  } catch (err) {
    console.error(err);
    return null;
  }
}
