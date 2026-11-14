// Pictures used by the game, all from the Meta UI kit:
//  - assets/gestures/*.png : the hand gesture for each creature (what the player makes)
//  - assets/icons/*.png    : the animal avatar for each creature (what comes alive)
//  - assets/hands/hand.jpg : the open hand on the title screen (a light outline on black,
//                            turned into a transparent outline when it loads)
// Custom shapes added by the player borrow one of the animal icons, or show a letter.
const loaded = {};                       // key -> HTMLImageElement or canvas, once ready
const listeners = [];
const url = (path) => new URL(path, import.meta.url).href;

export const ANIMALS = ['bird', 'dog', 'rabbit', 'sheep'];
export const GESTURES = ['bird', 'dog', 'rabbit'];
export const animalURL = (name) => url('./assets/icons/' + name + '.png');
export const gestureURL = (name) => url('./assets/gestures/' + name + '.png');

function turnToOutline(im) {             // dark background and fill drop out, the light outline stays
  const cv = document.createElement('canvas');
  cv.width = im.naturalWidth; cv.height = im.naturalHeight;
  const x = cv.getContext('2d');
  x.drawImage(im, 0, 0);
  const d = x.getImageData(0, 0, cv.width, cv.height), p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const lum = Math.max(p[i], p[i + 1], p[i + 2]);
    p[i] = 216; p[i + 1] = 223; p[i + 2] = 232;
    p[i + 3] = Math.max(0, Math.min(255, (lum - 28) * 3.2));
  }
  x.putImageData(d, 0, 0);
  return cv;
}
function load(key, src, convert) {
  if (typeof Image === 'undefined' || typeof document === 'undefined') return;
  const im = new Image();
  im.onload = () => {
    try { loaded[key] = convert ? convert(im) : im; } catch (e) { return; }
    for (const f of listeners) f(key);
  };
  im.src = src;
}
for (const n of ANIMALS) load('animal:' + n, animalURL(n));
for (const n of GESTURES) load('gesture:' + n, gestureURL(n));
load('hand', url('./assets/hands/hand.jpg'), turnToOutline);

// Calls f(key) as each picture becomes ready, and right away for ones that already are.
export function onIcons(f) { listeners.push(f); for (const k in loaded) f(k); }

// custom shapes: name -> one of ANIMALS to borrow (or null for a letter badge)
const borrowed = {};
export function registerCreature(name, animal) { borrowed[name] = animal || null; }
const animalKey = (name) => 'animal:' + (ANIMALS.includes(name) ? name : borrowed[name]);

function fit(c, im, cx, cy, size, flip, alpha) {
  const w0 = im.naturalWidth || im.width, h0 = im.naturalHeight || im.height;
  const k = size / Math.max(w0, h0), w = w0 * k, h = h0 * k;
  c.save();
  c.globalAlpha = alpha;
  c.translate(cx, cy);
  if (flip) c.scale(-1, 1);
  c.drawImage(im, -w / 2, -h / 2, w, h);
  c.restore();
}

// The animal that comes alive, centred on (cx, cy). flip turns it to face the other way.
export function drawAnimal(c, name, cx, cy, size, flip = false, label = '') {
  const im = loaded[animalKey(name)];
  if (im) { fit(c, im, cx, cy, size, flip, 1); return; }
  // no picture (a custom shape without an icon, or not loaded yet): a round badge with a letter
  c.save();
  c.fillStyle = '#414141'; c.beginPath(); c.arc(cx, cy, size * 0.42, 0, 7); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.9)'; c.font = '700 ' + Math.round(size * 0.42) + 'px Inter, system-ui, sans-serif';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText((label || name || '?').charAt(0).toUpperCase(), cx, cy + size * 0.03);
  c.restore();
}
// The hand gesture to make for a creature (built-in creatures only).
export function drawGesture(c, name, cx, cy, size) {
  const im = loaded['gesture:' + name];
  if (im) fit(c, im, cx, cy, size, false, 1);
}
// The open hand on the title screen; alpha dims it until that hand is seen.
export function drawHand(c, cx, cy, size, alpha = 1) {
  const im = loaded.hand;
  if (im) fit(c, im, cx, cy, size, false, alpha);
}
