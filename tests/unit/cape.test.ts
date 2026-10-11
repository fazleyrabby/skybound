import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { Config } from '../../src/core/Config';
import { ClothStrip } from '../../src/player/ClothStrip';

const shape = Config.hero.cape;
const FRAME = 1 / 60;
const BACK = new Vector3(0, 0, 1);

function createCape() {
  const cloth = new ClothStrip(shape);
  const left = new Vector3(-shape.topWidth / 2, 2, 0);
  const right = new Vector3(shape.topWidth / 2, 2, 0);
  cloth.reset(left, right);
  const point = (row: number, column: number): Vector3 =>
    new Vector3().fromArray(cloth.positions, (row * shape.columns + column) * 3);
  /** Moves the anchors by `velocity` for `seconds`. */
  const run = (seconds: number, velocity = new Vector3()): void => {
    for (let i = 0; i < Math.round(seconds / FRAME); i++) {
      left.addScaledVector(velocity, FRAME);
      right.addScaledVector(velocity, FRAME);
      cloth.update(FRAME, left, right, BACK, velocity.length(), []);
    }
  };
  /** Longest strand, as a multiple of the cape's rest length. */
  const stretch = (): number => {
    let longest = 0;
    for (let column = 0; column < shape.columns; column++) {
      let length = 0;
      for (let row = 1; row < shape.rows; row++)
        length += point(row, column).distanceTo(point(row - 1, column));
      longest = Math.max(longest, length);
    }
    return longest / shape.length;
  };
  const middle = Math.floor(shape.columns / 2);
  return { cloth, left, right, point, run, stretch, middle };
}

describe('cape cloth', () => {
  it('hangs from the shoulders at rest, and flares toward the hem', () => {
    const cape = createCape();
    cape.run(3);
    const hem = cape.point(shape.rows - 1, cape.middle);
    expect(hem.y).toBeLessThan(2 - shape.length * 0.85);
    expect(Math.abs(hem.x)).toBeLessThan(0.1);
    const hemWidth = cape
      .point(shape.rows - 1, 0)
      .distanceTo(cape.point(shape.rows - 1, shape.columns - 1));
    // Hanging cloth gathers into folds, so it is narrower than when spread, but still flares.
    expect(hemWidth).toBeGreaterThan(shape.topWidth * 1.1);
    // Pinned corners stay exactly on the anchors.
    expect(cape.point(0, 0).distanceTo(cape.left)).toBeLessThan(1e-6);
    expect(cape.point(0, shape.columns - 1).distanceTo(cape.right)).toBeLessThan(1e-6);
  });

  it('streams out behind when the wearer flies, opposite to the direction of travel', () => {
    const cape = createCape();
    cape.run(2, new Vector3(0, 0, -90)); // flying -Z
    const hem = cape.point(shape.rows - 1, cape.middle);
    expect(hem.z - cape.left.z).toBeGreaterThan(shape.length * 0.75); // trailing in +Z
    expect(Math.abs(hem.y - 2)).toBeLessThan(shape.length * 0.5); // near level, not hanging
  });

  it('never stretches, even at extreme speed and through hard turns', () => {
    const cape = createCape();
    let worst = 0;
    const speeds = [
      new Vector3(0, 0, -250),
      new Vector3(250, 0, 0),
      new Vector3(0, -200, 100),
      new Vector3(-250, 80, 0),
    ];
    for (const velocity of speeds) {
      for (let i = 0; i < 40; i++) {
        cape.run(FRAME, velocity);
        worst = Math.max(worst, cape.stretch());
      }
    }
    expect(worst).toBeLessThan(1.06);
  });

  it('settles back to hanging after flight stops', () => {
    const cape = createCape();
    cape.run(1.5, new Vector3(0, 0, -150));
    cape.run(4);
    const hem = cape.point(shape.rows - 1, cape.middle);
    expect(hem.y).toBeLessThan(cape.left.y - shape.length * 0.8);
  });

  it('stays outside the body', () => {
    const cape = createCape();
    const spine = { a: new Vector3(0, 0.6, -0.12), b: new Vector3(0, 2.1, -0.12), radius: 0.2 };
    for (let i = 0; i < 240; i++) cape.cloth.update(FRAME, cape.left, cape.right, BACK, 0, [spine]);
    for (let row = 1; row < shape.rows; row++) {
      for (let column = 0; column < shape.columns; column++) {
        const p = cape.point(row, column);
        const onAxis = new Vector3(0, Math.min(2.1, Math.max(0.6, p.y)), -0.12);
        expect(p.distanceTo(onAxis)).toBeGreaterThan(spine.radius - 0.01);
      }
    }
  });

  it('a teleport resets it instead of whipping it across the map', () => {
    const cape = createCape();
    cape.run(1);
    cape.left.x += 5000;
    cape.right.x += 5000;
    cape.cloth.update(FRAME, cape.left, cape.right, BACK, 0, []);
    for (let i = 0; i < cape.cloth.positions.length; i++)
      expect(Number.isFinite(cape.cloth.positions[i])).toBe(true);
    expect(cape.stretch()).toBeLessThan(1.06);
    expect(Math.abs(cape.point(shape.rows - 1, cape.middle).x - 5000)).toBeLessThan(1);
  });

  it('survives a long stalled frame', () => {
    const cape = createCape();
    cape.cloth.update(2, cape.left, cape.right, BACK, 0, []);
    cape.run(1);
    for (let i = 0; i < cape.cloth.positions.length; i++)
      expect(Number.isFinite(cape.cloth.positions[i])).toBe(true);
    expect(cape.stretch()).toBeLessThan(1.06);
  });
});
