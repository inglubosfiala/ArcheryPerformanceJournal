// How far each way of placing the arrow is from the hole marked by hand, and which scoring rule on the marked
// hole gives the archer's scores.
// node eval_marks.mjs <results.json from refine.mjs> <marks.json> <manifest.json>
// results.json must hold the variants base, A and A+ctr (VARIANTS env of refine.mjs) and edgeMm / halfMm per arrow.
import fs from 'node:fs';

const [resFile, marksFile, manFile] = process.argv.slice(2);
const rows = JSON.parse(fs.readFileSync(resFile, 'utf8')).rows;
const marks = JSON.parse(fs.readFileSync(marksFile, 'utf8'));
const man = Object.fromEntries(JSON.parse(fs.readFileSync(manFile, 'utf8')).map((m) => [m.id, m]));
const MM = 100;

// picture → face (spot radius 1), as scanGeometry.faceFromPicture
function faceFromPicture(o, p) {
  const cos = Math.cos(o.angle), sin = Math.sin(o.angle);
  const vx = p.x - o.cx, vy = p.y - o.cy;
  const u1 = (cos * vx + sin * vy) / o.rx, u2 = (-sin * vx + cos * vy) / o.ry;
  return { x: cos * u1 - sin * u2, y: sin * u1 + cos * u2 };
}
// the score of a radius on a 10–6 spot; on a line the higher ring (a radius exactly on it counts in)
const scoreOf = (d) => (d <= 0.2 ? 10 : d <= 0.4 ? 9 : d <= 0.6 ? 8 : d <= 0.8 ? 7 : d <= 1 ? 6 : 0);
const val = (v) => (v === 'X' ? 10 : v === 'M' ? 0 : v);
const stats = (a) => {
  if (!a.length) return 'n=0';
  const m = a.reduce((p, q) => p + q, 0) / a.length;
  const sd = Math.sqrt(a.reduce((p, q) => p + (q - m) ** 2, 0) / a.length);
  const mae = a.reduce((p, q) => p + Math.abs(q), 0) / a.length;
  return `n=${a.length}  bias ${m >= 0 ? '+' : ''}${m.toFixed(2)} mm  sd ${sd.toFixed(2)} mm  mean |err| ${mae.toFixed(2)} mm`;
};

const used = [];
for (const r of rows) {
  const id = `${r.photo}_s${r.spot}`;
  const m = marks[id];
  if (!m || m.skip) continue;
  const f = faceFromPicture(r.outer, { x: m.fullX, y: m.fullY });
  used.push({ id, r, d: Math.hypot(f.x, f.y) });
}
console.log(`marked: ${used.length} of ${rows.length} (skipped ${Object.values(marks).filter((m) => m.skip).length})\n`);

console.log('Radial error of each point against the marked hole (+ = further out than the hole):');
for (const v of ['base', 'A', 'A+ctr']) {
  const errs = used.filter((u) => u.r.d[v] != null).map((u) => (u.r.d[v] - u.d) * MM);
  console.log(`  ${v.padEnd(6)} ${stats(errs)}`);
}

console.log('\nScores from the marked hole, by rule (right / marked):');
const rules = {
  'centre, fitted rings': (u) => u.d,
  'centre, local ring': (u) => u.d - (u.r.edgeMm ?? 0) / MM,
  'edge (centre − half shaft), fitted rings': (u) => u.d - (u.r.halfMm ?? 2.7) / MM,
  'edge (centre − half shaft), local ring': (u) => u.d - (u.r.halfMm ?? 2.7) / MM - (u.r.edgeMm ?? 0) / MM,
};
for (const [name, rd] of Object.entries(rules)) {
  const wrong = used.filter((u) => scoreOf(rd(u)) !== u.r.truth);
  console.log(`  ${String(used.length - wrong.length).padStart(2)}/${used.length}  ${name}${wrong.length ? '   wrong: ' + wrong.map((u) => `${u.id.slice(0, 2)}${u.r.spot}`).join(' ') : ''}`);
}
console.log('\nPer arrow (mm from the nearest line, + = outside; local ring shift):');
for (const u of used) {
  const e = [0.2, 0.4, 0.6, 0.8, 1].reduce((p, q) => (Math.abs(q - u.d) < Math.abs(p - u.d) ? q : p));
  const near = ((u.d - e) * MM).toFixed(1);
  if (Math.abs(u.d - e) * MM > 6) continue;
  console.log(`  ${u.id.padEnd(16)} real ${String(u.r.truth).padStart(2)}  hole ${near.padStart(5)} mm  ring ${String(u.r.edgeMm ?? '-').padStart(5)}  half ${u.r.halfMm ?? '-'}  base ${String(u.r.read.base).padStart(2)}`);
}
