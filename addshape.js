// "Add a shape": the player makes a new gesture in front of the camera, the game
// saves it as a new creature, and refuses a gesture that is too close to one it
// already has. Hand tracking comes from MediaPipe Hands, loaded on demand from a CDN
// (nothing is loaded, and the camera is never opened, until the player opens this).
// Everything stays in the browser: video frames are never sent anywhere.
import { rasterize, bestMatch, iou, N } from './matcher.js';
import { ANIMALS, animalURL } from './icons.js';

const MP_VERSION = '0.10.14';
const MP_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@' + MP_VERSION;
const MP_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const HOLD = 2.5;          // seconds the gesture has to stay still
// ?same=0.75 changes how alike two gestures must be to count as the same
const SAME = parseFloat(new URLSearchParams(globalThis.location ? globalThis.location.search : '').get('same')) || 0.7;          // a new gesture scoring this against an existing one is "the same gesture"

// MediaPipe's 21 hand landmarks: 0 wrist, 1-4 thumb, 5-8 index, 9-12 middle, 13-16 ring, 17-20 little finger.
export const EDGES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [9, 10], [10, 11], [11, 12],
  [13, 14], [14, 15], [15, 16], [0, 17], [17, 18], [18, 19], [19, 20], [5, 9], [9, 13], [13, 17], [0, 9]];
// bone thickness as a fraction of the palm length (wrist to middle knuckle), like the shadow the lamp throws in the headset
const THICK = { 1: 0.19, 2: 0.17, 3: 0.12, 4: 0.105, 5: 0.19, 6: 0.17, 7: 0.115, 8: 0.105, 9: 0.17, 10: 0.115, 11: 0.105, 12: 0.105,
  13: 0.17, 14: 0.115, 15: 0.105, 16: 0.105, 17: 0.17, 18: 0.115, 19: 0.105, 20: 0.105 };

// Turn camera landmarks into the same kind of thick line segments the lamp's shadow gives the game.
// The camera sees the player from the front; the lamp is behind the player, so x is mirrored.
export function landmarksToSegs(hands, vw, vh) {
  const segs = [];
  for (const L of hands) {
    const P = L.map((p) => [(1 - p.x) * vw, p.y * vh]);
    const span = Math.hypot(P[0][0] - P[9][0], P[0][1] - P[9][1]) || 1;
    for (const [a, b] of EDGES) {
      const r = (THICK[b] || 0.15) * span;
      segs.push({ ax: P[a][0], ay: P[a][1], bx: P[b][0], by: P[b][1], r });
    }
    const dx = P[0][0] - P[9][0], dy = P[0][1] - P[9][1], len = Math.hypot(dx, dy) || 1;   // forearm stub
    segs.push({ ax: P[0][0], ay: P[0][1], bx: P[0][0] + dx / len * span * 2.4, by: P[0][1] + dy / len * span * 2.4, r: span * 0.3 });
  }
  return segs;
}

// Is this mask too close to a gesture the game already has? existing: [{ name, label, templates: [mask] }]
export function findSimilar(mask, existing) {
  let best = null, bestScore = 0;
  for (const e of existing) {
    const sc = bestMatch(mask, e.templates);
    if (sc > bestScore) { bestScore = sc; best = e; }
  }
  return bestScore >= SAME ? { ...best, score: bestScore } : null;
}

export const slugify = (label) => label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 20);

