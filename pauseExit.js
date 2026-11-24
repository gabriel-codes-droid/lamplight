// Pause and exit, hands only. In VR a card (styled like the page's panel) floats in front of
// you with Resume / Exit VR; poke a button with your index finger and hold it briefly.
// On a desktop the same card is the #pause dialog in index.html (blurred page behind it).
//
// Pauses when: you poke the small Pause button, your hands rest low for a while, your hands
// are lost for a while, or (desktop) you press P or Esc.
import * as THREE from 'three';

const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const FONT = 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

function rrect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// A canvas texture that repaints once the Inter font has loaded, so the text matches the page.
function makeTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const paint = () => { const g = c.getContext('2d'); g.clearRect(0, 0, w, h); draw(g, w, h); tex.needsUpdate = true; };
  paint();
  if (document.fonts && document.fonts.load) {
    Promise.all([document.fonts.load('700 30px Inter'), document.fonts.load('500 30px Inter')]).then(paint).catch(() => {});
  }
  return tex;
}

const setSpacing = (g, v) => { if ('letterSpacing' in g) g.letterSpacing = v; };

// Panel: gradient #414141 -> #272727, soft bevel, 28px corner radius (drawn at 2x).
function drawCard(g, w, h, title, subtitle) {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, 'rgba(65,65,65,0.97)'); gr.addColorStop(1, 'rgba(39,39,39,0.97)');
  rrect(g, 2, 2, w - 4, h - 4, 56); g.fillStyle = gr; g.fill();
  rrect(g, 3, 3, w - 6, h - 6, 55); g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,0.10)'; g.stroke();
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.fillStyle = 'rgba(255,255,255,0.90)'; g.font = '700 54px ' + FONT; setSpacing(g, '-1px');
  g.fillText(title, 60, 112); setSpacing(g, '0px');
  g.fillStyle = 'rgba(255,255,255,0.70)'; g.font = '500 30px ' + FONT;
  g.fillText(subtitle, 60, 164);
}
// Primary button: fill #ffffffe5, label #272727, pill.  Secondary: fill 10% white, label #f2f2f2.
function drawButton(g, w, h, text, primary) {
  rrect(g, 0, 0, w, h, h / 2);
  g.fillStyle = primary ? 'rgba(255,255,255,0.90)' : 'rgba(255,255,255,0.14)'; g.fill();
  g.fillStyle = primary ? '#272727' : '#f2f2f2';
  g.font = '700 32px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 2);
}
function drawPauseChip(g, w, h) {
  rrect(g, 0, 0, w, h, h / 2); g.fillStyle = 'rgba(255,255,255,0.18)'; g.fill();
  g.fillStyle = '#f2f2f2';
  rrect(g, 52, 32, 12, 40, 4); g.fill(); rrect(g, 76, 32, 12, 40, 4); g.fill();   // pause icon
  g.font = '700 38px ' + FONT; g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillText('Pause', 112, h / 2 + 2);
}

