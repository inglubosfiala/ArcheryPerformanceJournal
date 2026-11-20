// Service worker: cache-first app shell (ARCHITECTURE §7.2). Never touches user data.
const VERSION = '__APP_VERSION__';
// Cache Storage is shared by every application on this origin. Include the worker's scope
// as well as its environment, so another Pages project cannot read or remove these caches.
const ENV = '__APP_ENV__';
const COMMIT = '__APP_COMMIT__';
const BUILT_AT = '__APP_BUILT_AT__';
const PREFIX = `archery-journal-${ENV}-${encodeURIComponent(self.registration.scope)}-`;
const CACHE = `${PREFIX}${VERSION}-${COMMIT}-${BUILT_AT}`;
const ownCache = (key) => key.startsWith(PREFIX);

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/apl-tokens.css',
  './css/apl.css',
  './css/base.css',
  './fonts/inter-latin-400-normal.woff2',
  './fonts/inter-latin-ext-400-normal.woff2',
  './fonts/inter-latin-500-normal.woff2',
  './fonts/inter-latin-ext-500-normal.woff2',
  './fonts/inter-latin-600-normal.woff2',
  './fonts/inter-latin-ext-600-normal.woff2',
  './fonts/inter-latin-700-normal.woff2',
  './fonts/inter-latin-ext-700-normal.woff2',
  './icons/icon.svg',
  './icons/support-qr.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './js/theme-boot.js',
  './js/main.js',
  './js/config.js',
  './js/core/dom.js',
  './js/core/router.js',
  './js/core/state.js',
  './js/core/calendar.js',
  './js/storage/repository.js',
  './js/storage/localStorageAdapter.js',
  './js/storage/migrations.js',
  './js/backup/backup.js',
  './js/sync/errors.js',
  './js/sync/merge.js',
  './js/sync/syncService.js',
  './js/sync/googleAuth.js',
  './js/sync/driveStore.js',
  './js/sync/syncController.js',
  './js/pwa/updates.js',
  './js/app/collections.js',
  './js/app/drillView.js',
  './js/app/gym.js',
  './js/app/timeMath.js',
  './js/app/views/formFinish.js',
  './js/app/views/gymForm.js',
  './js/app/views/gymRunning.js',
  './js/app/views/gymSetup.js',
  './js/app/lastSetup.js',
  './js/app/sessionInsights.js',
  './js/app/gearFields.js',
  './js/app/icons.js',
  './js/app/scoring.js',
  './js/app/targetCatalog.js',
  './js/app/loupePlacement.js',
  './js/app/photoDetect.js',
  './js/app/photoWorker.js',
  './js/app/scanGeometry.js',
  './js/app/scan.js',
  './js/app/multiViewScan.js',
  './js/app/scanPhoto.js',
  './js/app/tabata.js',
  './js/app/views/tabataTimer.js',
  './js/app/views/liveScan.js',
  './js/app/watchCode.js',
  './js/app/hrTrace.js',
  './js/app/views/watchScan.js',
  './js/app/views/watchEnd.js',
  './js/vendor/jsQR.js',
  './js/app/runningSession.js',
  './js/app/openFormSession.js',
  './js/app/finishedSession.js',
  './js/app/sessionLogic.js',
  './js/app/stats.js',
  './js/app/endSummary.js',
  './js/app/strings.js',
  './js/app/gradeTexts.js',
  './js/app/views/common.js',
  './js/app/views/confirm.js',
  './js/app/views/pickers.js',
  './js/app/views/face.js',
  './js/app/views/log.js',
  './js/app/views/sessionSetup.js',
  './js/app/views/shootingSetup.js',
  './js/app/views/blankBale.js',
  './js/app/views/sessionOverview.js',
  './js/app/views/setupFaces.js',
  './js/app/views/timer.js',
  './js/ui/apl/index.js',
  './js/app/views/history.js',
  './js/app/views/gear.js',
  './js/app/views/gearSheet.js',
  './js/app/views/gearSights.js',
  './js/app/views/competitionLog.js',
  './js/app/views/dashboard.js',
  './js/app/views/sessionForms.js',
  './js/app/sessionTypes.js',
  './js/app/insights.js',
  './js/app/views/insights.js',
  './js/app/views/charts.js',
  './js/app/views/settings.js',
  './js/app/views/settingsGrades.js',
  './js/app/support.js',
];

self.addEventListener('install', (event) => {
  // cache: 'reload' skips the browser's HTTP cache (GitHub Pages sends max-age=600), so a new
  // version never stores files left over from the previous one.
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((url) => new Request(url, { cache: 'reload' })))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => ownCache(k) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || !url.href.startsWith(self.registration.scope)) return;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const offline = async () => {
        const hit = await cache.match(req, { ignoreSearch: true });
        if (hit) return hit;
        return (req.mode === 'navigate' && (await cache.match('./index.html'))) || Response.error();
      };
      // Local development is network-first so edits show up immediately. Only navigations may
      // fall back to HTML: returning index.html for a missing JS module hides the real failure.
      if (VERSION.includes('APP_VERSION')) return fetch(req).catch(offline);
      const hit = await cache.match(req, { ignoreSearch: true });
      return hit || fetch(req).catch(offline);
    }),
  );
});
