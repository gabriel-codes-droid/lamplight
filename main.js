// Room, lamp, hand tracking. Projects each tracked hand joint from the lamp
// onto the wall to get the shadow, and hands that to the theatre.
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';
import { encode, decode } from './matcher.js';
import { createTheatre, SHAPE_NAMES, W, H } from './theatre.js';
import * as SHAPES from './shapes.js';
import { createAddShape } from './addshape.js';
import { animalURL } from './icons.js';
import { createAudio } from './audio.js';
import { createShadow } from './shadow.js';
import { createRecorder, createReplay } from './capture.js';

// ---- layout, in metres. The player sits at the origin facing -Z. ----
const WALL_Z = -1.6, WALL_Y = 1.25, WALL_W = 3.2, WALL_H = 1.6;
const LAMP = new THREE.Vector3(0, 0.9, 0.7);   // low and behind the player
const PPM = W / WALL_W;                        // canvas pixels per metre of wall

const params = new URLSearchParams(location.search);
const threshold = parseFloat(params.get('th')) || 0.55; // ?th=0.5 makes matching easier
const startScene = Math.max(0, (parseInt(params.get('start'), 10) || 1) - 1); // ?start=4 begins at scene 4
const replayFile = params.get('replay');                // ?replay=captures/x.json plays a capture back
const recorder = params.has('capture') ? createRecorder() : null; // ?capture records the hands
const debug = params.has('debug') || !!replayFile || !!recorder;  // on-page readout of the matcher

// ---- shapes: built-in ones, overridden by ones taught on this device ----
// A shape is a list of templates (hex strings). A plain string is accepted too.
// ?record          re-teach every shape, replacing what was saved
// ?record=bird,dog re-teach only those shapes, replacing them
// ?add / ?add=bird teach one more template for every shape / those shapes, keeping the old ones
const STORE = 'lamplight-shapes';
let stored = {};
try { stored = JSON.parse(localStorage.getItem(STORE) || '{}'); } catch (e) { /* storage unavailable */ }
const asList = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : typeof v === 'string' ? [v] : []);
const DEFAULT_SHAPES = SHAPES.DEFAULT_SHAPES;
// creatures the player added: { name: { label, icon } }, from shapes.js and from this device
const CUSTOM_STORE = 'lamplight-custom';
let customStored = {};
try { customStored = JSON.parse(localStorage.getItem(CUSTOM_STORE) || '{}'); } catch (e) { /* storage unavailable */ }
const customMeta = { ...(SHAPES.DEFAULT_CUSTOM || {}), ...customStored };
const names = (key) => {                       // which shapes a ?key or ?key=a,b selects
  if (!params.has(key)) return [];
  const all = [...SHAPE_NAMES, ...Object.keys(customMeta)];
  const list = params.get(key).split(',').map((n) => n.trim()).filter((n) => all.includes(n));
  return list.length ? list : all;
};
const hexShapes = {};
for (const name of new Set([...Object.keys(DEFAULT_SHAPES), ...Object.keys(stored)]))
  hexShapes[name] = asList(name in stored ? stored[name] : DEFAULT_SHAPES[name]);
for (const name of names('record')) hexShapes[name] = [];
const shapes = {};
for (const [name, list] of Object.entries(hexShapes)) shapes[name] = list.map(decode);
const teach = [...new Set([...names('record'), ...names('add')])];

// ---- the page: gesture icons, and a button that shrinks the panel so the wall stays visible ----
const panel = document.getElementById('panel'), toggle = document.getElementById('toggle');
function setMinimised(min) {
  panel.classList.toggle('min', min);
  toggle.textContent = min ? '+' : '−';
  toggle.setAttribute('aria-label', min ? 'Open panel' : 'Minimise panel');
}
toggle.addEventListener('click', () => setMinimised(!panel.classList.contains('min')));
if (debug) setMinimised(true);   // replaying or debugging: keep the wall in view

const exportBox = document.getElementById('export');
function showExport() {
  if (exportBox) exportBox.value = `export const DEFAULT_SHAPES = ${JSON.stringify(hexShapes, null, 2)};\nexport const DEFAULT_CUSTOM = ${JSON.stringify(customMeta, null, 2)};`;
}
showExport();
document.getElementById('copy')?.addEventListener('click', () => {
  exportBox.select(); navigator.clipboard?.writeText(exportBox.value).catch(() => {});
});

// ---- sound: night ambience, a chime, one short sound per creature (see audio.js) ----
const sfx = createAudio();
const wake = sfx.wake;
addEventListener('pointerdown', wake); addEventListener('keydown', wake);

