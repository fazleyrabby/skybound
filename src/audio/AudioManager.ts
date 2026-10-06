import { Config } from '../core/Config';

const NOISE_SECONDS = 2;

/**
 * Owns the AudioContext and the mix: a master gain with separate music and
 * effects buses under it, plus the synthesis primitives everything else uses.
 * All sound in the game is synthesized here; there are no audio files yet.
 *
 * Nothing plays until `unlock()` is called from a user gesture (spec section 65).
 */
export class AudioManager {
  context: AudioContext | undefined;
  /** Destination for music. Undefined until unlocked. */
  music: GainNode | undefined;
  /** Destination for everything else. */
  sfx: GainNode | undefined;
  noise: AudioBuffer | undefined;
  private master: GainNode | undefined;

  constructor() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) void this.context?.suspend();
    });
  }

  get running(): boolean {
    return this.context?.state === 'running';
  }

  /**
   * Creates or resumes the AudioContext. Must be called from a user gesture.
   * Resolves once sound can actually play.
   */
  async unlock(): Promise<void> {
    if (!this.context) this.build();
    try {
      await this.context?.resume();
    } catch {
      // No audio this session; the game carries on silently.
    }
  }

  setPaused(paused: boolean): void {
    if (!this.context) return;
    if (paused) void this.context.suspend();
    else void this.context.resume();
  }

  /** Applies the volume settings. Call once per rendered frame. */
  update(): void {
    const context = this.context;
    if (!context || !this.running) return;
    const { masterVolume, musicVolume, sfxVolume } = Config.audio;
    const now = context.currentTime;
    this.master?.gain.setTargetAtTime(masterVolume, now, 0.1);
    this.music?.gain.setTargetAtTime(musicVolume, now, 0.1);
    this.sfx?.gain.setTargetAtTime(sfxVolume, now, 0.1);
  }

  /** One-shot noise through a low-pass that sweeps from `fromHz` down to `toHz`. */
  noiseBurst(volume: number, fromHz: number, toHz: number, seconds: number, when = 0): void {
    const context = this.context;
    if (!context || !this.sfx || !this.noise || !this.running) return;
    const start = context.currentTime + when;
    const source = context.createBufferSource();
    source.buffer = this.noise;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(fromHz, start);
    filter.frequency.exponentialRampToValueAtTime(toHz, start + seconds);
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + seconds);
    source.connect(filter).connect(gain).connect(this.sfx);
    source.start(start, Math.random() * (NOISE_SECONDS - seconds));
    source.stop(start + seconds + 0.05);
  }

  /** A short run of notes on the effects bus: alerts, results, UI. */
  tones(frequencies: readonly number[], noteSeconds: number, volume = 0.25): void {
    const context = this.context;
    if (!context || !this.sfx || !this.running) return;
    frequencies.forEach((frequency, index) => {
      this.note(
        this.sfx as GainNode,
        frequency,
        index * noteSeconds,
        noteSeconds * 1.4,
        volume,
        'triangle',
      );
    });
  }

  /** A pitch that falls from `fromHz` to `toHz`: thumps, booms, kicks. */
  sweep(
    destination: GainNode,
    fromHz: number,
    toHz: number,
    seconds: number,
    volume: number,
    when = 0,
  ): void {
    const context = this.context;
    if (!context || !this.running) return;
    const start = context.currentTime + when;
    const oscillator = context.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(fromHz, start);
    oscillator.frequency.exponentialRampToValueAtTime(toHz, start + seconds * 0.7);
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + seconds);
    oscillator.connect(gain).connect(destination);
    oscillator.start(start);
    oscillator.stop(start + seconds + 0.05);
  }

  /** One enveloped oscillator note, optionally low-passed. `when` is seconds from now. */
  note(
    destination: GainNode,
    frequency: number,
    when: number,
    seconds: number,
    volume: number,
    type: OscillatorType,
    cutoff?: number,
  ): void {
    const context = this.context;
    if (!context || !this.running) return;
    const start = context.currentTime + Math.max(0, when);
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    const gain = context.createGain();
    const attack = Math.min(0.02, seconds * 0.3);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + attack);
    gain.gain.exponentialRampToValueAtTime(0.001, start + seconds);
    if (cutoff) {
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = cutoff;
      oscillator.connect(filter).connect(gain);
    } else {
      oscillator.connect(gain);
    }
    gain.connect(destination);
    oscillator.start(start);
    oscillator.stop(start + seconds + 0.05);
  }

  private build(): void {
    const context = new AudioContext();
    this.context = context;
    const { masterVolume, musicVolume, sfxVolume } = Config.audio;

    const master = context.createGain();
    master.gain.value = masterVolume;
    master.connect(context.destination);
    this.master = master;

    this.music = context.createGain();
    this.music.gain.value = musicVolume;
    this.music.connect(master);
    this.sfx = context.createGain();
    this.sfx.gain.value = sfxVolume;
    this.sfx.connect(master);

    const length = context.sampleRate * NOISE_SECONDS;
    this.noise = context.createBuffer(1, length, context.sampleRate);
    const samples = this.noise.getChannelData(0);
    for (let i = 0; i < length; i++) samples[i] = Math.random() * 2 - 1;
  }
}
