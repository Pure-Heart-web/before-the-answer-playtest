const AUDIO_KEY = "before-the-answer-audio";

let enabled = true;
try {
  enabled = localStorage.getItem(AUDIO_KEY) !== "off";
} catch {
  enabled = true;
}
let context = null;
let master = null;
let ambienceNodes = [];

function audioContext() {
  if (!context) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    context = new AudioContext();
  }
  return context;
}

function tone(ctx, frequency, gainValue, detune = 0) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = frequency;
  oscillator.detune.value = detune;
  gain.gain.value = gainValue;
  oscillator.connect(gain).connect(master);
  oscillator.start();
  ambienceNodes.push(oscillator, gain);
}

function startAmbience(ctx) {
  if (ambienceNodes.length) return;
  master = ctx.createGain();
  master.gain.value = 0.11;
  master.connect(ctx.destination);

  tone(ctx, 110, 0.16, -5);
  tone(ctx, 164.81, 0.08, 4);
  tone(ctx, 220, 0.035, -9);

  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.value = 0.075;
  lfoGain.gain.value = 0.035;
  lfo.connect(lfoGain).connect(master.gain);
  lfo.start();
  ambienceNodes.push(lfo, lfoGain);

  const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * 0.22;
  const noise = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const rainGain = ctx.createGain();
  noise.buffer = buffer;
  noise.loop = true;
  filter.type = "lowpass";
  filter.frequency.value = 540;
  rainGain.gain.value = 0.035;
  noise.connect(filter).connect(rainGain).connect(master);
  noise.start();
  ambienceNodes.push(noise, filter, rainGain);
}

export function audioEnabled() {
  return enabled;
}

export async function ensureAudio() {
  if (!enabled) return false;
  const ctx = audioContext();
  if (!ctx) return false;
  if (ctx.state === "suspended") await ctx.resume();
  startAmbience(ctx);
  return true;
}

export async function toggleAudio() {
  enabled = !enabled;
  try {
    localStorage.setItem(AUDIO_KEY, enabled ? "on" : "off");
  } catch {
    // Sound preference remains active for this tab when storage is unavailable.
  }
  if (enabled) {
    await ensureAudio();
    playCue("open");
  } else if (context) {
    await context.suspend();
  }
  return enabled;
}

export function playCue(kind = "choice") {
  if (!enabled) return;
  ensureAudio().then(() => {
    if (!context || !master || context.state !== "running") return;
    const now = context.currentTime;
    const presets = {
      choice: [260, 0.05, 0.13],
      evidence: [392, 0.08, 0.42],
      caution: [146.83, 0.075, 0.34],
      refusal: [103.83, 0.085, 0.48],
      open: [329.63, 0.045, 0.22],
      success: [523.25, 0.075, 0.55],
    };
    const [frequency, volume, duration] = presets[kind] ?? presets.choice;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = kind === "refusal" ? "triangle" : "sine";
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * (kind === "caution" ? 0.82 : 1.26), now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }).catch(() => {
    // Browsers may deny audio initialization; gameplay remains fully usable.
  });
}
