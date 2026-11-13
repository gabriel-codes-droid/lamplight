// Hand-gesture icons drawn as hand-tracking skeletons: dots at the joints, joined
// by lines (the same idea as the Quest's own joints). Each hand is 21 points in
// a 100 x 100 box, in the usual landmark order:
//   0 wrist | 1-4 thumb | 5-8 index | 9-12 middle | 13-16 ring | 17-20 pinky
// Each finger runs knuckle -> middle joint -> upper joint -> tip. A bird is two hands.
export const ICONS = {
  hand: [[   // open hand, fingers up: "hold up your hands"
    [50, 92], [37, 79], [25, 67], [16, 55], [9, 43],
    [38, 57], [35, 41], [33, 29], [32, 18],
    [49, 54], [49, 37], [49, 24], [49, 11],
    [60, 57], [63, 41], [65, 29], [66, 18],
    [70, 63], [75, 50], [78, 40], [80, 31],
  ]],
  rabbit: [[ // two fingers up as ears, ring and little finger folded, thumb across them
    [50, 92], [38, 80], [34, 67], [42, 60], [54, 62],
    [40, 58], [36, 40], [33, 26], [31, 13],
    [51, 55], [54, 38], [57, 25], [60, 12],
    [61, 58], [67, 56], [65, 66], [57, 67],
    [70, 64], [75, 62], [71, 71], [63, 72],
  ]],
  dog: [[    // hand in profile: thumb is the ear, two fingers the top jaw, two the bottom jaw
    [20, 80], [30, 71], [36, 57], [38, 43], [38, 30],
    [42, 65], [58, 61], [72, 58], [87, 56],
    [43, 70], [59, 67], [72, 64], [85, 62],
    [44, 75], [58, 77], [70, 78], [83, 80],
    [44, 80], [56, 83], [66, 85], [76, 87],
  ]],
};
// The bird is two hands with fingers fanned out as wings and the thumbs up as the head.
const wing = [
  [46, 80], [44, 71], [46, 63], [48, 55], [50, 47],
  [40, 69], [28, 59], [19, 52], [10, 45],
  [39, 73], [26, 67], [16, 63], [6, 59],
  [39, 77], [27, 75], [18, 74], [9, 74],
  [41, 81], [31, 83], [23, 85], [15, 88],
];
ICONS.bird = [wing, wing.map(([x, y]) => [100 - x, y])];

// Lines to draw between the 21 points of one hand.
const EDGES = [
  [0, 1], [1, 2], [2, 3], [3, 4],                  // thumb
  [0, 5], [5, 6], [6, 7], [7, 8],                  // index
  [9, 10], [10, 11], [11, 12],                     // middle
  [13, 14], [14, 15], [15, 16],                    // ring
  [0, 17], [17, 18], [18, 19], [19, 20],           // little finger
  [5, 9], [9, 13], [13, 17],                       // across the knuckles
];
const PALM = [0, 1, 5, 9, 13, 17];                 // outline of the palm, for the soft fill
const LINE_W = 2.4, DOT_R = 3.1;

const SOFT = 'rgba(255,255,255,0.12)';

// An <svg> string. line / dot are CSS colours.
export function iconSVG(name, size = 64, { line = '#ffffff', dot = '#2d88ff' } = {}) {
  const hands = ICONS[name] || [];
  let out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-6 -6 112 112" width="${size}" height="${size}" aria-hidden="true">`;
  for (const h of hands) {
    out += `<polygon points="${PALM.map((i) => h[i].join(',')).join(' ')}" fill="${SOFT}"/>`;
    out += `<g stroke="${line}" stroke-width="${LINE_W}" stroke-linecap="round">` +
      EDGES.map(([a, b]) => `<line x1="${h[a][0]}" y1="${h[a][1]}" x2="${h[b][0]}" y2="${h[b][1]}"/>`).join('') + '</g>';
    out += h.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="${DOT_R}" fill="${dot}" stroke="${line}" stroke-width="1.2"/>`).join('');
  }
  return out + '</svg>';
}

// Draw an icon on a canvas 2D context, centred on (cx, cy), `size` pixels wide.
export function drawIcon(c, name, cx, cy, size, line = '#ffffff', dot = '#2d88ff') {
  const hands = ICONS[name];
  if (!hands) return;
  const k = size / 100, x0 = cx - size / 2, y0 = cy - size / 2;
  c.lineCap = 'round';
  for (let h = 0; h < hands.length; h++) {
    const p = hands[h];
    c.fillStyle = SOFT; c.beginPath();
    for (let i = 0; i < PALM.length; i++) { const q = p[PALM[i]]; i ? c.lineTo(x0 + q[0] * k, y0 + q[1] * k) : c.moveTo(x0 + q[0] * k, y0 + q[1] * k); }
    c.closePath(); c.fill();
    c.strokeStyle = line; c.lineWidth = LINE_W * k; c.beginPath();
    for (let e = 0; e < EDGES.length; e++) {
      const a = p[EDGES[e][0]], b = p[EDGES[e][1]];
      c.moveTo(x0 + a[0] * k, y0 + a[1] * k); c.lineTo(x0 + b[0] * k, y0 + b[1] * k);
    }
    c.stroke();
    c.lineWidth = 1.2 * k;
    for (let i = 0; i < p.length; i++) {
      c.fillStyle = dot; c.beginPath(); c.arc(x0 + p[i][0] * k, y0 + p[i][1] * k, DOT_R * k, 0, 7); c.fill(); c.stroke();
    }
  }
}
