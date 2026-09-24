// streetSound — street hardware, synthesized. No audio files, no network.
//
// Doctrine:
//  - Off by default. Sound is opt-in, this device only.
//  - A sound is always an echo of something readable, never the only signal.
//  - Short and dry: flap clack, spray tick, stamp thud, turnstile snap.
//  - Reduced motion does not mute sound; the toggle does.
export type StreetSound = "clack" | "spray" | "stamp" | "snap" | "tick";

const KEY = "vanta.sound.v1";
let ctx: AudioContext | null = null;
let lastAt = 0;

export function soundOn(): boolean {
  try {
    return localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
}

export function setSoundOn(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* private mode — stays off */
  }
  if (on) play("snap", { force: true });
}

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx ??= new AC();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function noiseBurst(a: AudioContext, t: number, dur: number, freq: number, q: number, gain: number) {
  const len = Math.max(1, Math.floor(a.sampleRate * dur));
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = freq;
  f.Q.value = q;
  const g = a.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(a.destination);
  src.start(t);
}

function tone(a: AudioContext, t: number, from: number, to: number, dur: number, gain: number) {
  const o = a.createOscillator();
  o.type = "triangle";
  o.frequency.setValueAtTime(from, t);
  o.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export function play(kind: StreetSound, { force = false }: { force?: boolean } = {}) {
  if (!force && !soundOn()) return;
  const now = performance.now();
  // Rate limit: a burst of flaps is one clatter, not a machine gun.
  if (kind === "clack" && now - lastAt < 28) return;
  lastAt = now;
  const a = audio();
  if (!a) return;
  const t = a.currentTime;
  switch (kind) {
    case "clack":
      noiseBurst(a, t, 0.025, 2600, 4, 0.12);
      break;
    case "tick":
      noiseBurst(a, t, 0.015, 4200, 6, 0.06);
      break;
    case "spray":
      noiseBurst(a, t, 0.02, 3200, 3, 0.1); // agitator ball
      noiseBurst(a, t + 0.03, 0.22, 6500, 0.8, 0.05); // hiss
      break;
    case "stamp":
      tone(a, t, 140, 55, 0.12, 0.22);
      noiseBurst(a, t, 0.05, 900, 1.2, 0.12);
      break;
    case "snap":
      noiseBurst(a, t, 0.018, 1800, 5, 0.14);
      tone(a, t + 0.01, 620, 380, 0.05, 0.05);
      break;
  }
}