export function createPauseExit({
  renderer,
  scene,
  onPause = () => {},
  onResume = () => {},
  lostMs = 2500,        // no tracked hands this long -> pause
  restMs = 2000,        // hands resting low this long -> pause
  restDrop = 0.45,      // metres below the head that count as "hands down"
  pressSeconds = 0.4,   // hold a fingertip on a button this long to press it
  pauseButton = true,   // small poke-able Pause button in VR
  pauseButtonPos = new THREE.Vector3(-0.5, 0.85, -0.45),  // where it floats (metres, floor origin)
  fadeSeconds = 0.25,
  dimOpacity = 0.55,    // same darkness as the page's modal backdrop
  title = 'Paused',
  subtitle = 'Your story is waiting',
} = {}) {
  let paused = false, cardIn3D = false, everSeenHands = false;
  let lastHandsSeen = performance.now(), restSince = null, lastTime = performance.now();
  let anim = 0; // 0 hidden .. 1 shown

  // ---------- the 3D card ----------
  const panel = new THREE.Group();
  panel.visible = false;
  scene.add(panel);

  const fadeMats = [];
  function mesh(tex, w, h, x, y, z, order, parent = panel) {
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthTest: false, depthWrite: false });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z); m.renderOrder = order; m.userData = { w, h, dwell: 0 };
    parent.add(m);
    return m;
  }
  const card = mesh(makeTex(960, 560, (g, w, h) => drawCard(g, w, h, title, subtitle)), 0.48, 0.28, 0, 0, 0, 1000);
  const resumeBtn = mesh(makeTex(840, 132, (g, w, h) => drawButton(g, w, h, 'Resume', true)), 0.42, 0.066, 0, -0.0075, 0.004, 1001);
  const exitBtn = mesh(makeTex(840, 112, (g, w, h) => drawButton(g, w, h, 'Exit VR', false)), 0.42, 0.056, 0, -0.0805, 0.004, 1001);
  fadeMats.push(card.material, resumeBtn.material, exitBtn.material);
  const buttons = [{ m: resumeBtn, run: () => resume() }, { m: exitBtn, run: () => exit() }];

  // A veil around the head that dims the room (hands and the card stay clear of it).
  const veil = new THREE.Mesh(
    new THREE.SphereGeometry(0.95, 32, 16),
    new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide, transparent: true, opacity: 0, depthWrite: false })
  );
  veil.renderOrder = 997; veil.frustumCulled = false; veil.visible = false;
  scene.add(veil);

  // The small Pause button.
  let chip = null;
  if (pauseButton) {
    chip = mesh(makeTex(360, 120, drawPauseChip), 0.12, 0.04, 0, 0, 0, 5, scene);
    chip.material.depthTest = true; chip.material.opacity = 0; chip.visible = false;
    chip.position.copy(pauseButtonPos);
    chip.lookAt(0, pauseButtonPos.y + 0.2, 0.4);
  }

  function applyAnim() {
    const e = easeOut(anim), shown = anim > 0.001;
    panel.visible = shown; veil.visible = shown;
    panel.scale.setScalar(0.94 + 0.06 * e);
    fadeMats.forEach((m) => { m.opacity = e; });
    veil.material.opacity = dimOpacity * e;
  }
  function stepAnim(dt) {
    const target = paused && cardIn3D ? 1 : 0, step = dt / Math.max(fadeSeconds, 0.01);
    anim = target > anim ? Math.min(anim + step, 1) : Math.max(anim - step, 0);
    applyAnim();
  }

  // ---------- the desktop card (#pause in index.html, blurred by the .modal style) ----------
  const dom = document.getElementById('pause');
  const domResume = document.getElementById('pause-resume');
  function showDom() { if (!dom) return; dom.hidden = false; requestAnimationFrame(() => dom.classList.add('show')); }
  function hideDom() {
    if (!dom) return;
    dom.classList.remove('show');
    setTimeout(() => { if (!paused) dom.hidden = true; }, fadeSeconds * 1000 + 50);
  }
  if (domResume) domResume.addEventListener('click', () => resume());

  // ---------- actions ----------
  function pause() {
    if (paused) return;
    paused = true; restSince = null;
    cardIn3D = !!renderer.xr.getSession();
    if (cardIn3D) {
      const cam = renderer.xr.getCamera(), head = new THREE.Vector3(), dir = new THREE.Vector3();
      cam.getWorldPosition(head); cam.getWorldDirection(dir);
      dir.y = 0; if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1); dir.normalize();
      panel.position.copy(head).addScaledVector(dir, 0.6);
      panel.position.y = head.y - 0.05;
      panel.lookAt(head.x, panel.position.y, head.z);
      panel.updateMatrixWorld(true);
      veil.position.copy(head);
      buttons.forEach((b) => { b.m.userData.dwell = 0; b.m.material.color.setScalar(1); });
    } else {
      showDom();
    }
    onPause();
  }
  function resume() {
    if (!paused) return;
    paused = false; restSince = null; lastHandsSeen = performance.now();
    hideDom();
    onResume();
  }
  function exit() { const s = renderer.xr.getSession(); if (s) s.end(); }

  // Desktop keys: P or Esc (not while typing, and not while another dialog is open).
  addEventListener('keydown', (e) => {
    if (e.key !== 'p' && e.key !== 'P' && e.key !== 'Escape') return;
    const t = e.target && e.target.tagName;
    if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return;
    const add = document.getElementById('add');
    if (add && !add.hidden) return;
    paused ? resume() : pause();
  });

  renderer.xr.addEventListener('sessionend', () => {
    paused = false; cardIn3D = false; anim = 0; applyAnim(); hideDom();
    everSeenHands = false; restSince = null;
    if (chip) { chip.visible = false; chip.material.opacity = 0; }
  });

  // ---------- per frame (call with the XR frame) ----------
  const head = new THREE.Vector3(), tmp = new THREE.Vector3();
  const tips = [];

  // Is any fingertip inside this plane (with a little margin in front of and behind it)?
  function touching(m, margin = 0.012, depth = 0.04) {
    const { w, h } = m.userData;
    for (const p of tips) {
      tmp.copy(p); m.worldToLocal(tmp);
      if (Math.abs(tmp.x) <= w / 2 + margin && Math.abs(tmp.y) <= h / 2 + margin && Math.abs(tmp.z) <= depth) return true;
    }
    return false;
  }
  function hold(m, touchingNow, dt) {
    m.userData.dwell = touchingNow ? m.userData.dwell + dt : 0;
    const k = Math.min(m.userData.dwell / pressSeconds, 1);
    m.material.color.setScalar(1 - 0.35 * k);        // darkens as it charges, like the page's pressed state
    m.scale.setScalar(1 + 0.03 * k);
    return k >= 1;
  }

  function update(frame) {
    const now = performance.now(), dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;
    stepAnim(dt);

    const session = renderer.xr.getSession(), refSpace = renderer.xr.getReferenceSpace();
    if (!session || !frame || !refSpace) return;
    renderer.xr.getCamera().getWorldPosition(head);

    const wrists = []; tips.length = 0;
    for (const src of session.inputSources) {
      if (!src.hand) continue;
      const w = src.hand.get('wrist'), wp = w && frame.getJointPose(w, refSpace);
      if (!wp) continue;
      wrists.push(wp.transform.position.y);
      const t = src.hand.get('index-finger-tip'), tp = t && frame.getJointPose(t, refSpace);
      if (tp) tips.push(new THREE.Vector3(tp.transform.position.x, tp.transform.position.y, tp.transform.position.z));
    }
    if (wrists.length) { everSeenHands = true; lastHandsSeen = now; }

    if (!paused) {
      if (chip) {                                    // the Pause button appears once the story has started
        const want = everSeenHands ? 0.8 : 0;
        chip.visible = want > 0;
        chip.material.opacity += (want - chip.material.opacity) * Math.min(dt * 6, 1);
        if (chip.visible && hold(chip, touching(chip, 0.02), dt)) { chip.userData.dwell = 0; chip.material.color.setScalar(1); chip.scale.setScalar(1); pause(); return; }
      }
      if (!everSeenHands) return;
      if (now - lastHandsSeen > lostMs) { pause(); return; }
      if (wrists.length && wrists.every((y) => y < head.y - restDrop)) {
        if (restSince === null) restSince = now; else if (now - restSince > restMs) pause();
      } else restSince = null;
      return;
    }

    if (chip) chip.visible = false;
    veil.position.copy(head);                         // the veil follows your head
    if (!cardIn3D || anim < 0.7) return;              // wait for the card to fade in
    for (const b of buttons) {
      if (hold(b.m, touching(b.m), dt)) { b.m.userData.dwell = 0; b.m.material.color.setScalar(1); b.m.scale.setScalar(1); b.run(); return; }
    }
  }

  return { update, pause, resume, exit, get paused() { return paused; } };
}
