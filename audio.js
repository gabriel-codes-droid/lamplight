// All sound is generated with WebAudio: no audio files. A quiet looping night
// ambience (wind and crickets), the chime when a shadow comes alive, and one
// short sound per creature.
export function createAudio() {
  let ctx = null, master = null, ambienceOn = false, held = false;

  // Call from a user gesture (click, key, entering VR): browsers keep audio silent until then.
  function wake() {
    try {
      ctx = ctx || new AudioContext();
      if (!held) ctx.resume();                  // stays silent while the game is paused
      if (!ambienceOn) startAmbience();
    } catch (e) { /* no audio */ }
  }

  // One note: an oscillator sweeping f0 -> f1 with a fast attack and a decay.
  function tone({ type = 'sine', f0, f1 = f0, at = 0, dur = 0.2, peak = 0.15, lowpass = 0 }) {
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.8);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    let node = o;
    if (lowpass) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lowpass; o.connect(f); node = f; }
    node.connect(g).connect(ctx.destination);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function chime() {
    if (!ctx) return;
    [523.25, 659.25, 783.99].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + i * 0.12;
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.18, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 1);
    });
  }

  const creatures = {
    bird() {   // three quick rising-and-falling chirps
      for (let k = 0; k < 3; k++) {
        tone({ f0: 2300, f1: 3300, at: 0.35 + k * 0.17, dur: 0.07, peak: 0.07 });
        tone({ f0: 3300, f1: 2500, at: 0.42 + k * 0.17, dur: 0.07, peak: 0.07 });
      }
    },
    dog() {    // two gruff barks
      for (let k = 0; k < 2; k++) tone({ type: 'sawtooth', f0: 260, f1: 120, at: 0.35 + k * 0.3, dur: 0.17, peak: 0.16, lowpass: 900 });
    },
    rabbit() { // two soft thumps of a hind foot
      for (let k = 0; k < 2; k++) tone({ f0: 130, f1: 50, at: 0.35 + k * 0.15, dur: 0.16, peak: 0.3 });
    },
  };
  // Plays after the chime, so the two don't pile up.
  function creature(name) { if (ctx && creatures[name]) creatures[name](); }

  // Night ambience: brown-ish noise as wind, plus two quiet cricket voices.
  // Everything is a looping node graph, so nothing is scheduled frame by frame.
  function startAmbience() {
    ambienceOn = true;
    master = ctx.createGain();
    master.gain.setValueAtTime(0, ctx.currentTime);
    master.gain.linearRampToValueAtTime(1, ctx.currentTime + 4);   // fade in
    master.connect(ctx.destination);

    // wind: 4 s of smoothed noise, cross-faded so the loop point doesn't click
    const rate = ctx.sampleRate, len = rate * 4, fade = Math.floor(rate * 0.25);
    const raw = new Float32Array(len + fade);
    let last = 0;
    for (let i = 0; i < raw.length; i++) { last = (last + 0.03 * (Math.random() * 2 - 1)) / 1.03; raw[i] = last * 4; }
    const buf = ctx.createBuffer(1, len, rate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = i < fade ? raw[i] * (i / fade) + raw[len + i] * (1 - i / fade) : raw[i];
    const wind = ctx.createBufferSource(); wind.buffer = buf; wind.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 450;
    const windGain = ctx.createGain(); windGain.gain.value = 0.05;
    const swell = ctx.createOscillator(), swellDepth = ctx.createGain();   // slow gusts
    swell.frequency.value = 0.07; swellDepth.gain.value = 0.03;
    swell.connect(swellDepth).connect(windGain.gain);
    wind.connect(lp).connect(windGain).connect(master);
    wind.start(); swell.start();

    // crickets: a high sine, chopped into chirps, chopped again into groups
    function cricket(freq, chirpHz, groupHz, level) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
      const chirp = ctx.createGain(); chirp.gain.value = 0.5;
      const chirpLfo = ctx.createOscillator(), chirpDepth = ctx.createGain();
      chirpLfo.frequency.value = chirpHz; chirpDepth.gain.value = 0.5; chirpLfo.connect(chirpDepth).connect(chirp.gain);
      const group = ctx.createGain(); group.gain.value = 0.5;
      const groupLfo = ctx.createOscillator(), groupDepth = ctx.createGain();
      groupLfo.frequency.value = groupHz; groupDepth.gain.value = 0.5; groupLfo.connect(groupDepth).connect(group.gain);
      const out = ctx.createGain(); out.gain.value = level;
      o.connect(chirp).connect(group).connect(out).connect(master);
      o.start(); chirpLfo.start(); groupLfo.start();
    }
    cricket(4300, 13, 0.33, 0.007);
    cricket(3900, 11, 0.21, 0.006);
  }

  // Pause the game: silence everything until resume() (wake() will not un-mute it meanwhile).
  function suspend() { held = true; try { if (ctx) ctx.suspend(); } catch (e) { /* no audio */ } }
  function resume() { held = false; try { if (ctx) ctx.resume(); } catch (e) { /* no audio */ } }

  return { wake, chime, creature, suspend, resume };
}
