"use client";

// Procedural "wild-west" background music via the Web Audio API — no asset files
// and no external requests (so no CDN/CSP/copyright issues). A gentle looping
// folk tune: plucked melody + walking bass + soft chords over I–vi–IV–V.
// Must be started from a user gesture (browsers block audio autoplay).

const BPM = 92;
const BEAT = 60 / BPM;
const STEP = BEAT / 2; // eighth notes
const STEPS = 32; // 4 bars of 4/4

const R = 0; // rest
// Note frequencies (Hz).
const C4 = 261.63, D4 = 293.66, E4 = 329.63, F4 = 349.23, G4 = 392.0, A4 = 440.0, B4 = 493.88;
const C5 = 523.25;
const C2 = 65.41, F2 = 87.31, G2 = 98.0, A2 = 110.0;

// Plucked melody, one entry per eighth-note step (0 = rest).
const MELODY = [
  E4, R, G4, C5, R, G4, E4, R, // C
  E4, R, A4, C5, R, A4, E4, R, // Am
  F4, R, A4, C5, R, A4, F4, R, // F
  D4, R, G4, B4, R, G4, D4, R, // G
];
// Walking bass — root on beats 1 and 3 of each bar.
const BASS = [
  C2, R, R, R, C2, R, R, R,
  A2, R, R, R, A2, R, R, R,
  F2, R, R, R, F2, R, R, R,
  G2, R, R, R, G2, R, R, R,
];
// A soft chord pad struck at the start of each bar.
const CHORDS: number[][] = [
  [C4, E4, G4], // C
  [A2 * 2, C4, E4], // Am (A3–C4–E4)
  [F2 * 2, A4, C5], // F
  [G2 * 2, B4, D4 * 2], // G
];

let volume = 0.35; // 0..1 master gain; kept across start/stop
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let lp: BiquadFilterNode | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let nextTime = 0;
let step = 0;
let playing = false;

function synth(freq: number, time: number, dur: number, gain: number, type: OscillatorType) {
  if (!ctx || !lp) return;
  const o = ctx.createOscillator();
  const o2 = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o2.type = type;
  o.frequency.value = freq;
  o2.frequency.value = freq;
  o2.detune.value = 7; // slight chorus for warmth
  o.connect(g);
  o2.connect(g);
  g.connect(lp);
  // Plucked envelope: quick attack, exponential decay.
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(gain, time + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  o.start(time);
  o2.start(time);
  o.stop(time + dur + 0.05);
  o2.stop(time + dur + 0.05);
}

function scheduleStep(s: number, time: number) {
  const melodyNote = MELODY[s];
  if (melodyNote) synth(melodyNote, time, STEP * 1.7, 0.16, "triangle");
  const bassNote = BASS[s];
  if (bassNote) synth(bassNote, time, BEAT * 0.95, 0.2, "sawtooth");
  if (s % 8 === 0) {
    for (const f of CHORDS[s / 8]) synth(f, time, BEAT * 2, 0.045, "triangle");
  }
}

function tick() {
  if (!ctx) return;
  while (nextTime < ctx.currentTime + 0.12) {
    scheduleStep(step % STEPS, nextTime);
    nextTime += STEP;
    step++;
  }
}

export function getMusicVolume() {
  return volume;
}

export function setMusicVolume(v: number) {
  volume = Math.max(0, Math.min(1, v));
  if (ctx && master) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.05);
}

export function toggleMusic(): boolean {
  if (playing) {
    stopMusic();
    return false;
  }
  startMusic();
  return playing;
}

function startMusic() {
  if (playing) return;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = volume;
  lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 2600;
  lp.connect(master);
  master.connect(ctx.destination);
  void ctx.resume();
  nextTime = ctx.currentTime + 0.1;
  step = 0;
  playing = true;
  timer = setInterval(tick, 25);
}

function stopMusic() {
  playing = false;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (ctx) {
    const c = ctx;
    master?.gain.setTargetAtTime(0.0001, c.currentTime, 0.08);
    setTimeout(() => c.close().catch(() => {}), 400);
    ctx = null;
    master = null;
    lp = null;
  }
}
