import { describe, it, expect } from 'vitest';
import { backupFileName, parseBackup, needsBackupReminder, serialiseBackup } from '../public/js/backup/backup.js';
import { migrate } from '../public/js/storage/migrations.js';

describe('backup', () => {
  it('names the file with the local date', () => {
    expect(backupFileName(new Date(2026, 10, 9))).toBe('archery-performance-journal-backup-2026-11-09.json');
  });
  it('round-trips a document', () => {
    const doc = { app: 'archery-performance-journal', schemaVersion: 1, collections: {} };
    expect(parseBackup(serialiseBackup(doc))).toEqual(doc);
  });
  it('rejects non-JSON', () => {
    expect(() => parseBackup('nope')).toThrow(/not valid JSON/);
  });
  it('reminds when never backed up or older than 30 days', () => {
    const now = new Date('2026-11-09T00:00:00Z');
    expect(needsBackupReminder(null, now)).toBe(true);
    expect(needsBackupReminder('2026-11-01T00:00:00Z', now)).toBe(false);
    expect(needsBackupReminder('2026-10-01T00:00:00Z', now)).toBe(true);
  });
});

describe('migrations', () => {
  it('upgrades step by step and refuses newer documents', () => {
    const steps = [
      { from: 1, to: 2, up: (d) => ({ ...d, a: 1 }) },
      { from: 2, to: 3, up: (d) => ({ ...d, b: 2 }) },
    ];
    const out = migrate({ schemaVersion: 1 }, 3, steps);
    expect(out).toMatchObject({ schemaVersion: 3, a: 1, b: 2 });
    expect(() => migrate({ schemaVersion: 4 }, 3, steps)).toThrow(/newer/);
  });
});

describe('schema v2 (Drive sync)', () => {
  it('v1 documents gain meta.settingsUpdatedAt and keep their data', async () => {
    const { migrations: real } = await import('../public/js/storage/migrations.js');
    const v1 = { app: 'archery-performance-journal', schemaVersion: 1, meta: { lastBackupAt: null }, settings: {}, collections: { sessions: [{ id: 'a' }] } };
    const out = migrate(v1, 2, real);
    expect(out.schemaVersion).toBe(2);
    expect(out.meta).toEqual({ lastBackupAt: null, settingsUpdatedAt: null });
    expect(out.collections.sessions).toEqual([{ id: 'a' }]);
  });
});

describe('schema v6 (sight marks belong to a gear setup)', () => {
  const v5 = () => ({
    app: 'archery-performance-journal',
    schemaVersion: 5,
    settings: { gear: { riser: 'Hoyt' }, sightsSeeded: true, accent: '#0B6E4F' },
    collections: {
      sessions: [{ id: 'x', gear: { riser: 'Hoyt' } }],
      gearSnapshots: [
        { id: 's1', name: 'Indoor', fields: { riser: 'Hoyt' } },
        { id: 's2', deleted: true },
      ],
      sightMarks: [
        { id: 'seed-70', distance: '70 m', elevation: '5.2', windage: '1R', note: '' },
        { id: 'seed-18', distance: '18 m', elevation: '', windage: '', note: '' },
        { id: 'blank', distance: '', elevation: '', windage: '', note: '' },
        { id: 'gone', deleted: true },
      ],
    },
  });

  it('moves the marks into the current setup and every saved setup, dropping the collection', async () => {
    const { migrations: real } = await import('../public/js/storage/migrations.js');
    const out = migrate(v5(), 6, real);
    const marks = [
      { id: 'seed-18', distance: '18 m', elevation: '', windage: '', note: '' },
      { id: 'seed-70', distance: '70 m', elevation: '5.2', windage: '1R', note: '' },
    ];
    expect(out.schemaVersion).toBe(6);
    expect(out.collections.sightMarks).toBeUndefined();
    expect(out.settings.sightsSeeded).toBeUndefined();
    expect(out.settings.gear).toEqual({ riser: 'Hoyt', sights: marks });
    expect(out.collections.gearSnapshots[0].fields).toEqual({ riser: 'Hoyt', sights: marks });
    expect(out.collections.gearSnapshots[1]).toEqual({ id: 's2', deleted: true });
    expect(out.collections.sessions).toEqual([{ id: 'x', gear: { riser: 'Hoyt' } }]);
  });

  it('leaves setups without marks when none were typed in', async () => {
    const { migrations: real } = await import('../public/js/storage/migrations.js');
    const doc = v5();
    doc.collections.sightMarks = [{ id: 'blank', distance: '', elevation: '', windage: '', note: '' }];
    const out = migrate(doc, 6, real);
    expect(out.settings.gear).toEqual({ riser: 'Hoyt' });
    expect(out.collections.gearSnapshots[0].fields).toEqual({ riser: 'Hoyt' });
  });
});