// root: the modal element; api: { existing(): [{name,label,templates}], save({name,label,icon,mask}) }
export function createAddShape(root, api) {
  const $ = (sel) => root.querySelector(sel);
  const steps = { form: $('[data-step="form"]'), camera: $('[data-step="camera"]') };
  const nameInput = $('#add-name'), status = $('#add-status'), video = $('#add-video'), overlay = $('#add-overlay'), bar = $('#add-bar');
  const iconRow = $('#add-icons'), formMsg = $('#add-form-msg');
  let stream = null, landmarker = null, raf = 0, icon = null, label = '', name = '', refMask = null, still = 0, lastT = 0, busy = false;
  const buf = new Uint8Array(N * N), ref = new Uint8Array(N * N);

  // icon choices: the kit's animals, or just a letter
  iconRow.innerHTML = ANIMALS.map((a) => `<label><input type="radio" name="add-icon" value="${a}"><img src="${animalURL(a)}" alt="${a}"></label>`).join('') +
    '<label><input type="radio" name="add-icon" value="" checked><span>Aa</span></label>';

  const show = (step) => { for (const k in steps) steps[k].hidden = k !== step; };
  const say = (msg, kind = '') => { status.textContent = msg; status.dataset.kind = kind; };

  function open() { root.hidden = false; show('form'); formMsg.textContent = ''; nameInput.value = ''; nameInput.focus(); }
  function close() {
    cancelAnimationFrame(raf); raf = 0;
    if (stream) { for (const t of stream.getTracks()) t.stop(); stream = null; }
    video.srcObject = null; root.hidden = true;
  }

  async function ensureLandmarker() {
    if (landmarker) return landmarker;
    const { FilesetResolver, HandLandmarker } = await import(MP_BASE + '/vision_bundle.mjs');
    const vision = await FilesetResolver.forVisionTasks(MP_BASE + '/wasm');
    landmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MP_MODEL, delegate: 'GPU' }, runningMode: 'VIDEO', numHands: 2,
    });
    return landmarker;
  }

  async function next() {                      // form -> camera
    label = nameInput.value.trim();
    name = slugify(label);
    if (!name) { formMsg.textContent = 'Give your shape a name.'; return; }
    if (api.existing().some((e) => e.name === name || e.label.toLowerCase() === label.toLowerCase())) {
      formMsg.textContent = 'A shape called "' + label + '" already exists. Pick another name.'; return;
    }
    icon = (root.querySelector('input[name="add-icon"]:checked') || {}).value || null;
    show('camera'); say('Starting the camera...');
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false });
      video.srcObject = stream; await video.play();
      say('Loading hand tracking (about 8 MB, first time only)...');
      await ensureLandmarker();
    } catch (e) {
      say(e && e.name === 'NotAllowedError' ? 'Camera access was blocked. Allow the camera in your browser and try again.'
        : 'Could not start the camera or hand tracking: ' + (e && e.message ? e.message : e), 'error');
      return;
    }
    still = 0; refMask = null; lastT = performance.now();
    say('Make your gesture in front of the camera and hold still.');
    loop();
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    if (video.readyState < 2 || busy) return;
    const now = performance.now(), dt = Math.min(0.2, (now - lastT) / 1000); lastT = now;
    const res = landmarker.detectForVideo(video, now);
    const hands = res && res.landmarks ? res.landmarks : [];
    // draw what the camera sees, so the player knows they are tracked
    overlay.width = video.videoWidth; overlay.height = video.videoHeight;
    const g = overlay.getContext('2d'); g.clearRect(0, 0, overlay.width, overlay.height);
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 3; g.lineCap = 'round';
    for (const L of hands) {
      g.beginPath();
      for (const [a, b] of EDGES) { g.moveTo(L[a].x * overlay.width, L[a].y * overlay.height); g.lineTo(L[b].x * overlay.width, L[b].y * overlay.height); }
      g.stroke();
      g.fillStyle = '#148bfd';
      for (const p of L) { g.beginPath(); g.arc(p.x * overlay.width, p.y * overlay.height, 4, 0, 7); g.fill(); }
    }
    if (!hands.length) { still = 0; refMask = null; bar.value = 0; say('Show your hand to the camera.'); return; }
    const mask = rasterize(landmarksToSegs(hands, video.videoWidth, video.videoHeight), buf);
    if (!mask) return;
    if (!refMask || iou(mask, ref) < 0.78) { ref.set(mask); refMask = true; still = 0; bar.value = 0; say('Hold still...'); return; }
    still += dt; bar.value = Math.min(1, still / HOLD);
    if (still >= HOLD) capture(mask.slice());
  }

  async function capture(mask) {
    busy = true;
    const twin = findSimilar(mask, api.existing());
    if (twin) {                                // already have this gesture: ask for a different one
      say('That gesture is too close to "' + twin.label + '". Make a different gesture.', 'error');
      still = 0; refMask = null; bar.value = 0; setTimeout(() => { busy = false; }, 1800); return;
    }
    api.save({ name, label, icon, mask });
    say('Saved "' + label + '". It is now part of the game.', 'ok');
    cancelAnimationFrame(raf); raf = 0;
    setTimeout(close, 1400);
  }

  $('#add-next').addEventListener('click', next);
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); next(); } });
  for (const b of root.querySelectorAll('[data-close]')) b.addEventListener('click', close);
  root.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  return { open, close };
}
