import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  ExtrudeGeometry,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Shape,
  SphereGeometry,
  Vector3,
  type Scene,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FOLLOWER_STRIDE } from '../world/PathFollowers';

const UP = new Vector3(0, 1, 0);

export type FollowerKind = 'car' | 'person';

/** Height of the instance origin above the ground (see StreetLife). */
const CAR_ORIGIN = 0.75;
const PERSON_ORIGIN = 0.85;

interface PartOptions {
  /** Takes the instance's colour (car paint, a shirt) instead of `color`. */
  paint?: boolean;
  /** Lights: lit at night in their own colour. */
  glow?: boolean;
  /** Limbs: swing fore and aft about a pivot at this height, by this much (sign sets the phase). */
  swing?: readonly [amount: number, pivotY: number];
}

/** Tags a piece with the per-vertex attributes the follower shader reads. */
function part(geometry: BufferGeometry, color: number, options: PartOptions = {}): BufferGeometry {
  const piece = geometry.index ? geometry.toNonIndexed() : geometry;
  const count = piece.getAttribute('position').count;
  const tint = new Color(color);
  const colors = new Float32Array(count * 3);
  const paint = new Float32Array(count).fill(options.paint ? 1 : 0);
  const glow = new Float32Array(count).fill(options.glow ? 1 : 0);
  const swing = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    colors.set([tint.r, tint.g, tint.b], i * 3);
    swing.set(options.swing ?? [0, 0], i * 2);
  }
  piece.setAttribute('color', new BufferAttribute(colors, 3));
  piece.setAttribute('aPaint', new BufferAttribute(paint, 1));
  piece.setAttribute('aGlow', new BufferAttribute(glow, 1));
  piece.setAttribute('aSwing', new BufferAttribute(swing, 2));
  piece.deleteAttribute('uv');
  return piece;
}

function box(
  width: number,
  height: number,
  depth: number,
  x: number,
  y: number,
  z: number,
): BufferGeometry {
  return new BoxGeometry(width, height, depth).translate(x, y, z);
}

/** A side profile, as (z, y) points with -z the front, extruded across the car's width. */
function profile(
  points: readonly (readonly [number, number])[],
  width: number,
  x: number,
): BufferGeometry {
  const shape = new Shape();
  points.forEach(([z, y], index) => (index === 0 ? shape.moveTo(-z, y) : shape.lineTo(-z, y)));
  const solid = new ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
  // The shape lies in XY and is extruded along Z; turn it so the extrusion runs across the car.
  return solid
    .translate(0, 0, -width / 2)
    .rotateY(Math.PI / 2)
    .translate(x, 0, 0);
}

/** A flat four-cornered panel, corners given counter-clockwise as seen from outside. */
function panel(corners: readonly (readonly [number, number, number])[]): BufferGeometry {
  const [a, b, c, d] = corners;
  const geometry = new BufferGeometry();
  if (!a || !b || !c || !d) return geometry;
  geometry.setAttribute(
    'position',
    new BufferAttribute(new Float32Array([...a, ...b, ...c, ...a, ...c, ...d]), 3),
  );
  geometry.computeVertexNormals();
  return geometry;
}

const GLASS = 0x10151c;
const TYRE = 0x121316;
const TRIM = 0x1c1e22;

/**
 * A saloon car, about 4.4 m long, facing -Z: a shaped body in the instance's
 * paint colour, dark glass, wheels, bumpers and lights.
 */
function createCar(): BufferGeometry {
  const ground = -CAR_ORIGIN;
  const y = (height: number): number => ground + height;
  const pieces: BufferGeometry[] = [];
  const body = [
    [2.2, y(0.28)],
    [2.2, y(0.78)],
    [2.12, y(0.9)],
    [1.5, y(0.94)],
    [0.98, y(1.4)],
    [-0.32, y(1.42)],
    [-1.02, y(0.96)],
    [-2.05, y(0.84)],
    [-2.2, y(0.68)],
    [-2.2, y(0.28)],
  ] as const;
  pieces.push(part(profile(body, 1.8, 0), 0xffffff, { paint: true }));

  // Glass: side windows, windscreen and rear window, set just proud of the body.
  const side = [
    [1.34, y(0.98)],
    [0.92, y(1.34)],
    [-0.36, y(1.36)],
    [-0.92, y(0.99)],
  ] as const;
  for (const x of [-0.905, 0.905]) pieces.push(part(profile(side, 0.02, x), GLASS));
  const out = 0.015;
  pieces.push(
    part(
      panel([
        [-0.78, y(1.0) + out, -0.98 - out],
        [0.78, y(1.0) + out, -0.98 - out],
        [0.72, y(1.38) + out, -0.38 - out],
        [-0.72, y(1.38) + out, -0.38 - out],
      ]),
      GLASS,
    ),
    part(
      panel([
        [0.78, y(0.98) + out, 1.44 + out],
        [-0.78, y(0.98) + out, 1.44 + out],
        [-0.72, y(1.36) + out, 1.02 + out],
        [0.72, y(1.36) + out, 1.02 + out],
      ]),
      GLASS,
    ),
  );

  // Sills and bumpers, then wheels with pale hubs.
  pieces.push(part(box(1.84, 0.16, 4.44, 0, y(0.3), 0), TRIM));
  for (const x of [-0.84, 0.84]) {
    for (const z of [-1.36, 1.4]) {
      const wheel = new CylinderGeometry(0.33, 0.33, 0.24, 14).rotateZ(Math.PI / 2);
      pieces.push(part(wheel.translate(x, y(0.33), z), TYRE));
      const hub = new CylinderGeometry(0.17, 0.17, 0.26, 10).rotateZ(Math.PI / 2);
      pieces.push(part(hub.translate(x, y(0.33), z), 0x8d9299));
    }
  }
  for (const x of [-0.62, 0.62]) {
    pieces.push(part(box(0.4, 0.13, 0.06, x, y(0.72), -2.2), 0xfff2cf, { glow: true }));
    pieces.push(part(box(0.36, 0.12, 0.06, x, y(0.74), 2.2), 0xc0141a, { glow: true }));
  }
  return merge(pieces);
}

