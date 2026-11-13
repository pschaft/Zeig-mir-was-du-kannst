// Klänge komplett synthetisch erzeugt (Web Audio API) – keine Audiodateien nötig.
// Gong für den Timer + Hintergrundgeräusche zum Konzentrieren.

let ctx = null;

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

/** Sanfter Glocken-Akkord. kind: 'done' | 'break' | 'soft' */
export function chime(kind = 'done', volume = 0.3) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + 0.03;
  const notes = kind === 'break' ? [783.99, 659.25, 523.25] : kind === 'soft' ? [659.25] : [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((f, i) => {
    const t = t0 + i * (kind === 'soft' ? 0 : 0.17);
    for (const [mult, amp] of [[1, 1], [2.005, 0.32], [3.01, 0.12], [4.2, 0.05]]) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'sine';
      o.frequency.value = f * mult;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(volume * amp, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.9 / Math.sqrt(mult));
      o.connect(g).connect(c.destination);
      o.start(t);
      o.stop(t + 2);
    }
  });
}

/** Kurzer Ton für Atemübung etc. */
export function tone(freq = 440, dur = 0.5, volume = 0.12) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + 0.01;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = 'sine';
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(volume, t + 0.08);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/* ---------------- Rauschgenerator ---------------- */

export const NOISES = [
  { id: 'brown', name: 'Braunes Rauschen', short: 'Braun', icon: 'noise' },
  { id: 'pink', name: 'Rosa Rauschen', short: 'Rosa', icon: 'noise' },
  { id: 'white', name: 'Weißes Rauschen', short: 'Weiß', icon: 'noise' },
  { id: 'rain', name: 'Regen', short: 'Regen', icon: 'rain' },
  { id: 'waves', name: 'Meereswellen', short: 'Wellen', icon: 'waves' },
  { id: 'fire', name: 'Kaminfeuer', short: 'Kamin', icon: 'fire' },
];

function pinkGen() {
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  return () => {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    const out = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
    b6 = w * 0.115926;
    return out * 0.11;
  };
}

function brownGen() {
  let last = 0;
  return () => {
    const w = Math.random() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;
    return last * 3.5;
  };
}

function addBursts(d, sr, { count, minLen, maxLen, minAmp, maxAmp, freqMin, freqMax, decay }) {
  for (let k = 0; k < count; k++) {
    const pos = Math.floor(Math.random() * d.length);
    const len = Math.floor(sr * (minLen + Math.random() * (maxLen - minLen)));
    const amp = minAmp + Math.random() * (maxAmp - minAmp);
    const f = freqMin + Math.random() * (freqMax - freqMin);
    const w = (2 * Math.PI * f) / sr;
    for (let i = 0; i < len; i++) {
      const idx = (pos + i) % d.length;
      const env = Math.exp((-decay * i) / len);
      d[idx] += amp * env * (0.6 * Math.sin(w * i) + 0.4 * (Math.random() * 2 - 1));
    }
  }
}

function generate(type, sr) {
  const seconds = type === 'waves' ? 16 : 10;
  const L = Math.floor(sr * seconds);
  const N = Math.floor(sr * 0.5); // Überblendung für nahtlose Schleife
  const channels = [];
  for (let ch = 0; ch < 2; ch++) {
    const d = new Float32Array(L + N);
    const pink = pinkGen(), brown = brownGen();
    if (type === 'white') {
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.3;
    } else if (type === 'pink') {
      for (let i = 0; i < d.length; i++) d[i] = pink() * 0.9;
    } else if (type === 'brown') {
      for (let i = 0; i < d.length; i++) d[i] = brown() * 0.85;
    } else if (type === 'rain') {
      let hp = 0, prev = 0;
      for (let i = 0; i < d.length; i++) {
        const x = pink();
        hp = 0.97 * (hp + x - prev);
        prev = x;
        d[i] = hp * 0.5 + brown() * 0.12;
      }
      addBursts(d, sr, { count: seconds * 70, minLen: 0.004, maxLen: 0.018, minAmp: 0.02, maxAmp: 0.12, freqMin: 1800, freqMax: 6500, decay: 6 });
      addBursts(d, sr, { count: seconds * 6, minLen: 0.01, maxLen: 0.03, minAmp: 0.08, maxAmp: 0.2, freqMin: 900, freqMax: 2500, decay: 5 });
    } else if (type === 'waves') {
      const period = 8 * sr;
      const phase = ch * 0.35 * sr;
      for (let i = 0; i < d.length; i++) {
        const t = ((i + phase) % period) / period;
        const swell = Math.pow(0.5 - 0.5 * Math.cos(2 * Math.PI * t), 1.6);
        const env = 0.18 + 0.82 * swell;
        d[i] = (brown() * 0.75 + pink() * 0.5 * swell) * env;
      }
    } else if (type === 'fire') {
      for (let i = 0; i < d.length; i++) d[i] = brown() * 0.55 + pink() * 0.04;
      addBursts(d, sr, { count: seconds * 9, minLen: 0.002, maxLen: 0.008, minAmp: 0.1, maxAmp: 0.45, freqMin: 1500, freqMax: 5000, decay: 8 });
      addBursts(d, sr, { count: seconds * 2, minLen: 0.01, maxLen: 0.025, minAmp: 0.15, maxAmp: 0.4, freqMin: 300, freqMax: 900, decay: 7 });
    }
    // Nahtlos: Ende in den Anfang überblenden
    for (let i = 0; i < N; i++) {
      const t = i / N;
      d[i] = d[i] * Math.sqrt(t) + d[L + i] * Math.sqrt(1 - t);
    }
    channels.push(d.subarray(0, L));
  }
  return channels;
}

const noiseState = { type: null, src: null, gain: null, volume: 0.5, cache: new Map() };

function buffer(c, type) {
  if (noiseState.cache.has(type)) return noiseState.cache.get(type);
  const [l, r] = generate(type, c.sampleRate);
  const buf = c.createBuffer(2, l.length, c.sampleRate);
  buf.copyToChannel(l, 0);
  buf.copyToChannel(r, 1);
  noiseState.cache.clear(); // nur einen Puffer behalten (Speicher!)
  noiseState.cache.set(type, buf);
  return buf;
}

export const noise = {
  get type() { return noiseState.type; },
  get playing() { return !!noiseState.src; },
  play(type, volume = noiseState.volume) {
    const c = ac();
    if (!c) return false;
    this.stop(0.25);
    const src = c.createBufferSource();
    src.buffer = buffer(c, type);
    src.loop = true;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), c.currentTime + 1.2);
    src.connect(gain).connect(c.destination);
    src.start();
    Object.assign(noiseState, { type, src, gain, volume });
    return true;
  },
  stop(fade = 0.5) {
    const { src, gain } = noiseState;
    if (!src) return;
    const c = ac();
    try {
      gain.gain.cancelScheduledValues(c.currentTime);
      gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0002), c.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + fade);
      src.stop(c.currentTime + fade + 0.05);
    } catch { /* schon gestoppt */ }
    noiseState.src = null;
    noiseState.gain = null;
    noiseState.type = null;
  },
  setVolume(v) {
    noiseState.volume = v;
    const c = ctx;
    if (noiseState.gain && c) noiseState.gain.gain.setTargetAtTime(Math.max(0.0002, v), c.currentTime, 0.08);
  },
};
