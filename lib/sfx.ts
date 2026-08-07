"use client";

// Context riêng khỏi lib/music.ts: nhạc chỉ dựng context khi người chơi bật nhạc,
// còn tiếng súng phải kêu được cả khi nhạc tắt.

import { getSfx } from "./prefs";

// Lớp đuôi vang lấy mẫu lâu nhất và dừng ở 0,6s, nên đệm chỉ cần chừng đó.
const NOISE_SEC = 0.6;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;

// Dựng ở lần bắn đầu, không phải lúc tải trang: trình duyệt chặn AudioContext tạo
// trước khi có tương tác, và context bị "suspended" sẽ nuốt mọi tiếng phát sau.
function audio(): AudioContext | null {
  if (ctx) {
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  }
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
  // Tạo một lần rồi dùng lại: phần đắt nhất, và không đổi giữa các phát bắn.
  const len = Math.ceil(ctx.sampleRate * NOISE_SEC);
  noise = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

export function playGunshot(gain = 1) {
  if (!getSfx()) return;
  const c = audio();
  if (!c || !master || !noise) return;
  const t = c.currentTime;

  // Chính cú quét tần số xuống này biến tiếng "xì" thành tiếng "đoàng".
  const src = c.createBufferSource();
  src.buffer = noise;
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(3500, t);
  lp.frequency.exponentialRampToValueAtTime(200, t + 0.18);
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.9 * gain, t);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  src.connect(lp);
  lp.connect(ng);
  ng.connect(master);
  src.start(t);
  src.stop(t + 0.3);

  // Cho phát bắn có sức nặng, thay vì chỉ là một tiếng nhiễu.
  const o = c.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(160, t);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  const og = c.createGain();
  og.gain.setValueAtTime(0.7 * gain, t);
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  o.connect(og);
  og.connect(master);
  o.start(t);
  o.stop(t + 0.2);

  // Nghe ra "trong phòng kín" chứ không phải "ngoài trời".
  const tail = c.createBufferSource();
  tail.buffer = noise;
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 900;
  bp.Q.value = 0.7;
  const tg = c.createGain();
  tg.gain.setValueAtTime(0.0001, t);
  tg.gain.exponentialRampToValueAtTime(0.12 * gain, t + 0.02);
  tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
  tail.connect(bp);
  bp.connect(tg);
  tg.connect(master);
  tail.start(t + 0.01);
  tail.stop(t + 0.6);
}
