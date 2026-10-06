import { Config } from '../core/Config';
import { Layout } from './city/layout';

interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/**
 * Divides the city core into square chunks and decides which are live (spec
 * section 34). A chunk is live when it is near the player or near where the
 * player will be shortly, because the player can cross a chunk in a second.
 * Switches are time-sliced. For the MVP "live" gates street life (traffic,
 * pedestrians); geometry stays loaded, since the whole graybox city is one
 * instanced mesh.
 */
export class ChunkManager {
  readonly perSide: number;
  private readonly size: number;
  private readonly origin: number;
  private readonly live: boolean[];
  private readonly pending: number[] = [];

  constructor() {
    this.size = Config.world.chunkSize;
    this.origin = -Layout.coreHalf;
    this.perSide = Math.ceil((Layout.coreHalf * 2) / this.size);
    this.live = new Array<boolean>(this.perSide * this.perSide).fill(false);
  }

  get total(): number {
    return this.live.length;
  }

  get liveCount(): number {
    let count = 0;
    for (const value of this.live) if (value) count++;
    return count;
  }

  /** Index of the chunk containing a point, or -1 outside the core. */
  indexAt(x: number, z: number): number {
    const column = Math.floor((x - this.origin) / this.size);
    const row = Math.floor((z - this.origin) / this.size);
    if (column < 0 || row < 0 || column >= this.perSide || row >= this.perSide) return -1;
    return row * this.perSide + column;
  }

  /** Whether street life at a point should run. Points outside the core never do. */
  isLiveAt(x: number, z: number): boolean {
    const index = this.indexAt(x, z);
    return index >= 0 && this.live[index] === true;
  }

  update(position: Vec3Like, velocity: Vec3Like): void {
    const { chunkActiveRadius, chunkLookAhead, chunkChangesPerUpdate } = Config.world;
    const aheadX = position.x + velocity.x * chunkLookAhead;
    const aheadZ = position.z + velocity.z * chunkLookAhead;

    // Collect chunks whose state is wrong, nearest first, and fix only a few per update.
    this.pending.length = 0;
    for (let index = 0; index < this.live.length; index++) {
      const wanted =
        this.distanceTo(index, position.x, position.z) < chunkActiveRadius ||
        this.distanceTo(index, aheadX, aheadZ) < chunkActiveRadius;
      if (wanted !== this.live[index]) this.pending.push(index);
    }
    if (this.pending.length > chunkChangesPerUpdate) {
      this.pending.sort(
        (a, b) =>
          this.distanceTo(a, position.x, position.z) - this.distanceTo(b, position.x, position.z),
      );
      this.pending.length = chunkChangesPerUpdate;
    }
    for (const index of this.pending) this.live[index] = !this.live[index];
  }

  private distanceTo(index: number, x: number, z: number): number {
    const column = index % this.perSide;
    const row = Math.floor(index / this.perSide);
    const centreX = this.origin + (column + 0.5) * this.size;
    const centreZ = this.origin + (row + 0.5) * this.size;
    return Math.hypot(centreX - x, centreZ - z);
  }
}
