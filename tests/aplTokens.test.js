import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildTokensCss, OUT } from '../scripts/apl-tokens.mjs';

const tokens = JSON.parse(readFileSync(new URL('../design/apl/tokens.json', import.meta.url), 'utf8'));

describe('APL tokens', () => {
  it('public/css/apl-tokens.css is generated from design/apl/tokens.json (run npm run tokens)', () => {
    expect(readFileSync(OUT, 'utf8')).toBe(buildTokensCss());
  });

  it('keeps every design-system token under its own name', () => {
    const css = buildTokensCss();
    const names = [...tokens.color.tokens, ...tokens.spacing.tokens, ...tokens.radius.tokens].map(
      (t) => t.name,
    );
    for (const name of names) expect(css).toMatch(new RegExp(`--${name}: `));
    expect(css).toContain('--space-5: 16px;');
    expect(css).toContain('--accent: #0b7a55;');
  });

  it('turns each text style into a font shorthand', () => {
    const css = buildTokensCss();
    expect(css).toContain('--type-screen-title: 700 20px/26px var(--font-sans);');
    expect(css).toContain('--type-label-tracking: 0.06em;');
  });
});