function saveHex(name, mask) {                  // remember a template on this device
  hexShapes[name] = [...(hexShapes[name] || []), encode(mask)]; stored[name] = hexShapes[name].slice();
  try { localStorage.setItem(STORE, JSON.stringify(stored)); } catch (e) { /* storage unavailable */ }
  showExport();
}

// ---- the wall is a canvas ----
const canvas = document.createElement('canvas');
canvas.width = W; canvas.height = H;
const theatre = createTheatre({
  ctx: canvas.getContext('2d'), shapes, custom: customMeta, teach, start: startScene, threshold, sfx,
  onShapeSaved(name, mask) { saveHex(name, mask); },
});

// ---- "Add a shape": camera dialog, saved creatures listed as extra tiles ----
const tilesEl = document.getElementById('tiles');
function renderCustom() {
  for (const el of tilesEl.querySelectorAll('.tile.custom')) el.remove();
  for (const [name, meta] of Object.entries(customMeta)) {
    const tile = document.createElement('div'); tile.className = 'tile custom';
    const pic = meta.icon ? '<img src="' + animalURL(meta.icon) + '" alt="">' : '<span class="letter"></span>';
    tile.innerHTML = '<div class="ico">' + pic + '</div><div><b></b><small>Your gesture</small></div><button class="remove" aria-label="Remove"></button>';
    tile.querySelector('b').textContent = meta.label;
    const letter = tile.querySelector('.letter'); if (letter) letter.textContent = meta.label.charAt(0).toUpperCase();
    tile.querySelector('.remove').textContent = '\u00d7';
    tile.querySelector('.remove').addEventListener('click', () => {
      delete customMeta[name]; delete hexShapes[name]; delete stored[name]; delete customStored[name]; theatre.removeCustom(name);
      try { localStorage.setItem(STORE, JSON.stringify(stored)); localStorage.setItem(CUSTOM_STORE, JSON.stringify(customStored)); } catch (e) { /* storage unavailable */ }
      showExport(); renderCustom();
    });
    tilesEl.appendChild(tile);
  }
}
const addDialog = createAddShape(document.getElementById('add'), {
  existing: () => theatre.shapeNames().filter((n) => shapes[n] && shapes[n].length)
    .map((n) => ({ name: n, label: (customMeta[n] && customMeta[n].label) || n, templates: shapes[n] })),
  save({ name, label, icon, masks, dots }) {
    customMeta[name] = { label, icon, dots }; customStored[name] = customMeta[name];
    try { localStorage.setItem(CUSTOM_STORE, JSON.stringify(customStored)); } catch (e) { /* storage unavailable */ }
    masks.forEach((m, i) => { saveHex(name, m); theatre.addCustom(name, customMeta[name], m); });
    renderCustom();
  },
});
document.getElementById('add-open').addEventListener('click', () => addDialog.open());
renderCustom();

// ---- three.js scene ----
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(devicePixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);
(document.getElementById('enter') || document.body).appendChild(VRButton.createButton(renderer, { optionalFeatures: ['hand-tracking'] })); // styled in index.html
// What the theatre needs to know about the hands (see update() in theatre.js).
const input = { live: false, hands: 0, supported: true };
let xrStart = 0, seenHands = false;
renderer.xr.addEventListener('sessionstart', () => {
  wake();
  const features = renderer.xr.getSession().enabledFeatures;   // missing on some browsers: then we find out below
  input.supported = features ? features.includes('hand-tracking') : null;
  xrStart = performance.now(); seenHands = false;
  try {                                                         // ask for 72 fps, the Quest 3 default we are tuned for
    const session = renderer.xr.getSession();
    if (session.updateTargetFrameRate && session.supportedFrameRates && Array.from(session.supportedFrameRates).includes(72))
      session.updateTargetFrameRate(72).catch(() => {});
  } catch (e) { /* not supported */ }
});

