import { describe, it, expect } from 'vitest';
import { versionLabel } from '../public/js/config.js';

describe('versionLabel', () => {
  const build = { version: '0.1.158', commit: '849cc65', builtAt: '2026-11-19T14:05:09Z', env: 'prod' };

  it('reads as a version number and a date', () => {
    expect(versionLabel(build)).toBe('Version 0.1.158 · 19 Nov 2026');
  });

  it('adds the build and the environment in the long form', () => {
    expect(versionLabel(build, { long: true })).toBe('Version 0.1.158 · 19 Nov 2026 · build 849cc65 · prod environment');
  });

  it('is "dev" for an unstamped local build', () => {
    expect(versionLabel({ version: '__APP_VERSION__', env: 'dev' })).toBe('Version dev');
    expect(versionLabel({ version: '__APP_VERSION__', env: 'dev' }, { long: true })).toBe('Version dev · dev environment');
    expect(versionLabel()).toBe('Version dev'); // this source tree is unstamped
  });

  it('leaves out what was not stamped', () => {
    expect(versionLabel({ version: '0.1.5', commit: '__APP_COMMIT__', builtAt: '__APP_BUILT_AT__', env: 'test' }, { long: true })).toBe(
      'Version 0.1.5 · test environment',
    );
  });
});
