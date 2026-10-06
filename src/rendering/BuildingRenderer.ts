import {
  BoxGeometry,
  Color,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type Scene,
} from 'three';
import type { BuildingDescriptor } from '../world/Building';

/** Handle for the lighting pass (day/night) to drive lit windows. */
export interface BuildingMaterialControls {
  /** 0 = no windows lit, 1 = city at night. */
  setWindowLight(amount: number): void;
}

const DAYTIME_WINDOW_LIGHT = 0.25;

/**
 * Draws every box in the city as one instanced mesh (one draw call).
 *
 * Boxes flagged `windows` get a procedural facade in the shader: a window grid
 * in real metres with corner piers, a ground-floor band and a parapet, glass
 * tint varied per window, and a share of windows lit. No textures. The pattern
 * fades to its average tone with distance so far towers do not shimmer.
 */
export function addBuildings(
  scene: Scene,
  buildings: readonly BuildingDescriptor[],
): BuildingMaterialControls {
  const material = new MeshStandardMaterial({ roughness: 0.85 });
  const windowLight = { value: DAYTIME_WINDOW_LIGHT };

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindowLight = windowLight;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aWindows;
        flat varying float vWindows;
        varying vec3 vBoxPosition;
        varying vec3 vBoxNormal;
        flat varying vec3 vBoxSize;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vWindows = aWindows;
        vBoxPosition = position;
        vBoxNormal = normal;
        vBoxSize = vec3(
          length(instanceMatrix[0].xyz),
          length(instanceMatrix[1].xyz),
          length(instanceMatrix[2].xyz)
        );`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uWindowLight;
        flat varying float vWindows;
        varying vec3 vBoxPosition;
        varying vec3 vBoxNormal;
        flat varying vec3 vBoxSize;
        float facadeHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float facadeLit = 0.0;
        vec3 boxNormal = abs(vBoxNormal);
        if (vWindows > 0.5 && boxNormal.y < 0.5) {
          bool alongZ = boxNormal.x > 0.5;
          float faceWidth = alongZ ? vBoxSize.z : vBoxSize.x;
          float u = (alongZ ? vBoxPosition.z : vBoxPosition.x) * faceWidth;
          float v = (vBoxPosition.y + 0.5) * vBoxSize.y;

          // Window cells in metres, centred on the face.
          vec2 cell = vec2(3.2, 3.6);
          vec2 grid = vec2(u / cell.x + 0.5, v / cell.y);
          vec2 cellId = floor(grid);
          vec2 inCell = fract(grid);
          // Whole-number seed: a fractional one makes the hash flicker within a window.
          float seed = floor(mod(dot(vBoxSize, vec3(12.9, 78.2, 37.7)), 97.0)) + (alongZ ? 17.0 : 0.0);

          float window = step(0.16, inCell.x) * step(inCell.x, 0.84)
                       * step(0.22, inCell.y) * step(inCell.y, 0.82);
          // Corner piers, a ground floor, and a parapet stay solid wall.
          float groundFloor = 4.4;
          float walls = step(-faceWidth * 0.5 + 1.1, u) * step(u, faceWidth * 0.5 - 1.1)
                      * step(groundFloor, v) * step(v, vBoxSize.y - 1.4);
          window *= walls;

          // Far away, replace the pattern by its average so it does not shimmer.
          float detail = clamp(1.0 - max(fwidth(grid.x), fwidth(grid.y)) * 1.6, 0.0, 1.0);
          float coverage = mix(0.38 * walls, window, detail);

          float tint = facadeHash(cellId + seed);
          vec3 glass = mix(vec3(0.07, 0.10, 0.15), vec3(0.30, 0.44, 0.56), tint * 0.7);
          diffuseColor.rgb = mix(diffuseColor.rgb, glass, coverage);
          // Shopfront band at street level.
          diffuseColor.rgb *= mix(0.62, 1.0, step(groundFloor, v));

          facadeLit = window * detail * step(1.0 - uWindowLight * 0.6, facadeHash(cellId + seed + 3.1));
        }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(1.0, 0.82, 0.52) * facadeLit * (0.35 + uWindowLight);`,
      );
  };

  const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), material, buildings.length);
  const windows = new Float32Array(buildings.length);
  const matrix = new Matrix4();
  const position = new Vector3();
  const scale = new Vector3();
  const rotation = new Quaternion();
  const color = new Color();

  buildings.forEach((building, index) => {
    position.set(building.x, building.y, building.z);
    scale.set(building.hx * 2, building.hy * 2, building.hz * 2);
    mesh.setMatrixAt(index, matrix.compose(position, rotation, scale));
    mesh.setColorAt(index, color.setHex(building.color));
    windows[index] = building.windows ? 1 : 0;
  });
  mesh.geometry.setAttribute('aWindows', new InstancedBufferAttribute(windows, 1));
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  // The city surrounds the camera, so culling the whole mesh would never help.
  mesh.frustumCulled = false;
  scene.add(mesh);

  return {
    setWindowLight(amount: number): void {
      windowLight.value = amount;
    },
  };
}
