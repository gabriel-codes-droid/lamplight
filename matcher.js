// Silhouette matching. A hand shadow is a list of thick line segments
// ({ax, ay, bx, by, r}). We draw them into a small grid that is centred and
// scaled to fit, so the match ignores where the hands are and how big the
// shadow is, and compare two grids by overlap (intersection over union).
export const N = 32;

export function rasterize(segs) {
  if (!segs || !segs.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of segs) {
    x0 = Math.min(x0, s.ax - s.r, s.bx - s.r); x1 = Math.max(x1, s.ax + s.r, s.bx + s.r);
    y0 = Math.min(y0, s.ay - s.r, s.by - s.r); y1 = Math.max(y1, s.ay + s.r, s.by + s.r);
  }
  const span = Math.max(x1 - x0, y1 - y0);
  if (!(span > 0)) return null;
  const k = (N - 2) / span;
  const ox = (N - (x1 - x0) * k) / 2, oy = (N - (y1 - y0) * k) / 2;
  const m = new Uint8Array(N * N);
  for (const s of segs) {
    const ax = (s.ax - x0) * k + ox, ay = (s.ay - y0) * k + oy;
    const bx = (s.bx - x0) * k + ox, by = (s.by - y0) * k + oy;
    const r = Math.max(0.5, s.r * k), r2 = r * r;
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    const gx0 = Math.max(0, Math.floor(Math.min(ax, bx) - r)), gx1 = Math.min(N - 1, Math.ceil(Math.max(ax, bx) + r));
    const gy0 = Math.max(0, Math.floor(Math.min(ay, by) - r)), gy1 = Math.min(N - 1, Math.ceil(Math.max(ay, by) + r));
    for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
      const px = gx + 0.5 - ax, py = gy + 0.5 - ay;
      let t = len2 > 0 ? (px * dx + py * dy) / len2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = px - t * dx, ey = py - t * dy;
      if (ex * ex + ey * ey <= r2) m[gy * N + gx] = 1;
    }
  }
  return m;
}

export function iou(a, b) {
  if (!a || !b) return 0;
  let inter = 0, union = 0;
  for (let i = 0; i < a.length; i++) { inter += a[i] & b[i]; union += a[i] | b[i]; }
  return union ? inter / union : 0;
}

// ---- tilt-tolerant matching ----
// Hands never hold a shape at exactly the angle it was taught. So each saved
// template is also compared at -20..+20 degrees (5 degree steps) and the best
// score wins. A shape can have several saved templates; the best of all counts.
export const ANGLES = [-20, -15, -10, -5, 0, 5, 10, 15, 20];

// Rotate a template: turn each filled cell into a small dot, rotate the dots,
// then rasterize them again. rasterize() re-centres and re-scales, exactly as it
// does for the live shadow, so a tilted shape is compared like with like.
function rotated(mask, deg) {
  const a = deg * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a), dots = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (mask[y * N + x]) {
    const px = x + 0.5 - N / 2, py = y + 0.5 - N / 2;
    const rx = px * cs - py * sn, ry = px * sn + py * cs;
    dots.push({ ax: rx, ay: ry, bx: rx, by: ry, r: 0.78 }); // 0.78 leaves no holes after rotating
  }
  return rasterize(dots) || mask;
}

const variantCache = new WeakMap();
// All rotated versions of one template, in ANGLES order (0 degrees is the original).
export function variantsOf(mask) {
  let v = variantCache.get(mask);
  if (!v) { v = ANGLES.map((d) => (d === 0 ? mask : rotated(mask, d))); variantCache.set(mask, v); }
  return v;
}

// Where the last bestMatch() score came from: handy for tuning and the debug readout.
export const match = { score: 0, angle: 0, template: 0 };

// Best IoU of a live mask against every template (an array of masks) at every tilt.
export function bestMatch(mask, templates) {
  let best = 0, bestAngle = 0, bestTemplate = 0;
  if (mask && templates) {
    for (let t = 0; t < templates.length; t++) {
      const v = variantsOf(templates[t]);
      for (let a = 0; a < v.length; a++) {
        const score = iou(mask, v[a]);
        if (score > best) { best = score; bestAngle = ANGLES[a]; bestTemplate = t; }
      }
    }
  }
  match.score = best; match.angle = bestAngle; match.template = bestTemplate;
  return best;
}

export function encode(mask) {
  let hex = '';
  for (let i = 0; i < mask.length; i += 4)
    hex += ((mask[i] << 3) | (mask[i + 1] << 2) | (mask[i + 2] << 1) | mask[i + 3]).toString(16);
  return hex;
}

export function decode(hex) {
  const m = new Uint8Array(N * N);
  for (let i = 0; i < hex.length && i * 4 < m.length; i++) {
    const v = parseInt(hex[i], 16) || 0;
    m[i * 4] = (v >> 3) & 1; m[i * 4 + 1] = (v >> 2) & 1; m[i * 4 + 2] = (v >> 1) & 1; m[i * 4 + 3] = v & 1;
  }
  return m;
}
