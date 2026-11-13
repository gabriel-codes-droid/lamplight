// The shadow theatre: game state and all 2D drawing. It only needs a canvas
// 2D context, so it knows nothing about WebXR. main.js feeds it the hand
// shadow segments each frame and puts the canvas on the wall.
import { drawIcon } from './icons.js';
import { N, rasterize, iou, bestMatch, match, variantsOf } from './matcher.js';

export const W = 1024, H = 512;
const INK = '#160c06', PAPER = '#e9c98b', GROUND = 430;
const TEACH_HOLD = 2.5;   // seconds to hold still when teaching a shape
const MATCH_HOLD = 0.6;   // seconds a match must last to count
const TITLE_HOLD = 1;     // seconds both hands must stay tracked on the title scene
const LOST_SHOW = 0.4;    // seconds without any hand before the "bring your hands back" message
const INTRO_TIME = 3.5;   // seconds the prompt is shown before the player is asked to match
const ALIVE_TIME = 7;     // seconds of story animation per scene
// Help when stuck: after HELP_AFTER seconds waiting for a shape the hint darkens, and
// every HELP_EVERY seconds from then on the match threshold drops by HELP_STEP.
const HELP_AFTER = 20, HELP_EVERY = 10, HELP_STEP = 0.03, HELP_FLOOR = 0.3;

// Strings built once, so drawing doesn't create garbage every frame.
const INK_A = Array.from({ length: 33 }, (_, i) => `rgba(22,12,6,${(i / 32).toFixed(3)})`);
const inkA = (a) => INK_A[Math.round(Math.max(0, Math.min(1, a)) * 32)];   // ink at alpha a (steps of 1/32)
const FLICK = Array.from({ length: 8 }, (_, i) => `rgba(255,236,170,${(i * 0.006).toFixed(3)})`);
const UI_FONTS = {};   // Inter, the kit's typeface, for system UI
const uiFont = (size, weight) => UI_FONTS[size + '/' + weight] || (UI_FONTS[size + '/' + weight] = `${weight} ${size}px Inter, system-ui, sans-serif`);
const FONTS = {};
const fontOf = (size) => FONTS[size] || (FONTS[size] = `${size}px Georgia, serif`);
const AMBIENT = 0.05;     // seconds: how often the wall repaints when only slow ambient motion changes

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const ramp = (p, a, b) => clamp01((p - a) / (b - a));
const ease = (t) => t * t * (3 - 2 * t);

