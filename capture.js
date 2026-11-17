// Offline test tool. ?capture records hand joints in the headset to a JSON file;
// ?replay=<file> plays one back on a desktop browser, so matching can be tuned
// without wearing the headset.
//
// File format (version 1):
//   { format: 'lamplight-capture', version: 1, unit: 'mm', joints: [25 joint names],
//     events: [{ t, phase, shape }],           // what the game was doing, when it changed
//     frames: [{ t, hands: [ [x,y,z, x,y,z, ...] | null, ... ] }] }
// t is milliseconds from the start of the recording. Each hand lists every joint
// in `joints` order, in millimetres, and is null while that hand was not tracked.
// Hands are in slot order (slot 0, slot 1), the same order the game reads them.
import { JOINTS, isTracked } from './shadow.js';

const SAMPLE_MS = 1000 / 30;   // 30 samples a second is plenty for matching

export function createRecorder() {
  const frames = [], events = [];
  let t0 = null, nextT = 0, lastEvent = '';

  // Call every frame. hands: the XR hand objects. status: { phase, shape } of the game.
  function sample(nowMs, hands, status) {
    if (t0 === null) t0 = nowMs;
    const t = Math.round(nowMs - t0);
    const key = status ? `${status.phase}|${status.shape}` : '';
    if (key !== lastEvent) { lastEvent = key; events.push({ t, phase: status.phase, shape: status.shape }); }
    if (t < nextT) return;
    nextT = Math.max(nextT + SAMPLE_MS, t - SAMPLE_MS);   // keeps the average at 30 a second between frames
    const out = [];
    for (const hand of hands) {
      if (!isTracked(hand)) { out.push(null); continue; }
      const a = [];
      for (const name of JOINTS) {
        const j = hand.joints[name];
        if (j) a.push(Math.round(j.position.x * 1000), Math.round(j.position.y * 1000), Math.round(j.position.z * 1000));
        else a.push(0, 0, 0);
      }
      out.push(a);
    }
    frames.push({ t, hands: out });
  }

  const toJSON = () => JSON.stringify({ format: 'lamplight-capture', version: 1, unit: 'mm', joints: JOINTS, events, frames });
  function download() {
    if (!frames.length) return false;
    const url = URL.createObjectURL(new Blob([toJSON()], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = `lamplight-capture-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return true;
  }
  return { sample, download, toJSON, get count() { return frames.length; } };
}

// Plays a capture back as hand-like objects (see shadow.js). Throws on a file it can't read.
export function createReplay(data) {
  if (!data || data.format !== 'lamplight-capture' || !Array.isArray(data.frames) || !Array.isArray(data.joints))
    throw new Error('Not a Lamplight capture file.');
  const names = data.joints, frames = data.frames;
  if (!frames.length) throw new Error('The capture has no frames.');
  const scale = data.unit === 'm' ? 1 : 0.001;
  const slots = Math.max(2, ...frames.map((f) => f.hands.length));
  const hands = [];
  for (let h = 0; h < slots; h++) {
    const joints = {};
    for (const n of names) joints[n] = { position: { x: 0, y: 0, z: 0 }, visible: true };
    hands.push({ visible: false, joints });
  }
  const t0 = frames[0].t, duration = frames[frames.length - 1].t - t0;
  let idx = -1;

  // Move to the frame for `ms` after the start. Past the end the hands disappear.
  function step(ms) {
    if (ms > duration + 500) { for (const h of hands) h.visible = false; return false; }
    let next = idx < 0 ? 0 : idx;
    while (next + 1 < frames.length && frames[next + 1].t - t0 <= ms) next++;
    if (next === idx) return true;
    idx = next;
    const f = frames[idx];
    for (let h = 0; h < hands.length; h++) {
      const a = f.hands[h], hand = hands[h];
      if (!a) { hand.visible = false; continue; }
      hand.visible = true;
      for (let j = 0; j < names.length; j++) {
        const p = hand.joints[names[j]].position;
        p.x = a[j * 3] * scale; p.y = a[j * 3 + 1] * scale; p.z = a[j * 3 + 2] * scale;
      }
    }
    return true;
  }
  return { hands, step, duration, get frameCount() { return frames.length; } };
}
