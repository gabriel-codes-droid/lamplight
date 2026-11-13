// Room, lamp, hand tracking. Projects each tracked hand joint from the lamp
// onto the wall to get the shadow, and hands that to the theatre.
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';
import { encode, decode } from './matcher.js';
import { createTheatre, SHAPE_NAMES, W, H } from './theatre.js';
import { DEFAULT_SHAPES } from './shapes.js';

// ---- layout, in metres. The player sits at the origin facing -Z. ----
const WALL_Z = -1.6, WALL_Y = 1.25, WALL_W = 3.2, WALL_H = 1.6;
const LAMP = new THREE.Vector3(0, 0.9, 0.7);   // low and behind the player
const PPM = W / WALL_W;                        // canvas pixels per metre of wall

const params = new URLSearchParams(location.search);
const threshold = parseFloat(params.get('th')) || 0.55; // ?th=0.5 makes matching easier

// ---- shapes: built-in ones, overridden by ones taught on this device ----
// A shape is a list of templates (hex strings). A plain string is accepted too.
// ?record          re-teach every shape, replacing what was saved
// ?record=bird,dog re-teach only those shapes, replacing them
// ?add / ?add=bird teach one more template for every shape / those shapes, keeping the old ones
const STORE = 'lamplight-shapes';
let stored = {};
try { stored = JSON.parse(localStorage.getItem(STORE) || '{}'); } catch (e) { /* storage unavailable */ }
const asList = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : typeof v === 'string' ? [v] : []);
const names = (key) => {                       // which shapes a ?key or ?key=a,b selects
  if (!params.has(key)) return [];
  const list = params.get(key).split(',').map((n) => n.trim()).filter((n) => SHAPE_NAMES.includes(n));
  return list.length ? list : SHAPE_NAMES;
};
const hexShapes = {};
for (const name of new Set([...Object.keys(DEFAULT_SHAPES), ...Object.keys(stored)]))
  hexShapes[name] = asList(name in stored ? stored[name] : DEFAULT_SHAPES[name]);
for (const name of names('record')) hexShapes[name] = [];
const shapes = {};
for (const [name, list] of Object.entries(hexShapes)) shapes[name] = list.map(decode);
const teach = [...new Set([...names('record'), ...names('add')])];

const exportBox = document.getElementById('export');
function showExport() {
  if (exportBox) exportBox.value = `export const DEFAULT_SHAPES = ${JSON.stringify(hexShapes, null, 2)};`;
}
showExport();
document.getElementById('copy')?.addEventListener('click', () => {
  exportBox.select(); navigator.clipboard?.writeText(exportBox.value).catch(() => {});
});

// ---- sound: a small chime when a shadow comes alive ----
let audio = null;
const wake = () => { try { audio = audio || new AudioContext(); audio.resume(); } catch (e) { /* no audio */ } };
addEventListener('pointerdown', wake); addEventListener('keydown', wake);
const sfx = {
  chime() {
    if (!audio) return;
    [523.25, 659.25, 783.99].forEach((f, i) => {
      const o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime + i * 0.12;
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.18, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
      o.connect(g).connect(audio.destination); o.start(t); o.stop(t + 1);
    });
  },
};

// ---- the wall is a canvas ----
const canvas = document.createElement('canvas');
canvas.width = W; canvas.height = H;
const theatre = createTheatre({
  ctx: canvas.getContext('2d'), shapes, teach, threshold, sfx,
  onShapeSaved(name, mask) {
    hexShapes[name] = [...(hexShapes[name] || []), encode(mask)]; stored[name] = hexShapes[name].slice();
    try { localStorage.setItem(STORE, JSON.stringify(stored)); } catch (e) { /* storage unavailable */ }
    showExport();
  },
});

