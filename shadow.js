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

  // Shadow of a point: follow the ray from the lamp through it to the wall.
  function project(v) {
    const d = v.z - lamp.z;
    if (d > -0.05) return null;                  // behind the lamp: no shadow
    const t = (wallZ - lamp.z) / d;
    return {
      x: (lamp.x + t * (v.x - lamp.x) + wallW / 2) * ppm,
      y: (wallY + wallH / 2 - (lamp.y + t * (v.y - lamp.y))) * ppm,
      k: t * ppm,                                // metres -> pixels at this depth
    };
  }
  function bone(segs, a, b, radius) {
    const pa = project(a), pb = project(b);
    if (pa && pb) segs.push({ ax: pa.x, ay: pa.y, bx: pb.x, by: pb.y, r: radius * (pa.k + pb.k) / 2 });
  }

  // Fills segs with the shadow of every tracked hand. Returns how many hands are tracked.
  function collect(hands, segs) {
    segs.length = 0;
    let tracked = 0;
    for (const hand of hands) {
      if (!isTracked(hand)) continue;
      tracked++;
      const J = hand.joints, wrist = J['wrist'];
      for (const chain of FINGERS) {
        let prev = wrist;
        chain.forEach((name, i) => {
          const j = J[name];
          if (!j) return;
          bone(segs, prev.position, j.position, i < 2 ? 0.017 : 0.0095); // thick near the palm
          prev = j;
        });
      }
      for (let i = 0; i < KNUCKLES.length - 1; i++) {
        const a = J[KNUCKLES[i]], b = J[KNUCKLES[i + 1]];
        if (a && b) bone(segs, a.position, b.position, 0.014);
      }
      const mid = J['middle-finger-phalanx-proximal'];           // forearm stub, like a real shadow
      if (mid) {
        const w = wrist.position, m = mid.position;
        const dx = w.x - m.x, dy = w.y - m.y, dz = w.z - m.z, len = Math.hypot(dx, dy, dz) || 1;
        bone(segs, w, { x: w.x + dx / len * 0.22, y: w.y + dy / len * 0.22, z: w.z + dz / len * 0.22 }, 0.027);
      }
    }
    return tracked;
  }

  return { collect };
}
