import { noteToFrequency } from './notes';
import { SONGS, type Drum, type Song } from './songs';

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_S = 0.12;
const LOOPS_PER_SONG = 4;
export const MUSIC_VOLUME = 0.22;

let context: AudioContext | undefined;
let noise: AudioBuffer | undefined;

/** One shared AudioContext. Browsers only let it make sound after a tap or key press. */
function getContext(): AudioContext {
  context ??= new AudioContext();
  if (context.state === 'suspended') void context.resume();
  return context;
}

function getNoise(ctx: BaseAudioContext): AudioBuffer {
  if (!noise) {
    noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noise;
}

function tone(
  ctx: BaseAudioContext,
  out: AudioNode,
  type: OscillatorType,
  frequency: number,
  start: number,
  duration: number,
  peak: number,
  endFrequency?: number,
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, start);
  if (endFrequency) osc.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(out);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function drum(ctx: BaseAudioContext, out: AudioNode, kind: Drum, start: number) {
  if (kind === 'k') {
    tone(ctx, out, 'sine', 150, start, 0.14, 0.7, 45);
    return;
  }
  const src = ctx.createBufferSource();
  src.buffer = getNoise(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = kind === 's' ? 1500 : 7000;
  const gain = ctx.createGain();
  const length = kind === 's' ? 0.12 : 0.04;
  gain.gain.setValueAtTime(kind === 's' ? 0.22 : 0.07, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  src.connect(filter).connect(gain).connect(out);
  src.start(start);
  src.stop(start + length + 0.02);
}

/** Schedules one eighth-note step of a song. Exported so a song can be rendered offline. */
export function playStep(
  ctx: BaseAudioContext,
  out: AudioNode,
  song: Song,
  step: number,
  at: number,
) {
  const stepLength = 60 / song.bpm / 2;
  const melody = song.melody[step];
  const bass = song.bass[step];
  const beat = song.drums[step];
  if (melody) tone(ctx, out, 'triangle', noteToFrequency(melody), at, stepLength * 0.9, 0.35);
  if (melody) tone(ctx, out, 'square', noteToFrequency(melody), at, stepLength * 0.5, 0.04);
  if (bass) tone(ctx, out, 'triangle', noteToFrequency(bass), at, stepLength * 1.8, 0.45);
  if (beat) drum(ctx, out, beat, at);
}

/** Plays the SONGS playlist on a loop, moving to the next song every few loops. */
export class MusicPlayer {
  private timer: ReturnType<typeof setInterval> | undefined;
  private output: GainNode | undefined;
  private songIndex = 0;
  private step = 0;
  private loops = 0;
  private nextStepTime = 0;

  constructor(private readonly onSongChange?: (song: Song) => void) {}

  get isPlaying(): boolean {
    return this.timer !== undefined;
  }

  get currentSong(): Song {
    return SONGS[this.songIndex]!;
  }

  start() {
    if (this.isPlaying) return;
    const ctx = getContext();
    this.output = ctx.createGain();
    this.output.gain.value = MUSIC_VOLUME;
    this.output.connect(ctx.destination);
    this.nextStepTime = ctx.currentTime + 0.05;
    this.onSongChange?.(this.currentSong);
    this.timer = setInterval(() => this.schedule(ctx), LOOKAHEAD_MS);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = undefined;
    const out = this.output;
    if (out && context) {
      // Short fade so stopping never clicks.
      out.gain.setTargetAtTime(0, context.currentTime, 0.05);
      setTimeout(() => out.disconnect(), 300);
    }
    this.output = undefined;
  }

  skip() {
    this.songIndex = (this.songIndex + 1) % SONGS.length;
    this.step = 0;
    this.loops = 0;
    this.onSongChange?.(this.currentSong);
  }

  private schedule(ctx: AudioContext) {
    const out = this.output;
    if (!out) return;
    while (this.nextStepTime < ctx.currentTime + SCHEDULE_AHEAD_S) {
      const song = this.currentSong;
      playStep(ctx, out, song, this.step, this.nextStepTime);
      this.nextStepTime += 60 / song.bpm / 2;
      this.step += 1;
      if (this.step >= song.melody.length) {
        this.step = 0;
        this.loops += 1;
        if (this.loops >= LOOPS_PER_SONG) this.skip();
      }
    }
  }
}

/** Short cheerful sound effects. Safe to call before any tap; they are simply silent then. */
export const sfx = {
  pop() {
    const ctx = getContext();
    tone(ctx, ctx.destination, 'sine', 420, ctx.currentTime, 0.14, 0.3, 900);
  },
  join() {
    const ctx = getContext();
    ['C5', 'E5', 'G5', 'C6'].forEach((note, i) =>
      tone(
        ctx,
        ctx.destination,
        'triangle',
        noteToFrequency(note),
        ctx.currentTime + i * 0.08,
        0.22,
        0.3,
      ),
    );
  },
  oops() {
    const ctx = getContext();
    tone(ctx, ctx.destination, 'triangle', 330, ctx.currentTime, 0.18, 0.25, 220);
  },
  /** Last seconds of a countdown. */
  tick() {
    const ctx = getContext();
    tone(ctx, ctx.destination, 'sine', 1320, ctx.currentTime, 0.06, 0.18);
  },
  /** A new round slides in. */
  whoosh() {
    const ctx = getContext();
    tone(ctx, ctx.destination, 'sine', 240, ctx.currentTime, 0.35, 0.22, 960);
    tone(ctx, ctx.destination, 'triangle', 480, ctx.currentTime + 0.05, 0.3, 0.08, 1440);
  },
  /** Quick Draw: GO! */
  go() {
    const ctx = getContext();
    tone(ctx, ctx.destination, 'square', noteToFrequency('G5'), ctx.currentTime, 0.12, 0.15);
    tone(ctx, ctx.destination, 'square', noteToFrequency('C6'), ctx.currentTime + 0.1, 0.3, 0.15);
  },
  /** The answer is revealed. */
  ding() {
    const ctx = getContext();
    tone(ctx, ctx.destination, 'sine', noteToFrequency('E6'), ctx.currentTime, 0.5, 0.25);
    tone(ctx, ctx.destination, 'sine', noteToFrequency('B6'), ctx.currentTime + 0.08, 0.6, 0.12);
  },
  /** Final scores. */
  fanfare() {
    const ctx = getContext();
    const notes = ['C5', 'E5', 'G5', 'C6', 'G5', 'C6'];
    const lengths = [0.12, 0.12, 0.12, 0.3, 0.12, 0.7];
    let at = ctx.currentTime;
    notes.forEach((note, i) => {
      tone(ctx, ctx.destination, 'triangle', noteToFrequency(note), at, lengths[i]!, 0.3);
      tone(ctx, ctx.destination, 'square', noteToFrequency(note), at, lengths[i]! * 0.6, 0.05);
      at += lengths[i]! * 0.9;
    });
  },
  /** One tap in a tapping race. */
  tap() {
    const ctx = getContext();
    tone(ctx, ctx.destination, 'sine', 700 + Math.random() * 300, ctx.currentTime, 0.05, 0.12);
  },
  /** Tapped too early in Quick Draw: a friendly boing. */
  boing() {
    const ctx = getContext();
    tone(ctx, ctx.destination, 'triangle', 180, ctx.currentTime, 0.4, 0.3, 520);
  },
};

/** A little buzz on phones that support it. Harmless where they don't. */
export function buzz(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Not supported.
  }
}
