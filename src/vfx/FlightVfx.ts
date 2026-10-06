import type { PerspectiveCamera, Scene } from 'three';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/GameEvents';
import type { PlayerState } from '../player/PlayerState';
import { SonicBoom } from './SonicBoom';
import { SpeedLines } from './SpeedLines';

/** The visual half of flight feel (spec section 10). Reads player state, listens to events. */
export class FlightVfx {
  private readonly speedLines: SpeedLines;
  private readonly boom: SonicBoom;

  constructor(
    scene: Scene,
    camera: PerspectiveCamera,
    player: PlayerState,
    events: EventBus<GameEvents>,
  ) {
    this.speedLines = new SpeedLines(camera, player);
    this.boom = new SonicBoom(scene, player);
    events.on('player:state', ({ to }) => {
      if (to === 'BOOSTING') this.boom.trigger();
    });
  }

  update(frameDelta: number): void {
    this.speedLines.update(frameDelta);
    this.boom.update(frameDelta);
  }
}
