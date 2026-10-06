import { Color, Vector3 } from 'three';
import { Config } from '../core/Config';

/** Everything presentation needs to light the world at one moment. */
export interface SkySample {
  /** Direction from the world toward the main light (sun by day, moon by night). Unit. */
  lightDirection: Vector3;
  lightColor: Color;
  lightIntensity: number;
  ambientSky: Color;
  ambientGround: Color;
  ambientIntensity: number;
  skyTop: Color;
  skyHorizon: Color;
  /** 0 by day, 1 in full night. Drives lamps, signs and headlights. */
  night: number;
  /** Share of windows lit, 0..1. */
  windowLight: number;
}

interface Keyframe {
  hour: number;
  light: number;
  lightIntensity: number;
  ambientSky: number;
  ambientGround: number;
  ambientIntensity: number;
  skyTop: number;
  skyHorizon: number;
  night: number;
  windowLight: number;
}

const NIGHT = {
  light: 0x8fa8ff,
  lightIntensity: 0.3,
  ambientSky: 0x24304f,
  ambientGround: 0x0b0d16,
  ambientIntensity: 0.55,
  skyTop: 0x050a1c,
  skyHorizon: 0x18264a,
  night: 1,
  windowLight: 1,
};
const DAWN = {
  light: 0xffb27a,
  lightIntensity: 1.1,
  ambientSky: 0x8fa0c8,
  ambientGround: 0x3a3440,
  ambientIntensity: 0.8,
  skyTop: 0x3a5a9a,
  skyHorizon: 0xffc9a0,
  night: 0.35,
  windowLight: 0.55,
};
const DAY = {
  light: 0xfff4e0,
  lightIntensity: 2.3,
  ambientSky: 0xcfe3ff,
  ambientGround: 0x4a4f5a,
  ambientIntensity: 1.1,
  skyTop: 0x3f86de,
  skyHorizon: 0xb7d6f5,
  night: 0,
  windowLight: 0.2,
};
const SUNSET = {
  light: 0xff8a4a,
  lightIntensity: 1.4,
  ambientSky: 0x8a86b0,
  ambientGround: 0x3a2f3a,
  ambientIntensity: 0.8,
  skyTop: 0x2f3c78,
  skyHorizon: 0xff9a5a,
  night: 0.45,
  windowLight: 0.7,
};

/** DAWN, DAY, SUNSET, NIGHT (spec section 41), with holds so noon and midnight last a while. */
const KEYFRAMES: readonly Keyframe[] = [
  { hour: 0, ...NIGHT },
  { hour: 4.5, ...NIGHT },
  { hour: 6.5, ...DAWN },
  { hour: 9, ...DAY },
  { hour: 16.5, ...DAY },
  { hour: 18.5, ...SUNSET },
  { hour: 20.5, ...NIGHT },
  { hour: 24, ...NIGHT },
];

const SUNRISE = 6;
const SUNSET_HOUR = 19;
/** The main light never drops below this elevation, so shadows stay sane. */
const MIN_ELEVATION = 0.28;
const colorA = new Color();
const colorB = new Color();

export function createSkySample(): SkySample {
  return {
    lightDirection: new Vector3(0, 1, 0),
    lightColor: new Color(),
    lightIntensity: 1,
    ambientSky: new Color(),
    ambientGround: new Color(),
    ambientIntensity: 1,
    skyTop: new Color(),
    skyHorizon: new Color(),
    night: 0,
    windowLight: 0,
  };
}

/** The sky at a given hour (0..24), written into `out`. Pure and continuous, including across midnight. */
export function sampleSky(hour: number, out: SkySample): SkySample {
  const h = ((hour % 24) + 24) % 24;
  let index = 0;
  while (index < KEYFRAMES.length - 2 && h >= (KEYFRAMES[index + 1]?.hour ?? 24)) index++;
  const a = KEYFRAMES[index] as Keyframe;
  const b = KEYFRAMES[index + 1] as Keyframe;
  const t = (h - a.hour) / (b.hour - a.hour);
  const mix = (from: number, to: number): number => from + (to - from) * t;
  const blend = (target: Color, from: number, to: number): void => {
    target.copy(colorA.setHex(from)).lerp(colorB.setHex(to), t);
  };

  blend(out.lightColor, a.light, b.light);
  blend(out.ambientSky, a.ambientSky, b.ambientSky);
  blend(out.ambientGround, a.ambientGround, b.ambientGround);
  blend(out.skyTop, a.skyTop, b.skyTop);
  blend(out.skyHorizon, a.skyHorizon, b.skyHorizon);
  out.lightIntensity = mix(a.lightIntensity, b.lightIntensity);
  out.ambientIntensity = mix(a.ambientIntensity, b.ambientIntensity);
  out.night = mix(a.night, b.night);
  out.windowLight = mix(a.windowLight, b.windowLight);

  // The sun arcs east to west through the day; at night the moon does the same.
  const daytime = h >= SUNRISE && h < SUNSET_HOUR;
  const span = daytime ? SUNSET_HOUR - SUNRISE : 24 - (SUNSET_HOUR - SUNRISE);
  const since = daytime ? h - SUNRISE : (h - SUNSET_HOUR + 24) % 24;
  const arc = (since / span) * Math.PI;
  out.lightDirection.set(Math.cos(arc), Math.max(Math.sin(arc), MIN_ELEVATION), 0.35).normalize();
  return out;
}

/** The clock. A full day takes `Config.world.dayLength` real seconds. */
export class DayNightSystem {
  hour: number = Config.world.startHour;
  /** When true the clock holds still (debug, screenshots). */
  frozen = false;
  readonly sample = createSkySample();

  constructor() {
    sampleSky(this.hour, this.sample);
  }

  setHour(hour: number): void {
    this.hour = ((hour % 24) + 24) % 24;
    sampleSky(this.hour, this.sample);
  }

  fixedUpdate(dt: number): void {
    if (!this.frozen) this.hour = (this.hour + (dt * 24) / Config.world.dayLength) % 24;
    sampleSky(this.hour, this.sample);
  }
}
