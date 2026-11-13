// The shadow theatre: game state and all 2D drawing. It only needs a canvas
// 2D context, so it knows nothing about WebXR. main.js feeds it the hand
// shadow segments each frame and puts the canvas on the wall.
import { N, rasterize, iou, bestMatch, match, variantsOf } from './matcher.js';

export const W = 1024, H = 512;
const INK = '#160c06', PAPER = '#e9c98b', GROUND = 430;
const TEACH_HOLD = 2.5;   // seconds to hold still when teaching a shape
const MATCH_HOLD = 0.6;   // seconds a match must last to count
const TITLE_HOLD = 1;     // seconds both hands must stay tracked on the title scene
const ALIVE_TIME = 7;     // seconds of story animation per scene
// Help when stuck: after HELP_AFTER seconds waiting for a shape the hint darkens, and
// every HELP_EVERY seconds from then on the match threshold drops by HELP_STEP.
const HELP_AFTER = 20, HELP_EVERY = 10, HELP_STEP = 0.03, HELP_FLOOR = 0.3;

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const ramp = (p, a, b) => clamp01((p - a) / (b - a));
const ease = (t) => t * t * (3 - 2 * t);

function along(pts, p) { // pts: [[time, x, y], ...]
  if (p <= pts[0][0]) return [pts[0][1], pts[0][2]];
  for (let i = 1; i < pts.length; i++) {
    if (p <= pts[i][0]) {
      const [t0, xa, ya] = pts[i - 1], [t1, xb, yb] = pts[i];
      const k = ease((p - t0) / (t1 - t0));
      return [xa + (xb - xa) * k, ya + (yb - ya) * k];
    }
  }
  const l = pts[pts.length - 1];
  return [l[1], l[2]];
}

// ---------- shadow-puppet props ----------
function ground(c) {
  c.fillStyle = INK;
  c.beginPath(); c.moveTo(0, H); c.lineTo(0, GROUND);
  for (let x = 0; x <= W; x += 32) c.lineTo(x, GROUND + Math.sin(x * 0.013) * 5);
  c.lineTo(W, H); c.fill();
}
function mira(c, x, time) {
  const y = GROUND - 2 + Math.sin(time * 2) * 1.5;
  c.fillStyle = INK;
  c.beginPath(); c.arc(x, y - 58, 13, 0, 7); c.fill();
  c.beginPath(); c.moveTo(x, y - 48); c.lineTo(x - 17, y); c.lineTo(x + 17, y); c.fill();
  c.beginPath(); c.moveTo(x - 12, y - 66); c.lineTo(x - 26, y - 50); c.lineTo(x - 8, y - 54); c.fill(); // hair
}
function key(c, x, y) {
  c.strokeStyle = INK; c.lineWidth = 5; c.lineCap = 'round';
  c.beginPath(); c.arc(x, y, 8, 0, 7); c.stroke();
  c.beginPath(); c.moveTo(x + 8, y); c.lineTo(x + 30, y); c.moveTo(x + 22, y); c.lineTo(x + 22, y + 9);
  c.moveTo(x + 29, y); c.lineTo(x + 29, y + 7); c.stroke();
}
function river(c, time) {
  c.fillStyle = PAPER; c.fillRect(380, GROUND - 6, 260, 20);
  c.strokeStyle = INK; c.lineWidth = 3; c.lineCap = 'round';
  for (let row = 0; row < 3; row++) {
    c.beginPath();
    for (let x = 384; x <= 636; x += 6) {
      const y = GROUND + 2 + row * 9 + Math.sin(x * 0.08 + time * 2 + row) * 2.5;
      x === 384 ? c.moveTo(x, y) : c.lineTo(x, y);
    }
    c.stroke();
  }
}
function wolf(c, x) {
  const y = GROUND;
  c.fillStyle = INK;
  c.beginPath(); c.ellipse(x, y - 34, 50, 22, 0, 0, 7); c.fill();           // body
  c.beginPath(); c.ellipse(x - 52, y - 54, 22, 15, -0.3, 0, 7); c.fill();   // head
  c.beginPath(); c.moveTo(x - 66, y - 58); c.lineTo(x - 96, y - 46); c.lineTo(x - 64, y - 42); c.fill(); // snout
  c.beginPath(); c.moveTo(x - 56, y - 64); c.lineTo(x - 52, y - 90); c.lineTo(x - 40, y - 64); c.fill(); // ear
  c.beginPath(); c.moveTo(x + 44, y - 42); c.lineTo(x + 88, y - 66); c.lineTo(x + 50, y - 28); c.fill(); // tail
  c.fillRect(x - 34, y - 22, 9, 24); c.fillRect(x + 26, y - 22, 9, 24);
}
function house(c, x) {
  const y = GROUND;
  c.fillStyle = INK;
  c.fillRect(x - 55, y - 80, 110, 82);
  c.beginPath(); c.moveTo(x - 72, y - 78); c.lineTo(x, y - 136); c.lineTo(x + 72, y - 78); c.fill();
  c.fillStyle = '#ffdf9a'; c.fillRect(x + 8, y - 60, 26, 26); // lit window
}

