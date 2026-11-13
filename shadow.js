// Projects tracked hand joints from the lamp onto the wall to get the shadow.
// It only needs hand-like objects ({ visible, joints: { name: { position: {x,y,z}, visible } } }),
// so live WebXR hands and replayed captures go through exactly the same code.

export const FINGERS = [
  ['thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip'],
  ...['index', 'middle', 'ring', 'pinky'].map((f) => [
    `${f}-finger-metacarpal`, `${f}-finger-phalanx-proximal`, `${f}-finger-phalanx-intermediate`,
    `${f}-finger-phalanx-distal`, `${f}-finger-tip`]),
];
export const KNUCKLES = ['index', 'middle', 'ring', 'pinky'].map((f) => `${f}-finger-phalanx-proximal`);
// The 25 WebXR hand joints, in a fixed order (used by captures).
export const JOINTS = ['wrist', ...FINGERS.flat()];

export function isTracked(hand) {
  const wrist = hand.joints && hand.joints['wrist'];
  return !!(hand.visible && wrist && wrist.visible !== false);
}

// cfg: { lamp: {x,y,z}, wallZ, wallY, wallW, wallH, ppm } in metres (ppm = canvas pixels per metre of wall)
export function createShadow(cfg) {
  const { lamp, wallZ, wallY, wallW, wallH, ppm } = cfg;

  // Nothing here allocates per frame: segments come from a pool that is reused, and
  // projected points are written into two scratch objects.
  const pool = [];
  let used = 0;
  const pa = { x: 0, y: 0, k: 0 }, pb = { x: 0, y: 0, k: 0 }, stub = { x: 0, y: 0, z: 0 };

  // Shadow of a point: follow the ray from the lamp through it to the wall.
  function project(v, out) {
    const d = v.z - lamp.z;
    if (d > -0.05) return false;                 // behind the lamp: no shadow
    const t = (wallZ - lamp.z) / d;
    out.x = (lamp.x + t * (v.x - lamp.x) + wallW / 2) * ppm;
    out.y = (wallY + wallH / 2 - (lamp.y + t * (v.y - lamp.y))) * ppm;
    out.k = t * ppm;                             // metres -> pixels at this depth
    return true;
  }
  function bone(segs, a, b, radius) {
    if (!project(a, pa) || !project(b, pb)) return;
    const g = pool[used++] || (pool[used - 1] = { ax: 0, ay: 0, bx: 0, by: 0, r: 0 });
    g.ax = pa.x; g.ay = pa.y; g.bx = pb.x; g.by = pb.y; g.r = radius * (pa.k + pb.k) / 2;
    segs.push(g);
  }

  // Fills segs with the shadow of every tracked hand. Returns how many hands are tracked.
  function collect(hands, segs) {
    segs.length = 0; used = 0;
    let tracked = 0;
    for (let h = 0; h < hands.length; h++) {
      const hand = hands[h];
      if (!isTracked(hand)) continue;
      tracked++;
      const J = hand.joints, wrist = J['wrist'];
      for (let f = 0; f < FINGERS.length; f++) {
        const chain = FINGERS[f];
        let prev = wrist;
        for (let i = 0; i < chain.length; i++) {
          const j = J[chain[i]];
          if (!j) continue;
          bone(segs, prev.position, j.position, i < 2 ? 0.017 : 0.0095); // thick near the palm
          prev = j;
        }
      }
      for (let i = 0; i < KNUCKLES.length - 1; i++) {
        const a = J[KNUCKLES[i]], b = J[KNUCKLES[i + 1]];
        if (a && b) bone(segs, a.position, b.position, 0.014);
      }
      const mid = J['middle-finger-phalanx-proximal'];           // forearm stub, like a real shadow
      if (mid) {
        const w = wrist.position, m = mid.position;
        const dx = w.x - m.x, dy = w.y - m.y, dz = w.z - m.z, len = Math.hypot(dx, dy, dz) || 1;
        stub.x = w.x + dx / len * 0.22; stub.y = w.y + dy / len * 0.22; stub.z = w.z + dz / len * 0.22;
        bone(segs, w, stub, 0.027);
      }
    }
    return tracked;
  }

  return { collect };
}
