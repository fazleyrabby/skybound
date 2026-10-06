import { Config } from '../core/Config';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/GameEvents';
import type { PlayerState } from '../player/PlayerState';
import { clamp, lerp, smoothstep } from '../utils/math';

const NOISE_SECONDS = 2;
const RUMBLE_CUTOFF = 90;
const AIRBORNE_FLOOR = 0.04;

/**
 * Synthesized flight and combat audio (spec section 40): no audio files. Filtered noise
 * for wind, a low rumble at boost speeds, and one-shots for the sonic boom and
 * impacts. Recorded assets replace this in Phase 12.
 */
export class FlightAudio {
  private context: AudioContext | undefined;
  private master: GainNode | undefined;
  private noise: AudioBuffer | undefined;
  private windFilter: BiquadFilterNode | undefined;
  private windGain: GainNode | undefined;
  private rumbleGain: GainNode | undefined;

  constructor(
    private readonly player: PlayerState,
    events: EventBus<GameEvents>,
  ) {
    events.on('player:state', ({ to }) => {
      if (to === 'BOOSTING') this.playBoom();
    });
    events.on('player:impact', ({ speed }) => this.playImpact(speed));
    events.on('combat:hit', ({ kind }) => {
      if (kind === 'blast') this.playNoiseBurst(0.35, 2400, 300, 0.12);
      else this.playImpact(kind === 'punch' ? 60 : 110);
    });
    events.on('combat:whiff', () => this.playNoiseBurst(0.12, 1800, 500, 0.1));
    events.on('combat:blastFired', () => this.playNoiseBurst(0.22, 5000, 900, 0.14));
    events.on('enemy:destroyed', () => this.playNoiseBurst(0.8, 1400, 60, 0.7));
    events.on('enemy:fired', ({ kind }) => {
      if (kind === 'missile') this.playNoiseBurst(0.3, 900, 200, 0.4);
      else this.playNoiseBurst(0.1, 3200, 1200, 0.06);
    });
    events.on('world:eventStarted', () => this.playTones([660, 880, 660], 0.12));
    events.on('world:eventEnded', ({ outcome }) =>
      this.playTones(outcome === 'success' ? [523, 659, 784, 1047] : [392, 330, 262], 0.14),
    );
    events.on('player:damaged', () => this.playNoiseBurst(0.5, 700, 150, 0.18));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) void this.context?.suspend();
    });
  }

  /** Creates or resumes the AudioContext. Must be called from a user gesture. */
  unlock(): void {
    if (!this.context) this.build();
    void this.context?.resume();
  }

  setPaused(paused: boolean): void {
    if (!this.context) return;
    if (paused) void this.context.suspend();
    else void this.context.resume();
  }

  /** Call once per rendered frame. */
  update(): void {
    const context = this.context;
    if (!context || context.state !== 'running') return;
    const cfg = Config.audio;
    const player = this.player;
    const speedFactor = player.speedFactor;
    const now = context.currentTime;
    const smoothing = 1 / cfg.response;

    this.master?.gain.setTargetAtTime(cfg.masterVolume, now, smoothing);

    // Wind: louder and brighter with speed; a dive pushes it brighter still.
    const floor = player.airborne ? AIRBORNE_FLOOR : 0;
    const wind = cfg.windVolume * Math.max(floor, Math.pow(speedFactor, 0.8));
    const cutoff =
      lerp(cfg.windMinCutoff, cfg.windMaxCutoff, speedFactor) * (player.diving ? 1.25 : 1);
    this.windGain?.gain.setTargetAtTime(wind, now, smoothing);
    this.windFilter?.frequency.setTargetAtTime(cutoff, now, smoothing);

    const { fastSpeed, extremeSpeed } = Config.flight;
    const rumble = cfg.rumbleVolume * smoothstep(fastSpeed, extremeSpeed, player.speed);
    this.rumbleGain?.gain.setTargetAtTime(rumble, now, smoothing);
  }

  private build(): void {
    const context = new AudioContext();
    this.context = context;

    const master = context.createGain();
    master.gain.value = Config.audio.masterVolume;
    master.connect(context.destination);
    this.master = master;

    const length = context.sampleRate * NOISE_SECONDS;
    const noise = context.createBuffer(1, length, context.sampleRate);
    const samples = noise.getChannelData(0);
    for (let i = 0; i < length; i++) samples[i] = Math.random() * 2 - 1;
    this.noise = noise;

    const source = context.createBufferSource();
    source.buffer = noise;
    source.loop = true;

    const windFilter = context.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.Q.value = 0.7;
    windFilter.frequency.value = Config.audio.windMinCutoff;
    const windGain = context.createGain();
    windGain.gain.value = 0;
    source.connect(windFilter).connect(windGain).connect(master);
    this.windFilter = windFilter;
    this.windGain = windGain;

    const rumbleFilter = context.createBiquadFilter();
    rumbleFilter.type = 'lowpass';
    rumbleFilter.frequency.value = RUMBLE_CUTOFF;
    const rumbleGain = context.createGain();
    rumbleGain.gain.value = 0;
    source.connect(rumbleFilter).connect(rumbleGain).connect(master);
    this.rumbleGain = rumbleGain;

    source.start();
  }

  /** Low thump plus a falling noise sweep. */
  private playBoom(): void {
    const context = this.context;
    if (!context || !this.master || context.state !== 'running') return;
    const now = context.currentTime;
    const volume = Config.audio.boomVolume;

    const thump = context.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(120, now);
    thump.frequency.exponentialRampToValueAtTime(32, now + 0.5);
    const thumpGain = context.createGain();
    thumpGain.gain.setValueAtTime(volume, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
    thump.connect(thumpGain).connect(this.master);
    thump.start(now);
    thump.stop(now + 0.75);

    this.playNoiseBurst(volume * 0.7, 1800, 90, 0.6);
  }

  private playImpact(speed: number): void {
    const loudness = clamp(speed / 80, 0.1, 1) * Config.audio.impactVolume;
    this.playNoiseBurst(loudness, 500, 120, 0.25);
  }

  /** A short run of notes: alerts and results. */
  private playTones(frequencies: readonly number[], noteSeconds: number): void {
    const context = this.context;
    if (!context || !this.master || context.state !== 'running') return;
    frequencies.forEach((frequency, index) => {
      const start = context.currentTime + index * noteSeconds;
      const oscillator = context.createOscillator();
      oscillator.type = 'triangle';
      oscillator.frequency.value = frequency;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, start + noteSeconds * 1.4);
      oscillator.connect(gain).connect(this.master as GainNode);
      oscillator.start(start);
      oscillator.stop(start + noteSeconds * 1.5);
    });
  }

  /** One-shot noise through a low-pass that sweeps from `fromHz` down to `toHz`. */
  private playNoiseBurst(volume: number, fromHz: number, toHz: number, seconds: number): void {
    const context = this.context;
    if (!context || !this.master || !this.noise || context.state !== 'running') return;
    const now = context.currentTime;

    const source = context.createBufferSource();
    source.buffer = this.noise;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(fromHz, now);
    filter.frequency.exponentialRampToValueAtTime(toHz, now + seconds);
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + seconds);
    source.connect(filter).connect(gain).connect(this.master);
    source.start(now, Math.random() * (NOISE_SECONDS - seconds));
    source.stop(now + seconds + 0.05);
  }
}
