// Turns a 32 x 32 mask into a smooth outline (a Path2D in mask units, 0..32), so a
// shape hint looks like a cut-paper shadow instead of a stack of stamped dots.
// Steps: blur the mask a little, trace the 0.5 contour (marching squares), join the
// pieces into loops, and round the corners (Chaikin). Paths are cached per mask.
import { N } from './matcher.js';

const cache = new WeakMap();
const hasPath = typeof Path2D !== 'undefined';

// pairs of cell edges the contour joins, for each marching-squares case (T, R, B, L)
const CASES = [[], ['L', 'B'], ['B', 'R'], ['L', 'R'], ['T', 'R'], ['T', 'L', 'B', 'R'], ['T', 'B'], ['T', 'L'],
  ['T', 'L'], ['T', 'B'], ['T', 'R', 'L', 'B'], ['T', 'R'], ['L', 'R'], ['B', 'R'], ['L', 'B'], []];

export function maskPath(mask) {
  if (!hasPath) return null;
  let p = cache.get(mask);
  if (p) return p;
  const M = N + 2;                       // field is the mask with one empty cell all round
  const f = new Float32Array(M * M), g = new Float32Array(M * M);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) f[(y + 1) * M + x + 1] = mask[y * N + x];
  for (let y = 1; y < M - 1; y++) for (let x = 1; x < M - 1; x++)      // 3 x 3 blur, twice
    g[y * M + x] = (f[y * M + x - 1] + 2 * f[y * M + x] + f[y * M + x + 1]) / 4;
  for (let y = 1; y < M - 1; y++) for (let x = 1; x < M - 1; x++)
    f[y * M + x] = (g[(y - 1) * M + x] + 2 * g[y * M + x] + g[(y + 1) * M + x]) / 4;

  // edge points, keyed by edge: horizontal edge (x,y)-(x+1,y) = 2*(y*M+x), vertical = +1
  const pos = new Map(), links = new Map();
  const point = (id, x0, y0, x1, y1, v0, v1) => {
    if (!pos.has(id)) { const t = (0.5 - v0) / (v1 - v0); pos.set(id, [x0 + (x1 - x0) * t - 0.5, y0 + (y1 - y0) * t - 0.5]); }
    return id;
  };
  const link = (a, b) => { (links.get(a) || links.set(a, []).get(a)).push(b); (links.get(b) || links.set(b, []).get(b)).push(a); };
  for (let y = 0; y < M - 1; y++) for (let x = 0; x < M - 1; x++) {
    const tl = f[y * M + x], tr = f[y * M + x + 1], br = f[(y + 1) * M + x + 1], bl = f[(y + 1) * M + x];
    const k = (tl >= 0.5 ? 8 : 0) | (tr >= 0.5 ? 4 : 0) | (br >= 0.5 ? 2 : 0) | (bl >= 0.5 ? 1 : 0);
    const pairs = CASES[k];
    if (!pairs.length) continue;
    const edge = {
      T: () => point(2 * (y * M + x), x, y, x + 1, y, tl, tr),
      B: () => point(2 * ((y + 1) * M + x), x, y + 1, x + 1, y + 1, bl, br),
      L: () => point(2 * (y * M + x) + 1, x, y, x, y + 1, tl, bl),
      R: () => point(2 * (y * M + x + 1) + 1, x + 1, y, x + 1, y + 1, tr, br),
    };
    for (let i = 0; i < pairs.length; i += 2) link(edge[pairs[i]](), edge[pairs[i + 1]]());
  }

  // join the segments into closed loops
  p = new Path2D();
  const seen = new Set();
  for (const start of links.keys()) {
    if (seen.has(start)) continue;
    const loop = [];
    let prev = -1, cur = start;
    while (cur !== undefined && !seen.has(cur)) {
      seen.add(cur); loop.push(pos.get(cur));
      const next = links.get(cur).find((n) => n !== prev && !seen.has(n));
      prev = cur; cur = next;
    }
    if (loop.length < 3) continue;
    let pts = loop;
    for (let it = 0; it < 2; it++) {     // round the corners
      const out = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
      }
      pts = out;
    }
    p.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
    p.closePath();
  }
  cache.set(mask, p);
  return p;
}
