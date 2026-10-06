export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Frame-rate independent exponential approach of `a` toward `b`.
 * Use this instead of `lerp(a, b, constant)` or `value *= drag` per frame.
 */
export function damp(a: number, b: number, lambda: number, dt: number): number {
  return lerp(a, b, 1 - Math.exp(-lambda * dt));
}

interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/** Component-wise `damp` of `current` toward `target`, in place. */
export function dampVec3<T extends Vec3Like>(
  current: T,
  target: Vec3Like,
  lambda: number,
  dt: number,
): T {
  const t = 1 - Math.exp(-lambda * dt);
  current.x += (target.x - current.x) * t;
  current.y += (target.y - current.y) * t;
  current.z += (target.z - current.z) * t;
  return current;
}

/** 0 below `edge0`, 1 above `edge1`, smooth in between. */
export function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
