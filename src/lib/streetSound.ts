// streetSound — street hardware, synthesized. No audio files, no network.
//
// Doctrine:
//  - Off by default. Sound is opt-in, this device only.
//  - A sound is always an echo of something readable, never the only signal.
//  - Short and dry: flap clack, spray hiss, stamp thud, turnstile, zippo.
//  - Reduced motion does not mute sound; the toggle does.
export type StreetSound = "clack" | "spray" | "stamp" | "snap" | "tick" | "turnstile" | "zippo" | "solari";

const KEY = "vanta.sound.v1";
export const SOUND_EVENT = "vanta:sound";
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let lastClackAt = 0;

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
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(SOUND_EVENT, { detail: on }));
  if (on) {
    unlockAudio();
    play("snap", { force: true });
  }
}

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/* Real recorded-style samples in /sounds. Decoded once, played from memory;
   the synth below only covers the moment before they finish loading. */
const FILES: StreetSound[] = ["clack", "spray", "stamp", "snap", "tick", "turnstile", "zippo", "solari"];
const live = new Set<AudioBufferSourceNode>();
const buffers = new Map<StreetSound, AudioBuffer>();
let loading = false;
function loadSamples(a: AudioContext) {
  if (loading) return;
  loading = true;
  for (const k of FILES) {
    fetch(`/sounds/${k}.mp3`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
      .then((b) => a.decodeAudioData(b))
      .then((buf) => buffers.set(k, buf))
      .catch(() => {});
  }
}
function sample(a: AudioContext, kind: StreetSound): boolean {
  const buf = buffers.get(kind);
  if (!buf) return false;
  const src = a.createBufferSource();
  src.buffer = buf;
  // A touch of pitch drift so twenty flaps never sound like one loop.
  src.playbackRate.value = 0.94 + Math.random() * 0.12;
  src.connect(out(a));
  // Hold a reference until it ends so nothing collects it mid-play.
  live.add(src);
  src.onended = () => live.delete(src);
  src.start(a.currentTime + 0.005);
  return true;
}

/** Phones keep audio asleep until a real touch. Call from a gesture. */
export function unlockAudio() {
  if (!soundOn()) return;
  const a = audio();
  if (!a || !master) return;
  // A silent one-sample buffer wakes iOS Safari.
  const src = a.createBufferSource();
  src.buffer = a.createBuffer(1, 1, a.sampleRate);
  src.connect(master);
  src.start(0);
  loadSamples(a);
}

function out(a: AudioContext): AudioNode {
  return master ?? a.destination;
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
  src.connect(f).connect(g).connect(out(a));
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
  o.connect(g).connect(out(a));
  o.start(t);
  o.stop(t + dur + 0.02);
}

export function play(kind: StreetSound, { force = false }: { force?: boolean } = {}) {
  if (!force && !soundOn()) return;
  const now = performance.now();
  // Rate limit: a burst of flaps is one clatter, not a machine gun.
  if (kind === "clack") {
    if (now - lastClackAt < 28) return;
    lastClackAt = now;
  }
  const a = audio();
  if (!a) return;
  loadSamples(a);
  // A sleeping context would start the sound "in the past" and chop its head
  // off mid-slide. Wait for it to wake, then play from the top.
  if (a.state !== "running") {
    void a.resume().then(() => render(a, kind)).catch(() => {});
    return;
  }
  render(a, kind);
}

function render(a: AudioContext, kind: StreetSound) {
  if (sample(a, kind)) return;
  const t = a.currentTime;
  switch (kind) {
    case "solari":
    case "clack":
      noiseBurst(a, t, 0.045, 2400, 3, 0.32);
      tone(a, t, 900, 500, 0.02, 0.06);
      break;
    case "tick":
      noiseBurst(a, t, 0.03, 4000, 4, 0.16);
      break;
    case "spray":
      noiseBurst(a, t, 0.03, 3200, 3, 0.26); // agitator ball
      noiseBurst(a, t + 0.06, 0.03, 3400, 3, 0.2);
      noiseBurst(a, t + 0.1, 0.34, 6500, 0.7, 0.14); // hiss
      break;
    case "stamp":
      tone(a, t, 150, 50, 0.18, 0.5);
      noiseBurst(a, t, 0.07, 900, 1.2, 0.3);
      break;
    case "snap":
      noiseBurst(a, t, 0.03, 1800, 4, 0.32);
      tone(a, t + 0.01, 620, 380, 0.07, 0.12);
      break;
    case "turnstile":
      noiseBurst(a, t, 0.035, 1400, 5, 0.26);
      noiseBurst(a, t + 0.09, 0.05, 1100, 4, 0.2);
      tone(a, t + 0.09, 260, 140, 0.08, 0.1);
      break;
    case "zippo":
      noiseBurst(a, t, 0.02, 5200, 6, 0.24); // lid
      noiseBurst(a, t + 0.08, 0.12, 2200, 1.5, 0.14); // wheel strike
      break;
  }
}
