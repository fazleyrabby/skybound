import { Vector3 } from 'three';

const toCentre = new Vector3();

/**
 * Distance along the segment at which it enters the sphere, 0 if it starts
 * inside, or -1 if it misses.
 */
export function sphereEntry(
  origin: Vector3,
  direction: Vector3,
  length: number,
  centre: Vector3,
  radius: number,
): number {
  toCentre.copy(centre).sub(origin);
  if (toCentre.lengthSq() <= radius * radius) return 0;
  const along = toCentre.dot(direction);
  if (along < 0) return -1;
  const offsetSq = toCentre.lengthSq() - along * along;
  if (offsetSq > radius * radius) return -1;
  const entry = along - Math.sqrt(radius * radius - offsetSq);
  return entry <= length ? entry : -1;
}
