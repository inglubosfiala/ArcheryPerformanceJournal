// Sweep detector options over the cached close-up pictures (from eval.mjs with a debug dir).
// node sweep.mjs <repo> <debugDir> '<json list of option objects>'
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const [repo, dbg, list] = process.argv.slice(2);
const { detectArrows } = await import(pathToFileURL(path.join(repo, 'public/js/app/photoDetect.js')).href);
const { scoresOf } = await import(pathToFileURL(path.join(repo, 'public/js/app/scan.js')).href);
const pics = fs.readdirSync(dbg).filter((f) => f.endsWith('.json')).map((f) => {
  const name = f.slice(0, -5);
  const j = JSON.parse(fs.readFileSync(path.join(dbg, f), 'utf8'));
  return { name, truth: name.split('_').slice(1).map(Number), img: { width: j.size[0], height: j.size[1], data: new Uint8ClampedArray(fs.readFileSync(path.join(dbg, name + '.pic'))) } };
});
const val = (v) => (v === 'X' ? 10 : v);
for (const opts of JSON.parse(list)) {
  let ok = 0, n = 0, err = 0;
  const wrong = [];
  for (const p of pics) {
    const res = detectArrows(p.img, '40t', 3, opts);
    const sc = scoresOf(res.arrows, '40t');
    res.arrows.forEach((a, i) => { n++; const d = val(sc[i]) - p.truth[a.spot]; if (!d) ok++; else { err += Math.abs(d); wrong.push(`${p.name.slice(0, 2)}${a.spot}${d > 0 ? '+' : ''}${d}`); } });
  }
  console.log(`${ok}/${n}`, JSON.stringify(opts), wrong.join(' '));
}
