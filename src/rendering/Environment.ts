import {
  DirectionalLight,
  GridHelper,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  type Scene,
} from 'three';

const GRID_CELL = 50;
const LAND_COLOR = 0x6b7078;
const WATER_COLOR = 0x2f6f96;
/** Water is drawn slightly below the land so the shoreline does not z-fight. */
const WATER_Y = -0.4;
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

/** Graybox lighting, land, ocean and a reference grid over the city core. */
export function addEnvironment(scene: Scene, options: EnvironmentOptions): void {
  const { worldHalfSize, shore, gridHalfSize } = options;

  scene.add(new HemisphereLight(0xcfe3ff, 0x4a4f5a, 1.2));
  const sun = new DirectionalLight(0xffffff, 2);
  sun.position.set(30, 60, 20);
  scene.add(sun);

  const water = new Mesh(
    new PlaneGeometry(worldHalfSize * 2, worldHalfSize * 2),
    new MeshStandardMaterial({ color: WATER_COLOR, roughness: 0.35, metalness: 0.2 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = WATER_Y;
  scene.add(water);

  // Land covers everything north and west of the shore lines.
  const landSize = worldHalfSize + shore;
  const land = new Mesh(
    new PlaneGeometry(landSize, landSize),
    new MeshStandardMaterial({ color: LAND_COLOR, roughness: 1 }),
  );
  land.rotation.x = -Math.PI / 2;
  land.position.set(shore - landSize / 2, 0, shore - landSize / 2);
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
}
