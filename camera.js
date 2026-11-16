// Opens the webcam. If several cameras are plugged in (a laptop camera and an external one) it
// prefers the one whose name contains `prefer` (default "onn", for an ONN 4K camera; change it
// with ?camname=logitech). Falls back to the browser's default camera. Nothing is uploaded.
const size = { width: { ideal: 1280 }, height: { ideal: 720 } };

export async function openCamera(prefer) {
  const want = (prefer || new URLSearchParams(location.search).get('camname') || 'onn').toLowerCase();
  let stream = await navigator.mediaDevices.getUserMedia({ video: { ...size, facingMode: 'user' }, audio: false });
  let label = stream.getVideoTracks()[0].label || 'camera';
  try {
    const cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
    const match = cams.find((d) => d.label.toLowerCase().includes(want));
    if (match && !label.toLowerCase().includes(want)) {
      for (const t of stream.getTracks()) t.stop();
      stream = await navigator.mediaDevices.getUserMedia({ video: { ...size, deviceId: { exact: match.deviceId } }, audio: false });
      label = match.label;
    }
  } catch (e) { /* keep the default camera */ }
  return { stream, label };
}
