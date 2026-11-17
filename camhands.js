// ?cam: your own hands, read by the webcam, drive the wall shadow, so the game can be played and
// recorded on a laptop without a headset. Frames are processed in the browser and never uploaded.
import { loadLandmarker, landmarksToSegs } from './addshape.js';
import { openCamera } from './camera.js';

export function createCamHands({ W, H, preview = true }) {
  const video = document.createElement('video');
  video.playsInline = true; video.muted = true;
  const note = document.createElement('div');
  note.style.cssText = 'position:fixed;z-index:9;left:50%;top:12px;transform:translateX(-50%);padding:8px 16px;border-radius:999px;background:rgba(30,30,30,.85);color:#fff;font:600 14px system-ui,sans-serif';
  document.body.appendChild(note);
  if (preview) {
    video.style.cssText = 'position:fixed;z-index:9;right:12px;bottom:12px;width:200px;border-radius:16px;transform:scaleX(-1);opacity:.85';
    document.body.appendChild(video);
  }
  const state = { ready: false, error: '' };
  let lm = null, lastT = -1;
  (async () => {
    try {
      note.textContent = 'Starting the camera...';
      const { stream, label } = await openCamera();
      video.srcObject = stream; await video.play();
      note.textContent = 'Camera: ' + label;
      note.textContent = 'Loading hand tracking (about 8 MB, first time only)...';
      lm = await loadLandmarker();
      state.ready = true; note.textContent = 'Show both hands to the camera. Using: ' + label;
      setTimeout(() => { note.style.display = 'none'; }, 6000);
    } catch (e) {
      state.error = e && e.name === 'NotAllowedError' ? 'Camera access was blocked. Allow it and reload.' : 'Camera hands failed: ' + (e && e.message ? e.message : e);
      note.textContent = state.error;
    }
  })();
  // Fills segs with the shadow of every hand the camera sees; returns how many hands.
  function update(segs) {
    segs.length = 0;
    if (!state.ready || video.readyState < 2) return 0;
    const now = performance.now();
    if (now <= lastT) return 0;
    lastT = now;
    const res = lm.detectForVideo(video, now);
    const hands = res && res.landmarks ? res.landmarks : [];
    for (const g of landmarksToSegs(hands, W, H)) segs.push(g);
    return hands.length;
  }
  return { state, update };
}
