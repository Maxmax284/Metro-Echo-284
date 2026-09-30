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
let armed = false;

/* Sound is on unless the device explicitly muted it. Browsers still refuse to
   make noise before a real gesture, so the first tap anywhere wakes the audio
   (see armAudioOnFirstGesture) — no button to find, no switch to remember. */
export function soundOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

/** One-shot: the first real interaction unlocks audio and preloads samples. */
export function armAudioOnFirstGesture() {
  if (typeof window === "undefined" || armed) return;
  armed = true;
  const wake = () => {
    unlockAudio();
    window.removeEventListener("pointerdown", wake);
    window.removeEventListener("keydown", wake);
    window.removeEventListener("touchstart", wake);
  };
  window.addEventListener("pointerdown", wake, { once: true, passive: true });
  window.addEventListener("keydown", wake, { once: true });
  window.addEventListener("touchstart", wake, { once: true, passive: true });
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
  } else {
    stopHum();
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
function sample(a: AudioContext, kind: StreetSound, gain = 1): boolean {
  const buf = buffers.get(kind);
  if (!buf) return false;
  const src = a.createBufferSource();
  src.buffer = buf;
  // A touch of pitch drift so twenty flaps never sound like one loop.
  src.playbackRate.value = 0.94 + Math.random() * 0.12;
  if (gain !== 1) {
    const g = a.createGain();
    g.gain.value = gain;
    src.connect(g).connect(out(a));
  } else src.connect(out(a));
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

export function play(kind: StreetSound, { force = false, gain = 1 }: { force?: boolean; gain?: number } = {}) {
  if (!force && !soundOn()) return;
  const now = performance.now();
  // Rate limit: a riffle is a soft flutter, not a burst of clicks.
  if (kind === "clack") {
    if (now - lastClackAt < 70) return;
    lastClackAt = now;
  }
  const a = audio();
  if (!a) return;
  loadSamples(a);
  // A sleeping context would start the sound "in the past" and chop its head
  // off mid-slide. Wait for it to wake, then play from the top.
  if (a.state !== "running") {
    void a.resume().then(() => render(a, kind, gain)).catch(() => {});
    return;
  }
  render(a, kind, gain);
}

function render(a: AudioContext, kind: StreetSound, gain = 1) {
  if (sample(a, kind, gain)) return;
  const t = a.currentTime;
  switch (kind) {
    case "solari":
    case "clack":
      // Soft flap: low and dull, no high-end click.
      noiseBurst(a, t, 0.06, 1400, 2, 0.2);
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

/* ---- Station hum: a low, muffled loop under the main rooms ---- */

/** The rooms the hum rides under. Ask stays quiet — it is a conversation. */
export const HUM_ROOMS: ReadonlySet<string> = new Set(["today", "work", "receipts"]);

/** The arrival sound each room earns when you pull into it. */
export function roomArrivalSound(room: string): StreetSound {
  if (room === "ask") return "zippo";
  if (HUM_ROOMS.has(room)) return "solari";
  return "turnstile";
}

type HumNodes = { src: AudioBufferSourceNode; gain: GainNode; lfo: OscillatorNode };
let hum: HumNodes | null = null;

/* Muffled and slow: brown noise through a heavy low-pass, swelling gently
   like a train that never quite arrives. Synthesized — no file, no network. */
export function startHum() {
  if (!soundOn() || hum) return;
  const a = audio();
  if (!a || !master) return;
  const len = a.sampleRate * 4;
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    d[i] = last * 3.2;
  }
  const src = a.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const filter = a.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 160;
  filter.Q.value = 0.4;
  const gain = a.createGain();
  gain.gain.value = 0;
  gain.gain.setTargetAtTime(0.045, a.currentTime, 1.4);
  // A slow swell so the hum breathes instead of droning flat.
  const lfo = a.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 0.08;
  const lfoGain = a.createGain();
  lfoGain.gain.value = 0.018;
  lfo.connect(lfoGain);
  lfoGain.connect(gain.gain);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(out(a));
  src.start();
  lfo.start();
  hum = { src, gain, lfo };
}

export function stopHum() {
  const h = hum;
  hum = null;
  if (!h) return;
  const a = ctx;
  try {
    if (a) h.gain.gain.setTargetAtTime(0.0001, a.currentTime, 0.35);
  } catch {
    /* context gone — nothing to fade */
  }
  setTimeout(() => {
    try { h.src.stop(); } catch { /* already stopped */ }
    try { h.lfo.stop(); } catch { /* already stopped */ }
  }, 1000);
}