const scene = new THREE.Scene();
// a deep blue Meta-style backdrop instead of flat black
const bgc = document.createElement('canvas'); bgc.width = 4; bgc.height = 256;
{ const g = bgc.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#222a3d'); gr.addColorStop(0.55, '#141a29'); gr.addColorStop(1, '#0b0e16'); g.fillStyle = gr; g.fillRect(0, 0, 4, 256); }
const bgTex = new THREE.CanvasTexture(bgc); bgTex.colorSpace = THREE.SRGBColorSpace;
scene.background = bgTex;
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.05, 20);
camera.position.set(0, 1.15, 0.4); camera.lookAt(0, WALL_Y - 0.1, WALL_Z); // desktop preview view
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const wallTex = new THREE.CanvasTexture(canvas);
wallTex.colorSpace = THREE.SRGBColorSpace;
wallTex.generateMipmaps = false;               // the wall is re-uploaded often: skip rebuilding mipmaps each time
wallTex.minFilter = THREE.LinearFilter;
const wall = new THREE.Mesh(new THREE.PlaneGeometry(WALL_W, WALL_H), new THREE.MeshBasicMaterial({ map: wallTex, transparent: true }));
wall.position.set(0, WALL_Y, WALL_Z);
scene.add(wall);

const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshStandardMaterial({ color: 0x1a100a, roughness: 1 }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffdca0 }));
bulb.position.copy(LAMP);
scene.add(bulb);
const lampLight = new THREE.PointLight(0xffc98a, 3, 8, 1.5);
lampLight.position.copy(LAMP);
scene.add(lampLight, new THREE.HemisphereLight(0x6b4a30, 0x120a06, 0.7));

// ---- hands ----
const factory = new XRHandModelFactory();
const hands = [0, 1].map((i) => {
  const hand = renderer.xr.getHand(i);
  hand.add(factory.createHandModel(hand, 'mesh'));
  scene.add(hand);
  return hand;
});

// ---- shadow: hand joints -> segments on the wall (see shadow.js) ----
const shadow = createShadow({ lamp: LAMP, wallZ: WALL_Z, wallY: WALL_Y, wallW: WALL_W, wallH: WALL_H, ppm: PPM });
const segs = [];

// ---- capture and replay (see capture.js) ----
let replay = null, replayT0 = 0, replayFailed = '';
if (replayFile) {
  fetch(replayFile)
    .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then((data) => { replay = createReplay(data); replayT0 = performance.now(); })
    .catch((e) => { replayFailed = e.message; });
}
const debugEl = document.getElementById('debug'), downloadBtn = document.getElementById('dl');
if (debugEl && debug) debugEl.hidden = false;
if (downloadBtn && recorder) downloadBtn.hidden = false;
downloadBtn?.addEventListener('click', () => recorder.download());
renderer.xr.addEventListener('sessionend', () => { if (recorder) recorder.download(); });

addEventListener('keydown', (e) => {
  if (e.code === 'Space') theatre.skip();
  const n = { Digit1: 0, Digit2: 1, Digit3: 2 }[e.code];            // desktop: 1, 2, 3 bring a bird, dog or rabbit to life
  if (n !== undefined) theatre.tryShape(SHAPE_NAMES[n]);
});

const clock = new THREE.Clock();
let hudAt = 0, hudFrames = 0;
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  const now = clock.elapsedTime;
  if (replay) {                                   // a capture is driving the hands
    replay.step(performance.now() - replayT0);
    input.live = true; input.supported = true;
    input.hands = shadow.collect(replay.hands, segs);
  } else if (replayFile && !replayFailed) {       // still loading it
    input.live = true; input.supported = true; input.hands = 0; segs.length = 0;
  } else if (renderer.xr.isPresenting) {
    input.live = true;
    input.hands = shadow.collect(hands, segs);
    if (recorder) recorder.sample(performance.now(), hands, { phase: theatre.state.phase, shape: theatre.target() });
    if (input.hands > 0) { seenHands = true; input.supported = true; }
    else if (input.supported === null && !seenHands && performance.now() - xrStart > 8000) input.supported = false;
  } else {
    input.live = false; input.hands = 0; segs.length = 0;
  }
  theatre.update(dt, segs, input);
  if (theatre.draw(now)) wallTex.needsUpdate = true;   // only re-upload the wall when it was repainted
  renderer.render(scene, camera);

  hudFrames++;
  if (debugEl && debug && now - hudAt > 0.25) {
    const st = theatre.state;
    debugEl.textContent = [
      `phase ${st.phase}  target ${theatre.target() || '-'}`,
      `score ${st.score.toFixed(2)} at ${st.angle || 0}deg  needs ${theatre.threshold().toFixed(2)}  hold ${st.hold.toFixed(2)}`,
      `hands ${input.hands}  fps ${Math.round(hudFrames / (now - hudAt))}`,
      replayFailed ? `Replay failed: ${replayFailed}` : replayFile && !replay ? 'Loading replay...' : '',
      recorder ? `Recording: ${recorder.count} samples` : '',
    ].filter(Boolean).join('\n');
    hudAt = now; hudFrames = 0;
  }
});
