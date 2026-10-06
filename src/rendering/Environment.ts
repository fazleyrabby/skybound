import { GridHelper, Mesh, MeshStandardMaterial, PlaneGeometry, type Scene } from 'three';

const GRID_CELL = 50;
const LAND_COLOR = 0x6b7078;
/** Kept faint: thin high-contrast lines shimmer when seen from far away. */
const GRID_OPACITY = 0.3;

export interface EnvironmentOptions {
  /** Half size of everything the player can reach. */
  worldHalfSize: number;
  /** Land ends at this x and z on the east and south sides. */
  shore: number;
  /** Half size of the area that gets street-scale grid lines. */
  gridHalfSize: number;
}

export interface EnvironmentMaterials {
  land: MeshStandardMaterial;
}

/** Land and a reference grid over the city core. The ocean is `Water`; lighting is `Atmosphere`. */
export function addEnvironment(scene: Scene, options: EnvironmentOptions): EnvironmentMaterials {
  const { worldHalfSize, shore, gridHalfSize } = options;

  // Land covers everything north and west of the shore lines.
  const landSize = worldHalfSize + shore;
  const land = new Mesh(
    new PlaneGeometry(landSize, landSize),
    new MeshStandardMaterial({ color: LAND_COLOR, roughness: 1 }),
  );
  land.rotation.x = -Math.PI / 2;
  land.position.set(shore - landSize / 2, 0, shore - landSize / 2);
  land.receiveShadow = true;
  scene.add(land);

  // The grid gives the eye a speed reference at street level.
  const grid = new GridHelper(gridHalfSize * 2, (gridHalfSize * 2) / GRID_CELL, 0x2b3550, 0x555c69);
  grid.position.y = 0.04;
  for (const material of [grid.material].flat()) {
    material.transparent = true;
    material.opacity = GRID_OPACITY;
    material.depthWrite = false;
  }
  scene.add(grid);

  return { land: land.material };
}
