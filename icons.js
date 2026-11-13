// Hand-gesture icons in the style of the Horizon OS "Custom Hands" set: soft
// translucent line-art hands. Drawn here from simple round bones, so the same
// data makes both the SVGs on the web page and the icons on the wall canvas.
// Each bone is [x1, y1, x2, y2, radius] in a 100 x 100 box.
export const ICONS = {
  hand: [   // open hand: "hold up your hands"
    [50, 66, 50, 60, 16],
    [38, 50, 34, 22, 5.5], [49, 48, 49, 12, 5.5], [60, 50, 64, 20, 5.5], [68, 56, 77, 32, 5],
    [33, 66, 17, 47, 6],
    [50, 76, 50, 99, 13],
  ],
  bird: [   // two hands, thumbs hooked, fingers out as wings
    [50, 72, 50, 58, 11],
    [42, 60, 9, 32, 5], [40, 65, 5, 47, 5], [41, 70, 7, 62, 5],
    [58, 60, 91, 32, 5], [60, 65, 95, 47, 5], [59, 70, 93, 62, 5],
    [50, 52, 50, 38, 6], [52, 34, 63, 31, 3],
  ],
  dog: [    // one hand in profile: thumb is the ear, fingers are the snout
    [34, 72, 54, 68, 14],
    [58, 62, 88, 56, 6.5], [58, 73, 86, 74, 5],
    [42, 58, 38, 28, 5.5],
    [34, 74, 22, 99, 11],
  ],
  rabbit: [ // two fingers up as ears, the rest folded under the thumb
    [50, 74, 50, 66, 15],
    [43, 56, 36, 16, 6], [57, 56, 65, 16, 6],
    [64, 70, 66, 64, 7],
    [34, 72, 53, 68, 6],
    [50, 80, 50, 99, 12],
  ],
};

const OUTLINE = 2.4;   // extra width of the pale outline, in icon units

// An <svg> string: pale outline first, then the translucent fill, so overlapping bones merge.
export function iconSVG(name, size = 64, { stroke = 'rgba(255,255,255,0.85)', fill = '#9aa1ab' } = {}) {
  const bones = ICONS[name] || [];
  const line = (b, w, col) => `<line x1="${b[0]}" y1="${b[1]}" x2="${b[2]}" y2="${b[3]}" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-6 -6 112 112" width="${size}" height="${size}" aria-hidden="true">` +
    bones.map((b) => line(b, b[4] * 2 + OUTLINE, stroke)).join('') +
    bones.map((b) => line(b, b[4] * 2 - 0.4, fill)).join('') + '</svg>';
}

// Draw an icon on a canvas 2D context, centred on (cx, cy), `size` pixels wide.
export function drawIcon(c, name, cx, cy, size, stroke = 'rgba(255,255,255,0.85)', fill = '#9aa1ab') {
  const bones = ICONS[name];
  if (!bones) return;
  const k = size / 100, x0 = cx - size / 2, y0 = cy - size / 2;
  c.lineCap = 'round';
  for (let pass = 0; pass < 2; pass++) {
    c.strokeStyle = pass ? fill : stroke;
    for (let i = 0; i < bones.length; i++) {
      const b = bones[i];
      c.lineWidth = (pass ? b[4] * 2 - 0.4 : b[4] * 2 + OUTLINE) * k;
      c.beginPath(); c.moveTo(x0 + b[0] * k, y0 + b[1] * k); c.lineTo(x0 + b[2] * k, y0 + b[3] * k); c.stroke();
    }
  }
}