/** A person about 1.75 m tall, facing -Z: the instance colour is their top; limbs swing as they walk. */
function createPerson(): BufferGeometry {
  const ground = -PERSON_ORIGIN;
  const y = (height: number): number => ground + height;
  const hip = y(0.86);
  const shoulder = y(1.42);
  const pieces: BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const leg = box(0.15, 0.8, 0.17, side * 0.1, y(0.46), 0);
    pieces.push(part(leg, 0x2a2f3a, { swing: [side * 0.5, hip] }));
    pieces.push(
      part(box(0.15, 0.08, 0.26, side * 0.1, y(0.04), -0.04), 0x191a1d, {
        swing: [side * 0.5, hip],
      }),
    );
    const arm = box(0.1, 0.56, 0.11, side * 0.265, y(1.15), 0);
    pieces.push(part(arm, 0xffffff, { paint: true, swing: [-side * 0.4, shoulder] }));
    pieces.push(
      part(box(0.09, 0.1, 0.1, side * 0.265, y(0.82), 0), 0xc79a7b, {
        swing: [-side * 0.4, shoulder],
      }),
    );
  }
  // Torso narrower at the waist than the shoulders.
  const torso = new CylinderGeometry(0.23, 0.17, 0.6, 8).scale(1, 1, 0.6).translate(0, y(1.16), 0);
  pieces.push(part(torso, 0xffffff, { paint: true }));
  pieces.push(part(box(0.3, 0.14, 0.2, 0, y(0.84), 0), 0x2a2f3a));
  pieces.push(part(new CylinderGeometry(0.05, 0.055, 0.1, 6).translate(0, y(1.5), 0), 0xc79a7b));
  pieces.push(
    part(new IcosahedronGeometry(0.115, 1).scale(0.9, 1.08, 1).translate(0, y(1.63), 0), 0xc79a7b),
  );
  const hair = new SphereGeometry(0.122, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.55);
  pieces.push(part(hair.translate(0, y(1.645), 0.012), 0x2b1d14));
  return merge(pieces);
}

function merge(pieces: BufferGeometry[]): BufferGeometry {
  const merged = mergeGeometries(pieces, false);
  for (const piece of pieces) piece.dispose();
  if (!merged) throw new Error('Follower geometry could not be merged');
  return merged;
}

/**
 * Draws vehicles or pedestrians from a packed buffer (x, y, z, yaw, scale per
 * instance) as one instanced mesh: one draw call per kind. The model is built
 * here from primitives; a per-vertex flag says which parts take the instance's
 * colour, so one mesh gives every car its own paint and every walker their own top.
 */
export class FollowerRenderer {
  /** Shared by every instance. Its emissive red channel is how brightly lights burn (night). */
  readonly material = new MeshStandardMaterial({ roughness: 0.55, vertexColors: true });
  private readonly mesh: InstancedMesh;
  private readonly matrix = new Matrix4();
  private readonly position = new Vector3();
  private readonly rotation = new Quaternion();
  private readonly scale = new Vector3();
  private readonly color = new Color();
  private readonly time = { value: 0 };

  constructor(scene: Scene, capacity: number, kind: FollowerKind) {
    const geometry = kind === 'car' ? createCar() : createPerson();
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.time;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          attribute float aPaint;
          attribute float aGlow;
          attribute vec2 aSwing;
          uniform float uTime;
          varying float vGlow;`,
        )
        .replace(
          '#include <color_vertex>',
          `#include <color_vertex>
          vColor.rgb = mix(color.rgb, instanceColor.rgb, aPaint);
          vGlow = aGlow;`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          // Each walker keeps their own step, taken from where they stand.
          float stride = uTime * 7.5 + instanceMatrix[3].x * 0.9 + instanceMatrix[3].z * 1.7;
          transformed.z += aSwing.x * sin(stride) * (aSwing.y - position.y);`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vGlow;')
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          totalEmissiveRadiance = totalEmissiveRadiance.r * vColor.rgb * vGlow * 9.0;`,
        );
    };
    geometry.computeBoundingBox();
    this.mesh = new InstancedMesh(geometry, this.material, Math.max(1, capacity));
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.count = 0;
    this.mesh.setColorAt(0, this.color);
    scene.add(this.mesh);
  }

  /** Triangles in one instance. */
  get trianglesEach(): number {
    return this.mesh.geometry.getAttribute('position').count / 3;
  }

  update(buffer: Float32Array, colors: Uint32Array, count: number, frameDelta = 0): void {
    this.time.value += frameDelta;
    for (let i = 0; i < count; i++) {
      const base = i * FOLLOWER_STRIDE;
      const fade = buffer[base + 4] ?? 1;
      this.position.set(buffer[base] ?? 0, buffer[base + 1] ?? 0, buffer[base + 2] ?? 0);
      this.rotation.setFromAxisAngle(UP, buffer[base + 3] ?? 0);
      // Grow from the ground, not from the middle, as an instance fades in.
      this.position.y += (1 - fade) * (this.mesh.geometry.boundingBox?.min.y ?? 0);
      this.scale.setScalar(fade);
      this.mesh.setMatrixAt(i, this.matrix.compose(this.position, this.rotation, this.scale));
      this.mesh.setColorAt(i, this.color.setHex(colors[i] ?? 0xffffff));
    }
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
