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
  /** `amount`: share of windows lit, 0..1. `night`: 0 by day .. 1 at night, lights lamps and signs. */
  setWindowLight(amount: number, night: number): void;
}

const DAYTIME_WINDOW_LIGHT = 0.25;

/**
 * Draws every box in the city as one instanced mesh (one draw call).
 *
 * Boxes flagged `windows` get a procedural facade in the shader, in real
 * metres: one of four kinds of glazing per tower, corner piers, shopfronts and
 * awnings at street level, a cornice, glass that mirrors the sky, a share of
 * windows lit, and a gravel roof inside a parapet. Boxes flagged `road` get
 * lane markings. No textures. Every edge is antialiased and the pattern fades
 * to its average tone with distance, so nothing shimmers as the camera moves.
 */
export function addBuildings(
  scene: Scene,
  buildings: readonly BuildingDescriptor[],
): BuildingMaterialControls {
  const material = new MeshStandardMaterial({ roughness: 0.85 });
  const windowLight = { value: DAYTIME_WINDOW_LIGHT };
  const night = { value: 0 };

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindowLight = windowLight;
    shader.uniforms.uNight = night;
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
        uniform float uNight;
        flat varying float vWindows;
        varying vec3 vBoxPosition;
        varying vec3 vBoxNormal;
        flat varying vec3 vBoxSize;
        float facadeHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        // Every edge in the pattern is as wide as a pixel, so nothing crawls when the camera moves.
        float aaStep(float edge, float x) {
          float w = fwidth(x) * 0.75 + 1e-5;
          return smoothstep(edge - w, edge + w, x);
        }
        float aaBand(float low, float high, float x) {
          return aaStep(low, x) * (1.0 - aaStep(high, x));
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float facadeLit = 0.0;
        float facadeGlass = 0.0;
        float facadeWarmth = 0.5;
        vec3 boxNormal = abs(vBoxNormal);
        float daylight = 1.0 - uNight;
        // Lamp heads and signs (flag 2) glow in their own colour once it gets dark.
        vec3 facadeGlow = vWindows > 1.5 && vWindows < 2.5 ? diffuseColor.rgb * uNight * 1.6 : vec3(0.0);

        if (vWindows > 0.5 && vWindows < 1.5 && boxNormal.y < 0.5) {
          bool alongZ = boxNormal.x > 0.5;
          float faceWidth = alongZ ? vBoxSize.z : vBoxSize.x;
          float u = (alongZ ? vBoxPosition.z : vBoxPosition.x) * faceWidth;
          float v = (vBoxPosition.y + 0.5) * vBoxSize.y;
          float height = vBoxSize.y;
          vec3 wall = diffuseColor.rgb;

          // Whole-number seeds: a fractional one makes the hash flicker within a window.
          // The box seed varies the windows; the colour seed is shared by every tier of
          // a tower, so the whole tower wears one kind of facade.
          float seed = floor(mod(dot(vBoxSize, vec3(12.9, 78.2, 37.7)), 97.0)) + (alongZ ? 17.0 : 0.0);
          float look = facadeHash(vec2(floor(dot(wall, vec3(911.0, 1733.0, 2579.0))), 5.0));

          // Four kinds of facade: punched windows in masonry, ribbon glazing,
          // a glass curtain wall, and smaller residential windows.
          vec2 cell = vec2(3.2, 3.6);
          vec4 pane = vec4(0.18, 0.82, 0.24, 0.80);
          float pier = 1.1;
          float curtain = 0.0;
          if (look < 0.30) {
            cell = vec2(1.6, 3.6); pane = vec4(0.05, 0.95, 0.30, 0.84);
          } else if (look < 0.58) {
            cell = vec2(1.8, 3.6); pane = vec4(0.05, 0.95, 0.07, 0.93); pier = 0.35; curtain = 1.0;
          } else if (look < 0.78) {
            cell = vec2(2.8, 3.1); pane = vec4(0.27, 0.73, 0.26, 0.76);
          }

          float groundFloor = min(4.6, height * 0.45);
          vec2 grid = vec2(u / cell.x + 0.5, (v - groundFloor) / cell.y);
          vec2 cellId = floor(grid);
          vec2 inCell = fract(grid);
          float window = aaBand(pane.x, pane.y, inCell.x) * aaBand(pane.z, pane.w, inCell.y);
          float average = (pane.y - pane.x) * (pane.w - pane.z);
          // Corner piers, the ground floor and a parapet stay solid wall.
          float between = aaBand(-faceWidth * 0.5 + pier, faceWidth * 0.5 - pier, u);
          float walls = between * aaStep(groundFloor, v) * (1.0 - aaStep(height - 1.4, v));

          // Once a window is smaller than a pixel or two, show the facade's average
          // tone instead of the pattern: that is what stops distant towers shimmering.
          float density = max(fwidth(grid.x), fwidth(grid.y));
          float detail = 1.0 - smoothstep(0.22, 0.6, density);
          float coverage = mix(average, window, detail) * walls;

          // Masonry: a shadow line under each floor, grime toward the street, a cornice.
          wall *= 1.0 - 0.1 * detail * (1.0 - aaBand(0.04, 0.96, inCell.y)) * step(groundFloor, v);
          wall *= mix(0.84, 1.0, smoothstep(0.0, 14.0, v));
          wall *= mix(1.0, 0.78, aaStep(height - 1.4, v));
          wall *= 1.0 + 0.25 * aaBand(height - 1.4, height - 1.05, v);
          wall = mix(wall, wall * 0.55, curtain * walls);

          // Glass: dark, tinted per pane, some with blinds drawn, and mirroring the sky
          // more the more steeply it is seen.
          float tint = mix(0.5, facadeHash(cellId + seed), detail);
          vec3 glass = mix(vec3(0.045, 0.06, 0.085), vec3(0.16, 0.25, 0.36), tint * 0.7);
          float blinds = step(0.88, facadeHash(cellId + seed + 7.7)) * detail;
          glass = mix(glass, vec3(0.5, 0.48, 0.44), blinds * 0.55);
          float grazing = 1.0 - abs(dot(normalize(vViewPosition), normalize(vNormal)));
          vec3 sky = mix(vec3(0.62, 0.74, 0.9), vec3(0.3, 0.5, 0.85), clamp(v / 160.0, 0.0, 1.0));
          glass += sky * (0.08 + 0.5 * grazing * grazing) * daylight * (1.0 - blinds);

          // Street level: shopfronts between piers, under an awning or a fascia.
          float bay = u / 6.4 + 0.5;
          float shops = 1.0 - smoothstep(0.2, 0.6, fwidth(bay));
          float shopGlass = aaBand(0.08, 0.92, fract(bay)) * aaBand(0.45, groundFloor - 1.3, v) * between * shops;
          float fascia = aaBand(groundFloor - 1.1, groundFloor - 0.25, v) * between * step(3.0, groundFloor);
          vec3 awning = 0.32 + 0.28 * cos(6.2831 * (facadeHash(vec2(seed, 2.0)) + vec3(0.0, 0.33, 0.67)));
          wall = mix(wall, mix(wall * 0.5, awning, step(0.45, facadeHash(vec2(seed, 9.0)))), fascia);
          wall *= mix(0.72, 1.0, aaStep(groundFloor, v));

          diffuseColor.rgb = mix(wall, glass, coverage);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.065, 0.08) + sky * 0.12 * daylight, shopGlass);
          facadeGlass = max(coverage, shopGlass);

          // A share of windows lit; far away, the same light spread evenly.
          float share = uWindowLight * 0.42;
          float litPane = step(1.0 - share, facadeHash(cellId + seed + 3.1));
          // Not every lit room is equally bright.
          litPane *= 0.45 + 0.55 * facadeHash(cellId + seed + 5.3);
          facadeLit = mix(average * share * 0.72, window * litPane, detail) * walls + shopGlass * 0.4 * uNight;
          facadeWarmth = mix(0.5, facadeHash(cellId + seed + 11.9), detail);
        } else if (vWindows > 0.5 && vWindows < 1.5 && vBoxNormal.y > 0.5) {
          // Roofs: gravel inside a parapet.
          vec2 across = vec2(vBoxPosition.x * vBoxSize.x, vBoxPosition.z * vBoxSize.z);
          float inset = min(vBoxSize.x * 0.5 - abs(across.x), vBoxSize.z * 0.5 - abs(across.y));
          float gravel = 0.92 + 0.16 * facadeHash(floor(across * 1.5));
          gravel = mix(1.0, gravel, 1.0 - smoothstep(0.2, 0.7, fwidth(across.x) * 1.5));
          vec3 roof = vec3(0.2, 0.205, 0.215) * gravel;
          // Roofing takes some of the building's own colour, so a district seen from above is not all grey.
          roof = mix(roof, diffuseColor.rgb * 0.55, 0.45);
          diffuseColor.rgb = mix(diffuseColor.rgb * 0.8, roof, aaStep(0.7, inset));
        } else if (vWindows > 2.5 && vBoxNormal.y > 0.5) {
          // Road surface: edge lines, and a centre line or lane dashes by width.
          bool runsX = vBoxSize.x > vBoxSize.z;
          float width = runsX ? vBoxSize.z : vBoxSize.x;
          float along = (runsX ? vBoxPosition.x * vBoxSize.x : vBoxPosition.z * vBoxSize.z);
          float side = abs((runsX ? vBoxPosition.z : vBoxPosition.x) * width);
          // A painted line thinner than a pixel dims instead of sparkling.
          float thin = clamp(0.16 / max(fwidth(side), 1e-4), 0.0, 1.0);
          float dashes = aaBand(0.0, 0.5, fract(along / 9.0)) * clamp(2.0 / max(fwidth(along), 1e-4), 0.0, 1.0);
          float white = aaBand(width * 0.5 - 0.8, width * 0.5 - 0.6, side);
          float yellow = 0.0;
          if (width > 20.0) {
            yellow = aaBand(0.12, 0.3, side);
            white += aaBand(width * 0.25 - 0.09, width * 0.25 + 0.09, side) * dashes;
          } else if (width > 9.0) {
            white += (1.0 - aaStep(0.09, side)) * dashes;
          }
          vec3 asphalt = diffuseColor.rgb * (0.94 + 0.12 * facadeHash(floor(vec2(along, side) * 0.5)));
          diffuseColor.rgb = mix(diffuseColor.rgb, asphalt, thin);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.72), clamp(white, 0.0, 1.0) * thin * 0.85);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.75, 0.56, 0.12), yellow * thin * 0.9);
        }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.22, facadeGlass);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        // Warm lamps in most rooms, cold office light in some.
        vec3 lamp = mix(vec3(1.0, 0.72, 0.4), vec3(0.72, 0.84, 1.0), smoothstep(0.7, 0.85, facadeWarmth));
        totalEmissiveRadiance += lamp * facadeLit * (0.2 + 0.5 * uWindowLight) * (0.12 + 0.88 * uNight) + facadeGlow;`,
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
    windows[index] = building.glow ? 2 : building.road ? 3 : building.windows ? 1 : 0;
  });
  mesh.geometry.setAttribute('aWindows', new InstancedBufferAttribute(windows, 1));
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  // The city surrounds the camera, so culling the whole mesh would never help.
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  return {
    setWindowLight(amount: number, nightAmount: number): void {
      windowLight.value = amount;
      night.value = nightAmount;
    },
  };
}