// ---- three.js scene ----
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(devicePixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer, { optionalFeatures: ['hand-tracking'] }));
// What the theatre needs to know about the hands (see update() in theatre.js).
const input = { live: false, hands: 0, supported: true };
let xrStart = 0, seenHands = false;
renderer.xr.addEventListener('sessionstart', () => {
  wake();
  const features = renderer.xr.getSession().enabledFeatures;   // missing on some browsers: then we find out below
  input.supported = features ? features.includes('hand-tracking') : null;
  xrStart = performance.now(); seenHands = false;
});

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0705);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.05, 20);
camera.position.set(0, 1.15, 0.4); camera.lookAt(0, WALL_Y - 0.1, WALL_Z); // desktop preview view
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const wallTex = new THREE.CanvasTexture(canvas);
wallTex.colorSpace = THREE.SRGBColorSpace;
const wall = new THREE.Mesh(new THREE.PlaneGeometry(WALL_W, WALL_H), new THREE.MeshBasicMaterial({ map: wallTex }));
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

const FINGERS = [
  ['thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip'],
  ...['index', 'middle', 'ring', 'pinky'].map((f) => [
    `${f}-finger-metacarpal`, `${f}-finger-phalanx-proximal`, `${f}-finger-phalanx-intermediate`,
    `${f}-finger-phalanx-distal`, `${f}-finger-tip`]),
];
const KNUCKLES = ['index', 'middle', 'ring', 'pinky'].map((f) => `${f}-finger-phalanx-proximal`);

// Shadow of a point: follow the ray from the lamp through it to the wall.
function project(v) {
  const d = v.z - LAMP.z;
  if (d > -0.05) return null;                  // behind the lamp: no shadow
  const t = (WALL_Z - LAMP.z) / d;
  return {
    x: (LAMP.x + t * (v.x - LAMP.x) + WALL_W / 2) * PPM,
    y: (WALL_Y + WALL_H / 2 - (LAMP.y + t * (v.y - LAMP.y))) * PPM,
    k: t * PPM,                                // metres -> pixels at this depth
  };
}
const segs = [];
function bone(a, b, radius) {
  const pa = project(a), pb = project(b);
  if (pa && pb) segs.push({ ax: pa.x, ay: pa.y, bx: pb.x, by: pb.y, r: radius * (pa.k + pb.k) / 2 });
}
const tmp = new THREE.Vector3();
function collectShadow() {          // returns how many hands are tracked
  segs.length = 0;
  let tracked = 0;
  if (!renderer.xr.isPresenting) return tracked;
  for (const hand of hands) {
    const J = hand.joints, wrist = J && J['wrist'];
    if (!hand.visible || !wrist || wrist.visible === false) continue;
    tracked++;
    for (const chain of FINGERS) {
      let prev = wrist;
      chain.forEach((name, i) => {
        const j = J[name];
        if (!j) return;
        bone(prev.position, j.position, i < 2 ? 0.017 : 0.0095); // thick near the palm
        prev = j;
      });
    }
    for (let i = 0; i < KNUCKLES.length - 1; i++) {
      const a = J[KNUCKLES[i]], b = J[KNUCKLES[i + 1]];
      if (a && b) bone(a.position, b.position, 0.014);
    }
    const mid = J['middle-finger-phalanx-proximal'];           // forearm stub, like a real shadow
    if (mid) {
      tmp.copy(wrist.position).sub(mid.position).normalize().multiplyScalar(0.22).add(wrist.position);
      bone(wrist.position, tmp, 0.027);
    }
  }
  return tracked;
}

addEventListener('keydown', (e) => { if (e.code === 'Space') theatre.skip(); });

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  input.live = renderer.xr.isPresenting;
  input.hands = collectShadow();
  if (input.hands > 0) { seenHands = true; input.supported = true; }
  else if (input.live && input.supported === null && !seenHands && performance.now() - xrStart > 8000) input.supported = false;
  theatre.update(dt, segs, input);
  theatre.draw(clock.elapsedTime);
  wallTex.needsUpdate = true;
  renderer.render(scene, camera);
});