// ---------- the story ----------
// creature(p, sx, sy): where the living shadow is, p = 0..1 through the scene.
// draw(c, p, time, cr): backdrop and actors; cr is the creature position or null.
const SCENES = [
  {
    shape: 'bird',
    prompt: 'Mira dropped her key across the river. Make a bird.',
    creature: (p, sx, sy) => along([[0, sx, sy], [0.35, 800, 380], [0.8, 215, 360], [1, 420, -120]], p),
    draw(c, p, time, cr) {
      ground(c); river(c, time); mira(c, 170, time);
      if (p < 0.35 || !cr) key(c, 800, GROUND - 14);
      else if (p < 0.8) key(c, cr[0] - 10, cr[1] + 42);
      else key(c, 196, GROUND - 30);
    },
  },
  {
    shape: 'dog',
    prompt: 'A wolf blocks the path. Make a dog to chase it off.',
    creature: (p, sx, sy) => {
      const [x, y] = along([[0, sx, sy], [0.4, 540, 385], [1, 600, 385]], p);
      return [x + (p > 0.4 && p < 0.65 ? Math.sin(p * 220) * 7 : 0), y]; // barking
    },
    draw(c, p, time) {
      ground(c);
      mira(c, 170 + ease(ramp(p, 0.65, 1)) * 150, time);
      wolf(c, 760 + ease(ramp(p, 0.45, 1)) * 520);
    },
  },
  {
    shape: 'rabbit',
    prompt: 'A wall stands before home. Make a rabbit to dig under it.',
    creature: (p, sx, sy) => along([[0, sx, sy], [0.35, 455, 395], [0.6, 520, 425], [0.8, 610, 395], [1, 640, 395]], p),
    draw(c, p, time) {
      ground(c); house(c, 860);
      c.fillStyle = INK; c.fillRect(498, 230, 44, 204);
      const dig = ease(ramp(p, 0.4, 0.62));
      if (dig > 0) { c.fillStyle = PAPER; c.beginPath(); c.arc(520, GROUND + 2, 46 * dig, Math.PI, 0); c.fill(); }
      mira(c, 170 + ease(ramp(p, 0.62, 1)) * 640, time);
    },
  },
];

export const SHAPE_NAMES = [...new Set(SCENES.map((sc) => sc.shape))];

