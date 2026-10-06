import type { BufferGeometry } from 'three';
import {
  BufferAttribute,
  Color,
  ConeGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type Scene,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { TreeKind, TreePlacement } from '../world/city/trees';

const UP = new Vector3(0, 1, 0);
/** Leaf tints, picked per tree. */
const BROADLEAF = [0x4f8f3f, 0x3f7a36, 0x5f9a46, 0x356b33, 0x6a9a3c] as const;
const CONIFER = [0x2c5e3a, 0x25523a, 0x356a40] as const;
const BARK = 0x5b4636;

/**
 * Trees as instanced meshes: one canopy and one trunk mesh per species, so the
 * whole city's trees are four draw calls. Unit trees are 1 m tall and scaled
 * per instance. Canopies are lumpy blobs (or stacked cones) with baked shading
 * and a shader that sways them in the wind and mottles the leaves.
 */
export class TreeRenderer {
  private readonly wind = { value: 1 };
  private readonly time = { value: 0 };

  constructor(scene: Scene, trees: readonly TreePlacement[]) {
    const canopyMaterial = this.createCanopyMaterial();
    const trunkMaterial = new MeshStandardMaterial({ color: BARK, roughness: 1 });

    for (const kind of ['broadleaf', 'conifer'] as const) {
      const group = trees.filter((tree) => tree.kind === kind);
      if (group.length === 0) continue;
      const canopy = new InstancedMesh(createCanopy(kind), canopyMaterial, group.length);
      const trunk = new InstancedMesh(createTrunk(kind), trunkMaterial, group.length);
      const matrix = new Matrix4();
      const position = new Vector3();
      const rotation = new Quaternion();
      const scale = new Vector3();
      const color = new Color();
      const tints = kind === 'conifer' ? CONIFER : BROADLEAF;

      group.forEach((tree, index) => {
        position.set(tree.x, 0, tree.z);
        rotation.setFromAxisAngle(UP, tree.turn);
        const width = tree.height * tree.spread;
        scale.set(width, tree.height, width);
        matrix.compose(position, rotation, scale);
        canopy.setMatrixAt(index, matrix);
        trunk.setMatrixAt(index, matrix);
        canopy.setColorAt(
          index,
          color.setHex(tints[Math.floor(tree.tint * tints.length)] ?? tints[0]),
        );
      });
      for (const mesh of [canopy, trunk]) {
        mesh.instanceMatrix.needsUpdate = true;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        // Trees are spread over the whole city; whole-mesh culling would never help.
        mesh.frustumCulled = false;
        scene.add(mesh);
      }
      if (canopy.instanceColor) canopy.instanceColor.needsUpdate = true;
    }
  }

  /** `rain` (0..1) strengthens the wind. */
  update(frameDelta: number, rain: number): void {
    this.time.value += frameDelta;
    this.wind.value = 1 + rain * 1.6;
  }

  private createCanopyMaterial(): MeshStandardMaterial {
    const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTreeTime = this.time;
      shader.uniforms.uTreeWind = this.wind;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform float uTreeTime;
          uniform float uTreeWind;
          varying vec3 vLeafPosition;`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vLeafPosition = position;
          // Sway grows with height; the phase comes from where the tree stands.
          vec4 treeBase = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float phase = treeBase.x * 0.21 + treeBase.z * 0.17;
          float sway = sin(uTreeTime * 1.3 + phase) * 0.028 + sin(uTreeTime * 2.9 + phase * 1.7) * 0.01;
          float lift = position.y * position.y * uTreeWind;
          transformed.x += sway * lift;
          transformed.z += sway * 0.6 * lift;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec3 vLeafPosition;`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          // Leaf clumps: break up the flat colour.
          float mottle = sin(vLeafPosition.x * 37.0) * sin(vLeafPosition.y * 41.0) * sin(vLeafPosition.z * 43.0);
          diffuseColor.rgb *= 0.9 + 0.16 * mottle;`,
        );
    };
    return material;
  }
}

/** A 1 m tall canopy with shading baked into vertex colours: darker underneath, lighter on top. */
function createCanopy(kind: TreeKind): BufferGeometry {
  const parts: BufferGeometry[] = [];
  if (kind === 'conifer') {
    // Stacked cones, narrowing upward.
    const tiers = 4;
    for (let i = 0; i < tiers; i++) {
      const t = i / (tiers - 1);
      const cone = new ConeGeometry(0.5 * (1 - t * 0.62), 0.34, 9, 1);
      cone.translate(0, 0.3 + t * 0.52, 0);
      parts.push(cone);
    }
  } else {
    // A few overlapping lumpy blobs.
    const blobs: ReadonlyArray<readonly [x: number, y: number, z: number, r: number]> = [
      [0, 0.66, 0, 0.34],
      [0.2, 0.58, 0.08, 0.26],
      [-0.18, 0.6, -0.12, 0.27],
      [0.02, 0.8, -0.04, 0.24],
    ];
    blobs.forEach(([x, y, z, radius], index) => {
      // The main blob gets the detail; the smaller ones can be coarser.
      const blob = new IcosahedronGeometry(radius, index === 0 ? 2 : 1);
      const positions = blob.getAttribute('position');
      for (let i = 0; i < positions.count; i++) {
        const px = positions.getX(i);
        const py = positions.getY(i);
        const pz = positions.getZ(i);
        const bump =
          1 +
          0.16 * Math.sin(px * 19 + index * 2.1) * Math.sin(py * 23 + index) * Math.sin(pz * 17);
        positions.setXYZ(i, px * bump, py * bump * 0.86, pz * bump);
      }
      blob.translate(x, y, z);
      parts.push(blob);
    });
  }
  // Icosahedra are non-indexed and cones indexed; make them match before merging.
  const merged = mergeGeometries(parts.map((part) => (part.index ? part.toNonIndexed() : part)));
  merged.computeVertexNormals();

  const positions = merged.getAttribute('position');
  const colors = new Float32Array(positions.count * 3);
  for (let i = 0; i < positions.count; i++) {
    const height = Math.min(1, Math.max(0, (positions.getY(i) - 0.3) / 0.65));
    const inward = 1 - Math.min(1, Math.hypot(positions.getX(i), positions.getZ(i)) / 0.4);
    const shade = 0.52 + 0.48 * height - 0.14 * inward * (1 - height);
    colors.set([shade, shade, shade], i * 3);
  }
  merged.setAttribute('color', new BufferAttribute(colors, 3));
  return merged;
}

function createTrunk(kind: TreeKind): BufferGeometry {
  const height = kind === 'conifer' ? 0.32 : 0.5;
  const trunk = new CylinderGeometry(0.022, 0.04, height, 7);
  trunk.translate(0, height / 2, 0);
  return trunk;
}
