import {
  BoxGeometry,
  Color,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type Scene,
} from 'three';
import type { BuildingDescriptor } from '../world/Building';

/** Draws every box in the city as one instanced mesh (one draw call). */
export function addBuildings(scene: Scene, buildings: readonly BuildingDescriptor[]): void {
  const mesh = new InstancedMesh(
    new BoxGeometry(1, 1, 1),
    new MeshStandardMaterial({ roughness: 0.9 }),
    buildings.length,
  );
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
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  // The city surrounds the camera, so culling the whole mesh would never help.
  mesh.frustumCulled = false;
  scene.add(mesh);
}
