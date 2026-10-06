import { describe, expect, it } from 'vitest';
import { Config } from '../../src/core/Config';
import { createSkySample, DayNightSystem, sampleSky } from '../../src/world/DayNightSystem';
import { WeatherSystem } from '../../src/world/WeatherSystem';

const STEP = 1 / 60;
const at = (hour: number) => sampleSky(hour, createSkySample());
const brightness = (hour: number): number => {
  const s = at(hour);
  return s.lightIntensity + s.ambientIntensity;
};

describe('day and night (spec section 41)', () => {
  it('noon is bright with few windows lit; midnight is dark with the city lit', () => {
    const noon = at(12);
    const midnight = at(0);
    expect(noon.night).toBe(0);
    expect(midnight.night).toBe(1);
    expect(brightness(12)).toBeGreaterThan(brightness(0) * 3);
    expect(midnight.windowLight).toBeGreaterThan(noon.windowLight * 3);
    expect(noon.skyTop.b).toBeGreaterThan(midnight.skyTop.b * 3);
  });

  it('dawn and sunset are warm at the horizon', () => {
    for (const hour of [6.5, 18.5]) {
      const { skyHorizon } = at(hour);
      expect(skyHorizon.r).toBeGreaterThan(skyHorizon.b);
    }
    const { skyHorizon } = at(12);
    expect(skyHorizon.b).toBeGreaterThan(skyHorizon.r);
  });

  it('changes smoothly through the whole day, including across midnight', () => {
    let previous = at(0);
    for (let hour = 0.05; hour <= 24.05; hour += 0.05) {
      const current = at(hour);
      expect(Math.abs(current.lightIntensity - previous.lightIntensity)).toBeLessThan(0.06);
      expect(Math.abs(current.night - previous.night)).toBeLessThan(0.05);
      expect(Math.abs(current.skyTop.b - previous.skyTop.b)).toBeLessThan(0.05);
      previous = current;
    }
    expect(at(24).night).toBe(at(0).night);
  });

  it('the main light is always a unit vector well above the horizon', () => {
    for (let hour = 0; hour < 24; hour += 0.25) {
      const { lightDirection } = at(hour);
      expect(lightDirection.length()).toBeCloseTo(1, 5);
      expect(lightDirection.y).toBeGreaterThan(0.2);
    }
    expect(at(12.5).lightDirection.y).toBeGreaterThan(at(7).lightDirection.y); // highest around midday
  });

  it('the clock runs a full day in the configured time, and can be held', () => {
    const clock = new DayNightSystem();
    const start = clock.hour;
    for (let i = 0; i < Math.round(Config.world.dayLength / 2 / STEP); i++) clock.fixedUpdate(STEP);
    expect(clock.hour).toBeCloseTo((start + 12) % 24, 1);

    clock.frozen = true;
    clock.setHour(27);
    expect(clock.hour).toBe(3);
    clock.fixedUpdate(100);
    expect(clock.hour).toBe(3);
    expect(clock.sample.night).toBe(1);
  });
});

describe('weather (spec section 42)', () => {
  it('starts clear, then showers come and go on a seeded schedule', () => {
    const run = (seed: number): number[] => {
      const weather = new WeatherSystem(seed);
      const changes: number[] = [];
      let last = weather.weather;
      for (let t = 0; t < 1500; t += 1) {
        weather.fixedUpdate(1);
        if (weather.weather !== last) {
          changes.push(t);
          last = weather.weather;
        }
      }
      return changes;
    };
    expect(new WeatherSystem(1).weather).toBe('clear');
    expect(run(1)).toEqual(run(1));
    expect(run(1).length).toBeGreaterThanOrEqual(3);
    expect(run(1)[0]).toBeGreaterThanOrEqual(Config.world.clearMin - 1);
  });

  it('rain builds and fades rather than switching', () => {
    const weather = new WeatherSystem(1);
    weather.set('rain');
    weather.fixedUpdate(STEP);
    expect(weather.rain).toBeGreaterThan(0);
    expect(weather.rain).toBeLessThan(0.05);
    for (let i = 0; i < 60 * 20; i++) weather.fixedUpdate(STEP);
    expect(weather.rain).toBeGreaterThan(0.95);
    weather.set('clear');
    for (let i = 0; i < 60 * 20; i++) weather.fixedUpdate(STEP);
    expect(weather.rain).toBeLessThan(0.05);
  });
});