// shapes: { name: [mask, mask, ...] }. Several templates per shape are allowed;
// teach: names to (re)teach this run, on top of any shape that has no template yet.
export function createTheatre({ ctx, shapes, teach = [], threshold = 0.55, onShapeSaved = () => {}, sfx = {} }) {
  const c = ctx;
  const has = (n) => !!(shapes[n] && shapes[n].length);
  for (const n of SHAPE_NAMES) if (shapes[n]) for (const m of shapes[n]) variantsOf(m); // build tilted copies now, not mid-game
  const s = { phase: 'title', i: 0, t: 0, hold: 0, stuck: 0, titleHold: 0, live: false, hands: 0, supported: true, still: 0, cooldown: 0, teach: null,
              ref: null, clock: 0, mask: null, score: 0, snap: null, segs: [] };
  const toTeach = teach.slice();

  function begin() {
    const missing = toTeach.shift() || SHAPE_NAMES.find((n) => !has(n));
    if (missing) Object.assign(s, { phase: 'teach', teach: missing, t: 0, still: 0, ref: null, cooldown: 0 });
    else startScene(0);
  }
  function startScene(i) { Object.assign(s, { phase: 'intro', i, t: 0, hold: 0, stuck: 0, snap: null }); }

  // The threshold the player has to beat right now. It never drops below
  // HELP_FLOOR (or the configured threshold, if that is already lower).
  function currentThreshold() {
    if (s.stuck < HELP_AFTER) return threshold;
    const steps = Math.floor((s.stuck - HELP_AFTER) / HELP_EVERY) + 1;
    return Math.max(Math.min(threshold, HELP_FLOOR), threshold - steps * HELP_STEP);
  }
  function succeed() {
    let snap = null;
    if (s.segs.length) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const g of s.segs) { x0 = Math.min(x0, g.ax, g.bx); x1 = Math.max(x1, g.ax, g.bx); y0 = Math.min(y0, g.ay, g.by); y1 = Math.max(y1, g.ay, g.by); }
      snap = { segs: s.segs.map((g) => ({ ...g })), cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, size: Math.max(x1 - x0, y1 - y0, 1) };
    }
    Object.assign(s, { phase: 'alive', t: 0, snap });
    sfx.chime && sfx.chime();
  }
  function saveTeach(mask, persist) {
    const saved = mask.slice();
    (shapes[s.teach] || (shapes[s.teach] = [])).push(saved);
    variantsOf(saved);
    if (persist) onShapeSaved(s.teach, saved);
    s.cooldown = 2.5; s.still = 0; s.ref = null;
    sfx.chime && sfx.chime();
  }

  // input (from main.js): { live: a headset or replay is driving the hands,
  //   hands: how many hands are tracked right now, supported: hand tracking is available (null = not known yet) }
  function update(dt, segs, input) {
    s.t += dt; s.clock += dt; s.segs = segs;
    s.live = !!(input && input.live); s.hands = s.live ? input.hands : 0; s.supported = input ? input.supported : true;
    if (s.phase === 'title') {      // the story starts once both hands have been seen for a moment
      s.titleHold = s.live && s.hands >= 2 ? s.titleHold + dt : Math.max(0, s.titleHold - dt * 2);
      if (s.titleHold >= TITLE_HOLD) begin();
      return;
    }
    if (s.phase === 'teach' && s.cooldown > 0) { s.cooldown -= dt; if (s.cooldown <= 0) begin(); return; }
    if (s.phase === 'intro' && s.t > 2.5) { s.phase = 'wait'; s.t = 0; }
    if (s.phase === 'alive' && s.t > ALIVE_TIME) { s.i + 1 < SCENES.length ? startScene(s.i + 1) : Object.assign(s, { phase: 'end', t: 0 }); }
    if (s.phase === 'end' && s.t > 8) startScene(0);
    if (s.clock < 0.06) return;          // match about 16 times a second
    const el = s.clock; s.clock = 0;
    s.mask = rasterize(segs);
    if (s.phase === 'teach') {
      if (!s.mask) { s.ref = null; s.still = 0; }
      else if (!s.ref || iou(s.mask, s.ref) < 0.78) { s.ref = s.mask; s.still = 0; }
      else { s.still += el; if (s.still >= TEACH_HOLD) saveTeach(s.mask, true); }
    } else if (s.phase === 'wait') {
      s.stuck += el;
      s.score = bestMatch(s.mask, shapes[SCENES[s.i].shape]); s.angle = match.angle;
      s.hold = s.score >= currentThreshold() ? s.hold + el : Math.max(0, s.hold - el * 2);
      if (s.hold >= MATCH_HOLD) succeed();
    }
  }

  // Desktop preview / debugging: pass the current step without hands.
  function skip() {
    if (s.phase === 'title') begin();
    else if (s.phase === 'teach' && s.cooldown <= 0) saveTeach(rasterize([{ ax: 0, ay: 0, bx: 10, by: 4, r: 4 }]), false);
    else if (s.phase === 'wait' || s.phase === 'intro') succeed();
  }

  function drawMask(mask, cx, cy, size, style) {
    const cell = size / N;
    c.fillStyle = style; c.beginPath();
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (mask[y * N + x]) {
      const px = cx - size / 2 + (x + 0.5) * cell, py = cy - size / 2 + (y + 0.5) * cell;
      c.moveTo(px + cell * 0.8, py); c.arc(px, py, cell * 0.8, 0, 7);
    }
    c.fill();
  }
  function drawSegs(segs) {
    c.strokeStyle = INK; c.lineCap = 'round';
    for (const g of segs) { c.lineWidth = g.r * 2; c.beginPath(); c.moveTo(g.ax, g.ay); c.lineTo(g.bx, g.by); c.stroke(); }
  }
  function text(str, y, size = 28, alpha = 0.8) {
    c.font = `${size}px Georgia, serif`; c.textAlign = 'center';
    c.fillStyle = `rgba(22,12,6,${alpha})`; c.fillText(str, W / 2, y);
  }

  function draw(time) {
    // lamp-lit paper wall, with a slow flicker
    const flick = 0.97 + 0.03 * Math.sin(time * 7.3) * Math.sin(time * 2.1);
    const g = c.createRadialGradient(W / 2, H * 0.45, 40, W / 2, H * 0.45, W * 0.62);
    g.addColorStop(0, `rgba(${Math.round(250 * flick)},${Math.round(224 * flick)},${Math.round(166 * flick)},1)`);
    g.addColorStop(0.6, '#d9a85e'); g.addColorStop(1, '#6b3d18');
    c.globalAlpha = 1; c.fillStyle = g; c.fillRect(0, 0, W, H);

    const scene = SCENES[s.i];
    if (s.phase === 'title') {
      ground(c);
      text('Lamplight', 120, 64, 0.9);
      text('Put your controllers down and hold up your hands.', 190, 30, 0.85);
      if (s.live && s.supported === false) {
        text('This session has no hand tracking.', 290, 30, 0.9);
        text('Turn on Hand Tracking in your headset settings, then enter VR again.', 330, 22, 0.8);
      } else if (!s.live) {
        text('No headset? Press Space to begin.', 300, 22, 0.6);
      } else {
        text(s.hands >= 2 ? 'Hold still...' : s.hands === 1 ? 'Show your other hand too.' : 'Waiting for your hands...', 300, 24, 0.7);
        for (let h = 0; h < 2; h++) {   // one dot per hand seen
          c.fillStyle = h < s.hands ? INK : 'rgba(22,12,6,0.18)';
          c.beginPath(); c.arc(W / 2 + (h ? 36 : -36), 360, 16, 0, 7); c.fill();
        }
      }
    } else if (s.phase === 'teach') {
      ground(c);
      if (s.cooldown > 0) {
        text(`Saved: ${s.teach}`, 52);
        drawMask(shapes[s.teach][shapes[s.teach].length - 1], W / 2, 240, 240, 'rgba(22,12,6,0.35)');
      } else {
        text(`Teach the theatre a ${s.teach}.`, 46);
        text('Make the shape with your hands, then hold still.', 80, 20, 0.6);
        c.strokeStyle = 'rgba(22,12,6,0.6)'; c.lineWidth = 6; c.lineCap = 'round';
        c.beginPath(); c.arc(W - 60, 60, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp01(s.still / TEACH_HOLD)); c.stroke();
      }
    } else if (s.phase === 'end') {
      ground(c); house(c, 860); mira(c, 800, time);
      text('Home. The lamp can rest.', 200, 40, clamp01(s.t / 2) * 0.85);
    } else {
      const p = s.phase === 'alive' ? clamp01(s.t / ALIVE_TIME) : 0;
      let cr = null;
      if (s.phase === 'alive') {
        const sx = s.snap ? s.snap.cx : W / 2, sy = s.snap ? s.snap.cy : 220;
        cr = scene.creature(p, sx, sy);
        cr[1] += Math.sin(s.t * 9) * 5;
      }
      scene.draw(c, p, time, cr);
      if (s.phase !== 'alive') {
        text(scene.prompt, 46, 28, s.phase === 'intro' ? clamp01(s.t / 1.2) * 0.8 : 0.8);
        // faint hint of the target shape; it darkens as the player gets close,
        // and again when they have been stuck for a while
        const help = s.phase === 'wait' ? ease(ramp(s.stuck, HELP_AFTER, HELP_AFTER + 4)) : 0;
        drawMask(shapes[scene.shape][0], W / 2, 215, 230, `rgba(22,12,6,${0.08 + 0.3 * clamp01(s.hold / MATCH_HOLD) + 0.22 * help})`);
        if (help > 0) text('Follow the dark shape with your hands.', 80, 20, 0.6 * help);
      } else if (s.snap) {
        const k = 1 + (Math.min(1, 110 / s.snap.size) - 1) * ease(ramp(p, 0, 0.25)); // shrink into the story
        c.save(); c.translate(cr[0], cr[1]); c.scale(k, k); c.translate(-s.snap.cx, -s.snap.cy);
        drawSegs(s.snap.segs); c.restore();
      } else {
        drawMask(shapes[scene.shape][0], cr[0], cr[1], 110, INK);
      }
    }
    c.globalAlpha = 0.93; drawSegs(s.segs); c.globalAlpha = 1; // the player's live shadow
  }

  return { update, draw, skip, state: s, threshold: currentThreshold };
}