const AT = [0, 0]; // along() writes here: read it right away, don't keep it
function along(pts, p) { // pts: [[time, x, y], ...]
  if (p <= pts[0][0]) { AT[0] = pts[0][1]; AT[1] = pts[0][2]; return AT; }
  for (let i = 1; i < pts.length; i++) {
    if (p <= pts[i][0]) {
      const a = pts[i - 1], b = pts[i];
      const k = ease((p - a[0]) / (b[0] - a[0]));
      AT[0] = a[1] + (b[1] - a[1]) * k; AT[1] = a[2] + (b[2] - a[2]) * k;
      return AT;
    }
  }
  const l = pts[pts.length - 1];
  AT[0] = l[1]; AT[1] = l[2];
  return AT;
}
// A creature path: the first point is wherever the player's shadow was, the rest are fixed.
function flight(pts) {
  return (p, sx, sy) => { pts[0][1] = sx; pts[0][2] = sy; return along(pts, p); };
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

function moon(c) {
  c.strokeStyle = INK; c.lineWidth = 9; c.lineCap = 'round';
  c.beginPath(); c.arc(930, 110, 24, Math.PI * 0.7, Math.PI * 1.8); c.stroke();
}
function pine(c, x, h) {
  c.fillStyle = INK;
  c.fillRect(x - 5, GROUND - h * 0.2, 10, h * 0.22);
  for (let i = 0; i < 3; i++) {
    const w = h * 0.3 * (1 - i * 0.2), base = GROUND - h * 0.14 - i * h * 0.26;
    c.beginPath(); c.moveTo(x - w, base); c.lineTo(x, base - h * 0.42); c.lineTo(x + w, base); c.fill();
  }
}
function bareTree(c, x) {       // trunk with one long branch to the right
  c.fillStyle = INK; c.fillRect(x - 8, GROUND - 240, 16, 242);
  c.strokeStyle = INK; c.lineWidth = 8; c.lineCap = 'round';
  c.beginPath(); c.moveTo(x, GROUND - 180); c.quadraticCurveTo(x + 50, GROUND - 235, x + 120, GROUND - 222); c.stroke();
}
function lantern(c, x, y, glow, chain) { // x, y = centre of the glass
  if (chain) { c.strokeStyle = INK; c.lineWidth = 3; c.lineCap = 'round'; c.beginPath(); c.moveTo(x, y - 36); c.lineTo(x, y - 14); c.stroke(); }
  c.fillStyle = INK; c.fillRect(x - 11, y - 14, 22, 5); c.fillRect(x - 11, y + 9, 22, 5);
  c.fillStyle = glow ? '#ffdf9a' : PAPER; c.fillRect(x - 8, y - 9, 16, 18);
  c.fillStyle = INK; c.fillRect(x - 1, y - 9, 2, 18);
}
function sheep(c, x, y) {       // faces right; y is where the hooves touch
  c.fillStyle = INK;
  c.beginPath(); c.ellipse(x, y - 26, 25, 18, 0, 0, 7); c.fill();                 // fleece
  c.beginPath(); c.arc(x + 27, y - 32, 9, 0, 7); c.fill();                        // head
  c.beginPath(); c.moveTo(x + 24, y - 38); c.lineTo(x + 18, y - 48); c.lineTo(x + 31, y - 40); c.fill(); // ear
  c.fillRect(x - 14, y - 12, 5, 13); c.fillRect(x + 9, y - 12, 5, 13);
}
function pen(c, x0, x1) {
  c.fillStyle = INK;
  c.fillRect(x0, GROUND - 56, x1 - x0, 5); c.fillRect(x0, GROUND - 28, x1 - x0, 5);
  for (let x = x0; x <= x1; x += 68) c.fillRect(x - 4, GROUND - 68, 8, 70);
}
function rails(c, x0, x1) {
  c.fillStyle = INK;
  c.fillRect(x0, GROUND - 78, x1 - x0, 5); c.fillRect(x0, GROUND - 42, x1 - x0, 5);
  for (let x = x0; x <= x1; x += 56) c.fillRect(x - 4, GROUND - 90, 8, 92);
}
function gate(c, open, lift) {   // hinged at x = 527; open 0..1 swings it away, lift 0..1 raises the latch
  c.fillStyle = INK;
  c.fillRect(515, GROUND - 112, 12, 114); c.fillRect(644, GROUND - 112, 12, 114); // posts
  c.save(); c.translate(527, 0); c.scale(1 - 0.85 * open, 1); c.translate(-527, 0);
  c.fillRect(527, GROUND - 92, 117, 5); c.fillRect(527, GROUND - 40, 117, 5);
  for (let x = 533; x <= 640; x += 15) c.fillRect(x - 2, GROUND - 96, 4, 96);
  c.restore();
  c.save(); c.translate(644, GROUND - 66); c.rotate(-1.1 * lift); c.fillRect(-22, -3, 24, 6); c.restore(); // latch
}

// ---------- the story ----------
// creature(p, sx, sy): where the living shadow is, p = 0..1 through the scene.
// draw(c, p, time, cr): backdrop and actors; cr is the creature position or null.
const SHEEP_FROM = [430, 500, 575, 650], SHEEP_TO = [835, 878, 921, 964];
const dogRun = flight([[0, 0, 0], [0.4, 540, 385], [1, 600, 385]]);
const SCENES = [
  {
    shape: 'bird', alive: 11,
    prompt: 'Mira dropped her key across the river. Make a bird.',
    caption: 'The little bird drops the key into Mira\'s hands.',
    creature: flight([[0, 0, 0], [0.35, 800, 380], [0.8, 215, 360], [1, 420, -120]]),
    draw(c, p, time, cr) {
      ground(c); river(c, time); mira(c, 170, time);
      if (p < 0.35 || !cr) key(c, 800, GROUND - 14);
      else if (p < 0.8) key(c, cr[0] - 10, cr[1] + 42);
      else key(c, 196, GROUND - 30);
    },
  },
  {
    shape: 'dog', alive: 11,
    prompt: 'A wolf blocks the path. Make a dog to chase it off.',
    caption: 'The wolf has never met a dog so brave.',
    creature: (p, sx, sy) => {
      const r = dogRun(p, sx, sy);
      if (p > 0.4 && p < 0.65) r[0] += Math.sin(p * 220) * 7; // barking
      return r;
    },
    draw(c, p, time) {
      ground(c);
      mira(c, 170 + ease(ramp(p, 0.65, 1)) * 150, time);
      wolf(c, 760 + ease(ramp(p, 0.45, 1)) * 520);
    },
  },
  {
    shape: 'bird', alive: 14,
    prompt: 'Night in the pines. A lantern hangs too high. Make a bird.',
    caption: 'The lantern swings down. The pines hold their breath.',
    creature: flight([[0, 0, 0], [0.4, 722, 192], [0.85, 252, 330], [1, 330, -120]]),
    draw(c, p, time, cr) {
      ground(c); moon(c);
      pine(c, 400, 250); pine(c, 470, 300); pine(c, 880, 280); pine(c, 960, 220);
      bareTree(c, 600); mira(c, 170, time);
      if (p < 0.4 || !cr) lantern(c, 722, 258, true, true);       // still on the branch
      else if (p < 0.85) lantern(c, cr[0], cr[1] + 80, true, true); // carried
      else {                                                         // in Mira's hand, glowing
        c.fillStyle = 'rgba(255,238,180,0.5)'; c.beginPath(); c.arc(206, GROUND - 40, 90 * ease(ramp(p, 0.85, 1)), 0, 7); c.fill();
        lantern(c, 206, GROUND - 40, true, false);
      }
    },
  },
  {
    shape: 'dog', alive: 14,
    prompt: 'Sheep crowd the lane. Make a dog to herd them to the pen.',
    caption: 'Round they go, the whole woolly flock.',
    creature: flight([[0, 0, 0], [0.25, 330, 388], [0.55, 560, 388], [0.85, 720, 388], [1, 760, 388]]),
    draw(c, p, time) {
      ground(c); mira(c, 170, time); pen(c, 795, 1000);
      for (let i = 0; i < 4; i++) {
        const k = ease(ramp(p, 0.3 + i * 0.06, 0.78 + i * 0.04));
        const hop = k > 0 && k < 1 ? Math.abs(Math.sin(time * 9 + i * 1.7)) * 8 : 0;
        sheep(c, SHEEP_FROM[i] + (SHEEP_TO[i] - SHEEP_FROM[i]) * k, GROUND - hop);
      }
    },
  },
  {
    shape: 'rabbit', alive: 14,
    prompt: 'The gate is latched from the far side. Make a rabbit.',
    caption: 'The latch lifts and the gate sighs open.',
    creature: flight([[0, 0, 0], [0.3, 440, 395], [0.55, 585, 396], [0.72, 668, 342], [0.8, 670, 342], [1, 700, 396]]),
    draw(c, p, time) {
      ground(c); rails(c, 330, 515); rails(c, 656, 780);
      gate(c, ease(ramp(p, 0.8, 0.95)), ease(ramp(p, 0.74, 0.8)));
      mira(c, 170 + ease(ramp(p, 0.85, 1)) * 560, time);
    },
  },
  {
    shape: 'rabbit', alive: 11,
    prompt: 'A wall stands before home. Make a rabbit to dig under it.',
    caption: 'Under the wall and out of the dark.',
    creature: flight([[0, 0, 0], [0.35, 455, 395], [0.6, 520, 425], [0.8, 610, 395], [1, 640, 395]]),
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
export function createTheatre({ ctx, shapes, teach = [], start = 0, threshold = 0.55, onShapeSaved = () => {}, sfx = {} }) {
  const c = ctx;
  const has = (n) => !!(shapes[n] && shapes[n].length);
  for (const n of SHAPE_NAMES) if (shapes[n]) for (const m of shapes[n]) variantsOf(m); // build tilted copies now, not mid-game
  const maskBuf = new Uint8Array(N * N), refBuf = new Uint8Array(N * N);
  const bgGrad = c.createRadialGradient(W / 2, H * 0.45, 40, W / 2, H * 0.45, W * 0.62);
  bgGrad.addColorStop(0, 'rgb(246,220,163)'); bgGrad.addColorStop(0.6, '#d9a85e'); bgGrad.addColorStop(1, '#6b3d18');
  const s = { phase: 'title', hasRef: false, teachLine: '', savedLine: '', i: 0, t: 0, hold: 0, stuck: 0, callAgain: false, titleHold: 0, live: false, hands: 0, supported: true, lost: 0, still: 0, cooldown: 0, teach: null,
              ref: null, clock: 0, mask: null, score: 0, snap: null, segs: [] };
  const toTeach = teach.slice();

  function begin() {
    const missing = toTeach.shift() || SHAPE_NAMES.find((n) => !has(n));
    if (missing) Object.assign(s, { phase: 'teach', teach: missing, t: 0, still: 0, hasRef: false, cooldown: 0,
      teachLine: `Teach the theatre a ${missing}.`, savedLine: `Saved: ${missing}` });
    else startScene(Math.min(start, SCENES.length - 1));
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
    sfx.creature && sfx.creature(SCENES[s.i].shape);
    s.callAgain = false;
  }
  function saveTeach(mask, persist) {
    const saved = mask.slice();
    (shapes[s.teach] || (shapes[s.teach] = [])).push(saved);
    variantsOf(saved);
    if (persist) onShapeSaved(s.teach, saved);
    s.cooldown = 2.5; s.still = 0; s.hasRef = false;
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
    // Tracking loss: with no hand in view the hold, teach and stuck timers stand still
    // (the story animation carries on), and the wall asks for the hands back.
    s.lost = s.live && s.hands === 0 ? s.lost + dt : 0;
    const needsHands = s.phase === 'wait' || s.phase === 'intro' || (s.phase === 'teach' && s.cooldown <= 0);
    const paused = needsHands && s.lost > 0;
    if (s.phase === 'teach' && s.cooldown > 0) { s.cooldown -= dt; if (s.cooldown <= 0) begin(); return; }
    if (s.phase === 'intro' && s.t > INTRO_TIME) { s.phase = 'wait'; s.t = 0; }
    if (s.phase === 'alive' && s.t > (SCENES[s.i].alive || ALIVE_TIME)) { s.i + 1 < SCENES.length ? startScene(s.i + 1) : Object.assign(s, { phase: 'end', t: 0 }); }
    if (s.phase === 'alive' && !s.callAgain && s.t > (SCENES[s.i].alive || ALIVE_TIME) * 0.55) { // the creature calls once more
      s.callAgain = true; sfx.creature && sfx.creature(SCENES[s.i].shape);
    }
    if (s.phase === 'end' && s.t > 8) startScene(0);
    if (s.clock < 0.06) return;          // match about 16 times a second
    const el = s.clock; s.clock = 0;
    s.mask = rasterize(segs, maskBuf);   // null when there is no shadow; otherwise maskBuf, reused
    if (paused) return;
    if (s.phase === 'teach') {
      if (!s.mask) { s.hasRef = false; s.still = 0; }
      else if (!s.hasRef || iou(s.mask, refBuf) < 0.78) { refBuf.set(s.mask); s.hasRef = true; s.still = 0; }
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
    for (let i = 0; i < segs.length; i++) { const g = segs[i]; c.lineWidth = g.r * 2; c.beginPath(); c.moveTo(g.ax, g.ay); c.lineTo(g.bx, g.by); c.stroke(); }
  }
  // System UI on the wall, in the Meta RLDS dark theme: panels are a #414141 -> #272727
  // gradient with a 28 radius and a soft beveled edge; text is white at 90% / 70%.
  const panelGrad = (y0, y1) => { const g = c.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, 'rgba(65,65,65,0.96)'); g.addColorStop(1, 'rgba(39,39,39,0.96)'); return g; };
  const TITLE_GRAD = panelGrad(44, 400), CHIP_GRAD = panelGrad(92, 208), TOAST_GRAD = panelGrad(H / 2 - 70, H / 2 + 70);
  function glass(x, y, w, h, r, grad) {
    c.fillStyle = grad; c.beginPath();
    if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h);
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.14)'; c.lineWidth = 2; c.stroke();   // beveled edge
  }
  // A round chip with the gesture to make, top left of the wall.
  function gestureChip(name) {
    c.fillStyle = CHIP_GRAD; c.beginPath(); c.arc(96, 150, 58, 0, 7); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.14)'; c.lineWidth = 2; c.stroke();
    drawIcon(c, name, 96, 150, 96);
  }
  function textOn(str, y, size, color, weight = 500) {
    c.font = uiFont(size, weight); c.textAlign = 'center'; c.fillStyle = color; c.fillText(str, W / 2, y);
  }
  function text(str, y, size = 28, alpha = 0.8) {
    c.font = fontOf(size); c.textAlign = 'center';
    c.fillStyle = inkA(alpha); c.fillText(str, W / 2, y);
  }

  // A number that changes whenever something on the wall changes other than slow
  // ambient motion and the player's shadow: the phase and the quantised progress bars.
  const PHASES = ['title', 'teach', 'intro', 'wait', 'alive', 'end'];
  let lastSig = NaN, lastPaint = -1;
  function signature() {
    let h = PHASES.indexOf(s.phase) * 1009 + s.i * 101 + s.hands * 11 + (s.supported === null ? 2 : s.supported ? 1 : 0);
    h = h * 31 + Math.round(s.hold * 30);
    h = h * 31 + Math.round(s.still * 10);
    h = h * 31 + Math.round(s.titleHold * 10);
    h = h * 31 + Math.round(ease(ramp(s.stuck, HELP_AFTER, HELP_AFTER + 4)) * 40);
    h = h * 31 + (s.lost > LOST_SHOW ? 1 : 0) + (s.cooldown > 0 ? 2 : 0) + (s.live ? 4 : 0);
    return h | 0;
  }

  // Has the player's shadow moved on the wall? Hand tracking always jitters a little,
  // so only a move of about a pixel counts. painted[] holds what is on the wall now.
  const MOVED = 0.75;
  const painted = new Float32Array(1280);   // room for 256 segments
  let paintedCount = 0;
  function shadowMoved() {
    const segs = s.segs;
    if (segs.length !== paintedCount || segs.length * 5 > painted.length) return true;
    for (let i = 0, k = 0; i < segs.length; i++, k += 5) {
      const g = segs[i];
      if (Math.abs(g.ax - painted[k]) > MOVED || Math.abs(g.ay - painted[k + 1]) > MOVED ||
          Math.abs(g.bx - painted[k + 2]) > MOVED || Math.abs(g.by - painted[k + 3]) > MOVED ||
          Math.abs(g.r - painted[k + 4]) > MOVED / 2) return true;
    }
    return false;
  }
  function rememberShadow() {
    const segs = s.segs;
    paintedCount = segs.length;
    if (segs.length * 5 > painted.length) return;
    for (let i = 0, k = 0; i < segs.length; i++, k += 5) {
      const g = segs[i];
      painted[k] = g.ax; painted[k + 1] = g.ay; painted[k + 2] = g.bx; painted[k + 3] = g.by; painted[k + 4] = g.r;
    }
  }

  // Paints the wall if anything changed since last time. Returns true if it did, so
  // the caller only re-uploads the texture then.
  function draw(time) {
    const sig = signature();
    const animating = s.phase === 'alive' || s.phase === 'intro' || s.phase === 'end';
    if (!animating && sig === lastSig && time - lastPaint < AMBIENT && !shadowMoved()) return false;
    lastSig = sig; lastPaint = time; rememberShadow();
    paint(time);
    return true;
  }

  function paint(time) {
    // lamp-lit paper wall, with a slow flicker
    c.globalAlpha = 1; c.fillStyle = bgGrad; c.fillRect(0, 0, W, H);
    c.fillStyle = FLICK[Math.round((1 + Math.sin(time * 7.3) * Math.sin(time * 2.1)) * 3.5)]; c.fillRect(0, 0, W, H);

    const scene = SCENES[s.i];
    if (s.phase === 'title') {
      ground(c);
      glass(112, 44, 800, 356, 28, TITLE_GRAD);
      textOn('Lamplight', 136, 56, 'rgba(255,255,255,0.9)', 700);
      textOn('Put your controllers down and hold up your hands.', 200, 28, 'rgba(255,255,255,0.9)');
      if (s.live && s.supported === false) {
        textOn('This session has no hand tracking.', 280, 28, '#f7818c', 700);
        textOn('Turn on Hand Tracking in your headset settings, then enter VR again.', 326, 22, 'rgba(255,255,255,0.7)');
      } else if (!s.live) {
        textOn('No headset? Press Space to begin.', 300, 22, 'rgba(255,255,255,0.7)');
      } else {
        textOn(s.hands >= 2 ? 'Hold still...' : s.hands === 1 ? 'Show your other hand too.' : 'Waiting for your hands...', 290, 24, 'rgba(255,255,255,0.7)');
        for (let h = 0; h < 2; h++) {   // one hand icon per hand seen, lit blue when tracked
          const on = h < s.hands;
          drawIcon(c, 'hand', W / 2 + (h ? 56 : -56), 342, 78, on ? '#ffffff' : '#747474', on ? '#148bfd' : '#5a5a5a');
        }
      }
    } else if (s.phase === 'teach') {
      ground(c);
      if (s.cooldown > 0) {
        text(s.savedLine, 52);
        drawMask(shapes[s.teach][shapes[s.teach].length - 1], W / 2, 240, 240, 'rgba(22,12,6,0.35)');
      } else {
        text(s.teachLine, 46);
        text('Make the shape with your hands, then hold still.', 80, 20, 0.6);
        c.strokeStyle = 'rgba(22,12,6,0.6)'; c.lineWidth = 6; c.lineCap = 'round';
        c.beginPath(); c.arc(W - 60, 60, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp01(s.still / TEACH_HOLD)); c.stroke();
        gestureChip(s.teach);
      }
    } else if (s.phase === 'end') {
      ground(c); house(c, 860); mira(c, 800, time);
      text('Home. The lamp can rest.', 200, 40, clamp01(s.t / 2) * 0.85);
    } else {
      const dur = scene.alive || ALIVE_TIME;
      const p = s.phase === 'alive' ? clamp01(s.t / dur) : 0;
      let cr = null;
      if (s.phase === 'alive') {
        const sx = s.snap ? s.snap.cx : W / 2, sy = s.snap ? s.snap.cy : 220;
        cr = scene.creature(p, sx, sy);
        cr[1] += Math.sin(s.t * 9) * 5;
      }
      scene.draw(c, p, time, cr);
      if (s.phase === 'alive') text(scene.caption, 46, 28, 0.85 * Math.min(ramp(s.t, 0, 0.8), ramp(dur - s.t, 0, 0.8)));
      if (s.phase !== 'alive') {
        text(scene.prompt, 46, 28, s.phase === 'intro' ? clamp01(s.t / 1.2) * 0.8 : 0.8);
        // faint hint of the target shape; it darkens as the player gets close,
        // and again when they have been stuck for a while
        const help = s.phase === 'wait' ? ease(ramp(s.stuck, HELP_AFTER, HELP_AFTER + 4)) : 0;
        drawMask(shapes[scene.shape][0], W / 2, 215, 230, inkA(0.08 + 0.3 * clamp01(s.hold / MATCH_HOLD) + 0.22 * help));
        if (help > 0) text('Follow the dark shape with your hands.', 80, 20, 0.6 * help);
        gestureChip(scene.shape);
      } else if (s.snap) {
        const k = 1 + (Math.min(1, 110 / s.snap.size) - 1) * ease(ramp(p, 0, 0.25)); // shrink into the story
        c.save(); c.translate(cr[0], cr[1]); c.scale(k, k); c.translate(-s.snap.cx, -s.snap.cy);
        drawSegs(s.snap.segs); c.restore();
      } else {
        drawMask(shapes[scene.shape][0], cr[0], cr[1], 110, INK);
      }
    }
    if (s.lost > LOST_SHOW && (s.phase === 'wait' || s.phase === 'intro' || (s.phase === 'teach' && s.cooldown <= 0))) {
      c.fillStyle = 'rgba(11,7,5,0.4)'; c.fillRect(0, 0, W, H);
      glass(172, H / 2 - 70, 680, 140, 28, TOAST_GRAD);
      textOn('Bring your hands back into view', H / 2 + 14, 36, 'rgba(255,255,255,0.9)', 700);
    }
    c.globalAlpha = 0.93; drawSegs(s.segs); c.globalAlpha = 1; // the player's live shadow
  }

  // What the player is being asked to make right now (null on the title and end screens).
  function target() {
    if (s.phase === 'teach') return s.teach;
    return s.phase === 'intro' || s.phase === 'wait' || s.phase === 'alive' ? SCENES[s.i].shape : null;
  }
  return { update, draw, skip, target, state: s, threshold: currentThreshold };
}
