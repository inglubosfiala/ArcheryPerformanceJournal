// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { supportCard } from '../public/js/app/views/settings.js';
import { supportRow } from '../public/js/app/views/dashboard.js';
import { paypalMeUrl } from '../public/js/app/support.js';

describe('Settings support card', () => {
  it('is left out when no support link is set', () => {
    expect(supportCard('', '')).toBeNull();
  });

  it('links to the tip page in a new tab, without passing on the app as referrer', () => {
    const node = supportCard('https://ko-fi.com/example', '');
    const link = node.querySelector('a.support-link');
    expect(link.getAttribute('href')).toBe('https://ko-fi.com/example');
    expect(link.target).toBe('_blank');
    expect(link.rel).toBe('noopener noreferrer');
    expect(link.textContent).toContain('Buy me a coffee');
    expect(node.textContent).toContain('Support the journal');
  });
});

describe('Dashboard support row', () => {
  it('opens the tip page in a new tab, and is left out without a link', () => {
    const link = supportRow('https://ko-fi.com/example', '').querySelector('a');
    expect(link.getAttribute('href')).toBe('https://ko-fi.com/example');
    expect(link.target).toBe('_blank');
    expect(link.textContent).toContain('Buy me a coffee');
    expect(supportRow('', '')).toBeNull();
  });
});

describe('PayPal tips', () => {
  it('builds PayPal.Me links, with the amount in euros when one is given', () => {
    expect(paypalMeUrl('archer')).toBe('https://paypal.me/archer');
    expect(paypalMeUrl('archer', 5)).toBe('https://paypal.me/archer/5EUR');
  });

  it('offers one button per amount and one for another amount, each in a new tab', () => {
    const node = supportCard('https://ko-fi.com/example', 'archer', [3, 5, 10]);
    const links = [...node.querySelectorAll('.support-amounts a')];
    expect(links.map((a) => a.textContent)).toEqual(['€3', '€5', '€10', 'Other']);
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      'https://paypal.me/archer/3EUR',
      'https://paypal.me/archer/5EUR',
      'https://paypal.me/archer/10EUR',
      'https://paypal.me/archer',
    ]);
    expect(links.every((a) => a.target === '_blank' && a.rel.includes('noopener'))).toBe(true);
  });

  it('keeps Ko-fi as the other way to tip', () => {
    const node = supportCard('https://ko-fi.com/example', 'archer');
    const kofi = node.querySelector('a[href="https://ko-fi.com/example"]');
    expect(kofi.textContent).toContain('Ko-fi');
  });

  it('shows the card with PayPal alone, and no PayPal buttons without a name', () => {
    expect(supportCard('', 'archer').querySelectorAll('.support-amounts a').length).toBeGreaterThan(0);
    expect(supportCard('https://ko-fi.com/example', '').querySelector('.support-paypal')).toBeNull();
  });

  it('points the Dashboard row to PayPal.Me when a name is set', () => {
    const link = supportRow('https://ko-fi.com/example', 'archer').querySelector('a');
    expect(link.getAttribute('href')).toBe('https://paypal.me/archer');
    expect(supportRow('https://ko-fi.com/example', '').querySelector('a').getAttribute('href')).toBe(
      'https://ko-fi.com/example',
    );
  });
});
