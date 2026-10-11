import { Mesh, MeshStandardMaterial, PlaneGeometry, type Scene } from 'three';

export interface EnvironmentOptions {
  /** Half size of everything the player can reach. */
  worldHalfSize: number;
  /** Land ends at this x and z on the east and south sides. */
  shore: number;
  /** Half size of the paved city core. */
  coreHalfSize: number;
}

export interface EnvironmentMaterials {
  land: MeshStandardMaterial;
}

/**
 * The land: one plane, shaded by where it is. Paving slabs through the built-up
 * area, giving way to grass, scrub and bare earth beyond it, and sand along the
 * shore. No textures and no grid lines: every pattern fades out before it gets
 * smaller than a pixel, so the ground holds still from any height. The ocean is
 * `Water`; lighting is `Atmosphere`.
 */
export function addEnvironment(scene: Scene, options: EnvironmentOptions): EnvironmentMaterials {
  const { worldHalfSize, shore, coreHalfSize } = options;
  const material = new MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
  const uniforms = { uShore: { value: shore }, uCore: { value: coreHalfSize } };

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vLand;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vLand = (modelMatrix * vec4(position, 1.0)).xz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uShore;
        uniform float uCore;
        varying vec2 vLand;
        float landHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        float landNoise(vec2 p) {
          vec2 cell = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(landHash(cell), landHash(cell + vec2(1.0, 0.0)), f.x),
            mix(landHash(cell + vec2(0.0, 1.0)), landHash(cell + vec2(1.0, 1.0)), f.x),
            f.y
          );
        }
        // Noise that fades to its mean once its features are smaller than a pixel.
        float landDetail(vec2 p, float scale) {
          float visible = 1.0 - smoothstep(0.35, 0.9, max(fwidth(p.x), fwidth(p.y)) * scale);
          return mix(0.5, landNoise(p * scale), visible);
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        // How built-up: 1 in the core, falling away through the suburbs.
        float fromCore = max(abs(vLand.x), abs(vLand.y)) - uCore;
        float broad = landNoise(vLand / 260.0) * 0.6 + landNoise(vLand / 90.0) * 0.4;
        float urban = 1.0 - smoothstep(40.0, 900.0, length(vLand) - uCore + (broad - 0.5) * 420.0);
        urban = max(urban, 1.0 - smoothstep(-20.0, 30.0, fromCore));

        // Paving: slabs with darker joints, mottled and stained.
        vec2 slab = vLand / 2.4;
        vec2 inSlab = abs(fract(slab) - 0.5);
        float jointWidth = max(fwidth(slab.x), fwidth(slab.y));
        float joint = smoothstep(0.5 - 0.03 - jointWidth, 0.5 - 0.03 + jointWidth, max(inSlab.x, inSlab.y));
        joint *= 1.0 - smoothstep(0.12, 0.45, jointWidth);
        float tone = landHash(floor(slab)) * (1.0 - smoothstep(0.2, 0.6, jointWidth));
        vec3 paving = vec3(0.3, 0.31, 0.33) * (0.9 + 0.12 * tone + 0.14 * (landDetail(vLand, 0.11) - 0.5));
        paving *= 1.0 - 0.3 * joint;

        // Open ground: grass, drier scrub and bare earth, in broad patches with fine grain.
        float patches = landNoise(vLand / 140.0) * 0.55 + landNoise(vLand / 37.0) * 0.3 + landDetail(vLand, 0.16) * 0.15;
        vec3 grass = mix(vec3(0.13, 0.25, 0.09), vec3(0.24, 0.31, 0.12), landDetail(vLand, 0.45));
        vec3 scrub = vec3(0.33, 0.32, 0.17);
        vec3 earth = vec3(0.34, 0.27, 0.19);
        vec3 open = mix(grass, scrub, smoothstep(0.45, 0.62, patches));
        open = mix(open, earth, smoothstep(0.66, 0.8, patches));
        open *= 0.86 + 0.28 * landDetail(vLand, 1.3);

        // A beach where the land meets the sea, outside the harbour.
        float toSea = uShore - max(vLand.x, vLand.y);
        vec3 sand = vec3(0.62, 0.55, 0.4) * (0.92 + 0.16 * landDetail(vLand, 0.9));
        float beach = (1.0 - smoothstep(6.0, 34.0 + broad * 30.0, toSea)) * (1.0 - urban);

        diffuseColor.rgb = mix(mix(open, paving, urban), sand, beach);`,
      );
  };

  // Land covers everything north and west of the shore lines.
  const landSize = worldHalfSize + shore;
  const land = new Mesh(new PlaneGeometry(landSize, landSize), material);
  land.rotation.x = -Math.PI / 2;
  land.position.set(shore - landSize / 2, 0, shore - landSize / 2);
  land.receiveShadow = true;
  scene.add(land);

  return { land: material };
}
