import { InstancedMesh, Scene } from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { Config } from '../../src/core/Config';
import { FollowerRenderer } from '../../src/rendering/FollowerRenderer';
import { PRESETS, writePreset } from '../../src/rendering/QualitySettings';
import { TreeRenderer } from '../../src/rendering/TreeRenderer';
import { generateCity } from '../../src/world/CityGenerator';
import { FOLLOWER_STRIDE } from '../../src/world/PathFollowers';

function meshOf(scene: Scene): InstancedMesh {
  const mesh = scene.children.find((child) => child instanceof InstancedMesh);
  if (!(mesh instanceof InstancedMesh)) throw new Error('no instanced mesh');
  return mesh;
}

describe('street models', () => {
  it('a car is a shaped body with glass, wheels and lights, cheap enough for a street full', () => {
    const scene = new Scene();
    const cars = new FollowerRenderer(scene, 10, 'car');
    const geometry = meshOf(scene).geometry;
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    expect(cars.trianglesEach).toBeGreaterThan(150);
    expect(cars.trianglesEach).toBeLessThan(900);
    // About 4.4 m long, 1.9 m wide, 1.4 m tall, wheels on the ground under the origin.
    expect(box.max.z - box.min.z).toBeCloseTo(4.44, 1);
    expect(box.max.x - box.min.x).toBeGreaterThan(1.8);
    expect(box.max.x - box.min.x).toBeLessThan(2.1);
    expect(box.min.y).toBeCloseTo(-0.75, 1);
    expect(box.max.y - box.min.y).toBeGreaterThan(1.3);
    // Some of it takes the paint colour, some is glass and tyre, and it has lights.
    const paint = Array.from(geometry.getAttribute('aPaint').array);
    const glow = Array.from(geometry.getAttribute('aGlow').array);
    expect(paint.some((value) => value === 1)).toBe(true);
    expect(paint.some((value) => value === 0)).toBe(true);
    expect(glow.filter((value) => value === 1).length).toBeGreaterThan(40);
  });

  it('a person stands on the ground and has limbs that swing in opposite pairs', () => {
    const scene = new Scene();
    const people = new FollowerRenderer(scene, 10, 'person');
    const geometry = meshOf(scene).geometry;
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    expect(people.trianglesEach).toBeLessThan(400);
    expect(box.min.y).toBeCloseTo(-0.85, 2);
    expect(box.max.y - box.min.y).toBeGreaterThan(1.65);
    expect(box.max.y - box.min.y).toBeLessThan(1.85);
    const swing = geometry.getAttribute('aSwing');
    const position = geometry.getAttribute('position');
    let leftLeg = 0;
    let rightLeg = 0;
    for (let i = 0; i < swing.count; i++) {
      if (position.getY(i) > -0.1 || swing.getX(i) === 0) continue;
      if (position.getX(i) > 0) leftLeg += swing.getX(i);
      else rightLeg += swing.getX(i);
    }
    expect(leftLeg * rightLeg).toBeLessThan(0);
  });

  it('draws only the instances it is given, growing from the ground as they fade in', () => {
    const scene = new Scene();
    const cars = new FollowerRenderer(scene, 4, 'car');
    const buffer = new Float32Array(4 * FOLLOWER_STRIDE);
    buffer.set([10, 0.75, 20, 0, 1], 0);
    buffer.set([30, 0.75, 40, 0, 0.5], FOLLOWER_STRIDE);
    cars.update(buffer, new Uint32Array([0xff0000, 0x00ff00, 0, 0]), 2, 1 / 60);
    const mesh = meshOf(scene);
    expect(mesh.count).toBe(2);
    const elements = mesh.instanceMatrix.array;
    expect(elements[13]).toBeCloseTo(0.75, 5);
    // Half-grown: the wheels are still on the road, so the origin sits lower.
    mesh.geometry.computeBoundingBox();
    const wheels = mesh.geometry.boundingBox!.min.y;
    expect(elements[16 + 13]).toBeCloseTo(0.75 + 0.5 * wheels, 5);
    expect(elements[16 + 13]).toBeLessThan(0.5);
  });
});

describe('tree density', () => {
  afterEach(() => writePreset('HIGH'));

  it('a lower preset thins the lighter trees everywhere and leaves the park alone', () => {
    const city = generateCity(1337);
    const scene = new Scene();
    const trees = new TreeRenderer(scene, city.trees);
    const light = city.trees.filter((tree) => !tree.detail).length;
    writePreset('HIGH');
    trees.update(0, 0);
    expect(trees.drawn).toBe(light);
    writePreset('LOW');
    trees.update(0, 0);
    expect(trees.drawn).toBeGreaterThan(light * (PRESETS.LOW.trees - 0.01));
    expect(trees.drawn).toBeLessThan(light * (PRESETS.LOW.trees + 0.01));
    expect(Config.quality.trees).toBe(PRESETS.LOW.trees);
    // Eight instanced meshes: canopy and trunk, two species, two levels of detail.
    expect(scene.children.filter((child) => child instanceof InstancedMesh)).toHaveLength(8);
  });

  it('the whole city of trees fits the triangle budget', () => {
    const scene = new Scene();
    new TreeRenderer(scene, generateCity(1337).trees);
    let triangles = 0;
    for (const child of scene.children) {
      if (!(child instanceof InstancedMesh)) continue;
      const geometry = child.geometry;
      const each = (geometry.index?.count ?? geometry.getAttribute('position').count) / 3;
      triangles += each * child.count;
    }
    expect(triangles).toBeLessThan(700_000);
  });
});
