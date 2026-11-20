import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const theme = readFileSync(new URL('../public/js/theme-boot.js', import.meta.url), 'utf8');
const scope = 'https://example.github.io/ArcheryPerformanceJournal/';

function worker({ env = 'test', commit = 'abc', built = 'today', local = false, hit, keys = [], networkFails = false, registrationScope = scope } = {}) {
  const listeners = {};
  const opened = [];
  const deleted = [];
  const matched = [];
  const requests = [];
  const cache = {
    match: async (request) => {
      matched.push(request);
      return request === './index.html' ? { html: true } : hit;
    },
    addAll: async (urls) => requests.push(...urls),
  };
  const stamped = source.replaceAll('__APP_ENV__', env).replaceAll('__APP_COMMIT__', commit).replaceAll('__APP_BUILT_AT__', built);
  runInNewContext(local ? stamped : stamped.replaceAll('__APP_VERSION__', '0.1.1'), {
    self: { registration: { scope: registrationScope }, clients: { claim: async () => {} }, addEventListener: (name, fn) => { listeners[name] = fn; } },
    caches: {
      open: async (key) => { opened.push(key); return cache; },
      keys: async () => keys,
      delete: async (key) => { deleted.push(key); },
    },
    URL,
    Request: class { constructor(url) { this.url = url; } },
    Response: { error: () => ({ error: true }) },
    fetch: async () => { if (networkFails) throw new Error('offline'); return { network: true }; },
  });
  return { listeners, opened, deleted, matched, requests };
}

async function dispatch(w, name, request) {
  let result;
  w.listeners[name]({ request, respondWith: (p) => { result = p; }, waitUntil: (p) => { result = p; } });
  return result;
}
const request = (name, mode = 'cors') => ({ method: 'GET', url: scope + name, mode });

test('every shipped JavaScript module and every precached asset is available offline', async () => {
  const w = worker();
  await dispatch(w, 'install');
  const shell = new Set(w.requests.map((r) => r.url.replace(/^\.\//, '')));
  const root = new URL('../public/', import.meta.url);
  const walk = (dir) => readdirSync(new URL(dir, root), { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? walk(dir + entry.name + '/') : [dir + entry.name]);
  for (const file of walk('js/').filter((file) => file.endsWith('.js'))) assert.ok(shell.has(file), `${file} missing from precache`);
  for (const file of shell) assert.ok(existsSync(new URL(file, root)), `${file} does not exist`);
});

test('cache identity differs by commit, build, environment and registration scope', async () => {
  const variants = [{}, { commit: 'def' }, { built: 'tomorrow' }, { env: 'prod' }, { registrationScope: 'https://example.github.io/another/' }];
  const names = [];
  for (const options of variants) { const w = worker(options); await dispatch(w, 'install'); names.push(w.opened[0]); }
  assert.equal(new Set(names).size, variants.length);
});

test('activation removes only old versions owned by this scope and environment', async () => {
  const first = worker();
  await dispatch(first, 'install');
  const current = first.opened[0];
  const old = current.replace('abc-today', 'old-yesterday');
  const foreign = current.replace(encodeURIComponent(scope), encodeURIComponent('https://example.github.io/another/'));
  const production = current.replace('journal-test-', 'journal-prod-');
  const w = worker({ keys: [old, current, foreign, production, 'archery-journal-0.1.1'] });
  await dispatch(w, 'activate');
  assert.deepEqual(w.deleted, [old]);
});

test('fetch reads only the current cache and ignores requests outside its scope', async () => {
  const w = worker({ hit: { cached: true } });
  assert.deepEqual(await dispatch(w, 'fetch', request('js/main.js')), { cached: true });
  assert.equal(w.opened.length, 1);
  assert.equal(await dispatch(w, 'fetch', { ...request(''), url: 'https://example.github.io/another/main.js' }), undefined);
  assert.equal(w.opened.length, 1);
});

test('offline HTML fallback is restricted to navigations in local and deployed builds', async () => {
  for (const local of [false, true]) {
    const w = worker({ local, networkFails: true });
    assert.deepEqual(await dispatch(w, 'fetch', request('missing.js')), { error: true });
    assert.deepEqual(await dispatch(w, 'fetch', request('page', 'navigate')), { html: true });
  }
});

test('local builds prefer the network while deployed builds prefer their cache', async () => {
  for (const local of [false, true]) {
    const w = worker({ local, hit: { cached: true } });
    assert.deepEqual(await dispatch(w, 'fetch', request('js/main.js')), local ? { network: true } : { cached: true });
  }
});

test('root test deployments read the test theme and production ignores a test-like path', () => {
  for (const [env, path, expected] of [['test', scope, 'apj-test.v1.theme'], ['prod', scope + 'test/', 'apj.v1.theme'], ['__APP_ENV__', scope + 'test/', 'apj-test.v1.theme']]) {
    let key;
    const document = { currentScript: { src: path + 'js/theme-boot.js' }, documentElement: { dataset: {} } };
    runInNewContext(theme.replaceAll('__APP_ENV__', env), { document, URL, localStorage: { getItem: (value) => { key = value; return 'dark'; } } });
    assert.equal(key, expected);
    assert.equal(document.documentElement.dataset.theme, 'dark');
  }
});
