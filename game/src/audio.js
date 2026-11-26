// audio.js — all sound is synthesised live with WebAudio: no audio files.
// Engine hum follows throttle, wind follows speed, and ring/landing/crash
// events are short tone and noise bursts. Starts on the first user gesture.
export function createAudio() {
  let ctx = null;
  let engineOsc = null, engineOsc2 = null, engineGain = null;
  let windSrc = null, windGain = null, windFilter = null;
  let muted = false;
  let started = false;

  function ensure() {
    if (started) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return;
    }
    started = true;
    // Engine: two detuned saws through a lowpass, gain tied to throttle.
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    engineOsc2 = ctx.createOscillator();
    engineOsc2.type = 'sawtooth';
    engineOsc2.frequency.value = 55 * 1.5;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(engineFilter);
    engineOsc2.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(ctx.destination);
    engineOsc.start();
    engineOsc2.start();

    // Wind: looped noise buffer through a bandpass.
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    windSrc = ctx.createBufferSource();
    windSrc.buffer = buf;
    windSrc.loop = true;
    windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 600;
    windFilter.Q.value = 0.6;
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    windSrc.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(ctx.destination);
    windSrc.start();

    // A gentle two-note pad for the menu, very quiet.
    startPad();
  }

  function startPad() {
    const notes = [110, 164.8, 220];
    for (const f of notes) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = 0.012;
      o.connect(g); g.connect(ctx.destination);
      o.start();
    }
  }

  function tone(freq, dur, type, vol, when = 0) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type || 'sine';
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  function noiseBurst(dur, vol, filterFreq) {
    if (!ctx || muted) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = filterFreq || 800;
    const g = ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(ctx.destination);
    src.start();
  }

  return {
    ensure,
    setMuted(m) {
      muted = m;
      if (ctx) ctx.destination.gain?.setValueAtTime?.(m ? 0 : 1, ctx.currentTime);
    },
    isMuted() { return muted; },
    // Called every frame with live flight state.
    update(throttle, speedMs, airborne) {
      if (!ctx || muted) return;
      const t = ctx.currentTime;
      const eng = airborne ? 0.05 + throttle * 0.075 : 0.02 + throttle * 0.05;
      engineGain.gain.setTargetAtTime(eng, t, 0.1);
      engineOsc.frequency.setTargetAtTime(48 + throttle * 70 + speedMs * 0.25, t, 0.1);
      engineOsc2.frequency.setTargetAtTime((48 + throttle * 70) * 1.5, t, 0.1);
      const wind = Math.min(0.16, Math.max(0, (speedMs - 25) * 0.0016));
      windGain.gain.setTargetAtTime(airborne ? wind : wind * 0.4, t, 0.15);
      windFilter.frequency.setTargetAtTime(400 + speedMs * 8, t, 0.15);
    },
    ring() { tone(880, 0.25, 'sine', 0.22); tone(1318, 0.4, 'sine', 0.18, 0.09); },
    touchdown() { tone(180, 0.18, 'triangle', 0.25); noiseBurst(0.15, 0.15, 500); },
    crash() { noiseBurst(0.8, 0.5, 400); tone(55, 0.7, 'sawtooth', 0.3); },
    warning() { tone(620, 0.12, 'square', 0.08); },
    complete() {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.5, 'sine', 0.16, i * 0.13));
    },
  };
}
