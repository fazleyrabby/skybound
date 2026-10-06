import { Vector3 } from 'three';
import { FlightAudio } from '../audio/FlightAudio';
import { CameraRig } from '../camera/CameraRig';
import { Projectiles } from '../combat/Projectiles';
import { PerfOverlay } from '../debug/PerfOverlay';
import { installTestHook, isDebugEnabled } from '../debug/testHook';
import { TuningPanel } from '../debug/TuningPanel';
import { DroneView } from '../enemies/DroneView';
import { EnemyManager } from '../enemies/EnemyManager';
import { InputManager } from '../input/InputManager';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { CombatController } from '../player/CombatController';
import { Player } from '../player/Player';
import { createPlayerInput } from '../player/PlayerState';
import { PlayerView } from '../player/PlayerView';
import { addBuildings } from '../rendering/BuildingRenderer';
import { addEnvironment } from '../rendering/Environment';
import { ProjectileRenderer } from '../rendering/ProjectileRenderer';
import { Renderer } from '../rendering/Renderer';
import { BoundsWarning } from '../ui/BoundsWarning';
import { DamageFlash } from '../ui/DamageFlash';
import { HUD } from '../ui/HUD';
import { StartScreen } from '../ui/StartScreen';
import { TargetReticle } from '../ui/TargetReticle';
import { CombatEffects, type SmokeSource } from '../vfx/CombatEffects';
import { FlightVfx } from '../vfx/FlightVfx';
import { ParticleSystem } from '../vfx/ParticleSystem';
import { ShockRings } from '../vfx/ShockRings';
import { generateCity } from '../world/CityGenerator';
import { Layout } from '../world/city/layout';
import { Config } from './Config';
import { EventBus } from './EventBus';
import type { GameEvents } from './GameEvents';
import { GameLoop } from './GameLoop';
import { store } from './store';

const GROUND_HALF_THICKNESS = 0.5;

/** Patrol posts for hostile drones, away from the spawn roof so free flight starts in peace. */
const DRONE_POSTS: ReadonlyArray<readonly [x: number, y: number, z: number]> = [
  [-120, 370, 150],
  [-400, 120, -200],
  [400, 110, -250],
  [250, 100, 400],
  [-400, 90, 350],
  [0, 150, -400],
  [150, 380, 170],
  [-150, 380, -170],
  [420, 140, 100],
  [-420, 140, 60],
];

const BLAST_STYLE = { color: 0x7fe7ff, thickness: 0.35, length: 5 };
const BULLET_STYLE = { color: 0xffa040, thickness: 0.22, length: 4 };
const MISSILE_STYLE = { color: 0xff5040, thickness: 0.7, length: 2.6 };

/** Composition root: creates and wires systems. Holds no game logic. */
export class Game {
  private constructor(private readonly loop: GameLoop) {}

  static async create(
    canvas: HTMLCanvasElement,
    onFatal: (message: string) => void,
  ): Promise<Game> {
    const events = new EventBus<GameEvents>();
    const physics = await PhysicsWorld.create(Config.sim.step, Config.sim.gravity);
    const renderer = new Renderer(canvas, () => {
      loop.stop();
      onFatal('Graphics context was lost. Reload the page to continue.');
    });

    // World: descriptors feed both the colliders and the instanced mesh.
    // Land and water share one flat collider: water is a solid surface for now.
    const worldHalfSize = Config.world.halfSize;
    const city = generateCity();
    physics.addStaticCuboid(
      0,
      -GROUND_HALF_THICKNESS,
      0,
      worldHalfSize,
      GROUND_HALF_THICKNESS,
      worldHalfSize,
    );
    for (const b of city.buildings) {
      if (b.solid) physics.addStaticCuboid(b.x, b.y, b.z, b.hx, b.hy, b.hz);
    }
    addEnvironment(renderer.scene, {
      worldHalfSize,
      shore: city.shore,
      gridHalfSize: Layout.coreHalf + 100,
    });
    addBuildings(renderer.scene, city.buildings);

    // Player: spawn standing on the central rooftop.
    const { height, radius, skin, maxSlope, snapToGround } = Config.player;
    const spawn = new Vector3(city.spawn.x, city.spawn.y + height / 2 + skin, city.spawn.z);
    const mover = physics.createCharacterMover(
      { height, radius, skin, maxSlope, snapToGround },
      spawn,
    );
    const player = new Player(mover, spawn, events);
    const playerView = new PlayerView(renderer.scene, player.state);

    // Enemies: a training dummy off the spawn roof, and hostile drones on patrol.
    const enemies = new EnemyManager(events, physics, player.state, (amount) =>
      player.damage(amount),
    );
    enemies.spawnTrainingDummy(spawn.x, spawn.y + 3, spawn.z - 30);
    DRONE_POSTS.slice(0, Config.enemies.count).forEach(([x, y, z], index) => {
      enemies.spawnHostile(Config.world.seed + index, x, y, z);
    });
    const projectiles = new Projectiles(physics, events);
    const combat = new CombatController(player.state, () => enemies.targets, projectiles, events);
    const droneViews = enemies.drones.map((drone) => new DroneView(renderer.scene, drone));
    const shotRenderers = [
      new ProjectileRenderer(renderer.scene, projectiles.pool, BLAST_STYLE),
      new ProjectileRenderer(renderer.scene, enemies.fire.bullets, BULLET_STYLE),
      new ProjectileRenderer(renderer.scene, enemies.fire.missiles, MISSILE_STYLE),
    ];

    // Presentation: reads player state and listens to events; gameplay knows none of it.
    const cameraRig = new CameraRig(renderer.camera, player.state, physics, events);
    const vfx = new FlightVfx(renderer.scene, renderer.camera, player.state, events);
    const audio = new FlightAudio(player.state, events);
    const particles = new ParticleSystem(renderer.scene);
    const shockRings = new ShockRings(renderer.scene, renderer.camera);
    const smokeSources: SmokeSource[] = [...enemies.drones, ...enemies.fire.missiles];
    const combatEffects = new CombatEffects(particles, shockRings, () => smokeSources, events);

    // Pointer lock drives pause: locked = running, released (Esc, focus loss) = paused.
    const input = new InputManager(canvas, (locked) => {
      store.getState().setPhase(locked ? 'running' : 'paused');
    });
    new StartScreen(document.body, () => {
      audio.unlock();
      void input.mouse.requestLock();
    });
    const overlay = new PerfOverlay(document.body);
    const boundsWarning = new BoundsWarning(document.body, player.state);
    const hud = new HUD(document.body, player.state);
    const damageFlash = new DamageFlash(document.body, events);
    const reticle = new TargetReticle(document.body, renderer.camera, combat.targeting);
    if (isDebugEnabled()) new TuningPanel(document.body);

    events.on('player:impact', ({ speed }) => input.gamepad.rumble(speed / 80, 180));
    events.on('combat:hit', ({ kind }) => {
      if (kind !== 'blast') input.gamepad.rumble(kind === 'punch' ? 0.6 : 1, 160);
    });
    events.on('player:state', ({ to }) => {
      if (to === 'BOOSTING') input.gamepad.rumble(0.7, 250);
    });

    const playerInput = createPlayerInput();
    const look = { yaw: 0, pitch: 0 };

    const loop = new GameLoop(
      {
        fixedUpdate(step) {
          input.readPlayerInput(playerInput);
          // Hit-stop freezes the whole simulation for a few frames on impact.
          if (!combat.consumeHitStop(playerInput, step)) {
            combat.fixedUpdate(playerInput, step);
            player.fixedUpdate(playerInput, step);
            projectiles.fixedUpdate(step, enemies.targets);
            enemies.fixedUpdate(step);
            physics.step();
          }
          input.endStep();
        },
        render(alpha, frameDelta) {
          input.poll();
          if (input.gamepad.consumeStart()) togglePause();
          input.consumeLook(frameDelta, look);
          if (!loop.paused) player.applyLook(look.yaw, look.pitch);
          playerView.update(alpha, frameDelta);
          for (const view of droneViews) view.update(alpha, frameDelta);
          for (const shots of shotRenderers) shots.update(alpha);
          cameraRig.update(alpha, frameDelta);
          vfx.update(frameDelta);
          combatEffects.update(frameDelta);
          particles.update(frameDelta);
          shockRings.update(frameDelta);
          audio.update();
          boundsWarning.update();
          hud.update(frameDelta);
          damageFlash.update(frameDelta);
          reticle.update();
          renderer.render();
          overlay.update(frameDelta, () => ({
            ...renderer.stats,
            simMs: loop.stats.lastSimMs,
            bodies: physics.bodyCount,
            particles: particles.count,
            entities: enemies.targets.length,
            speed: player.state.speed,
            flightState: player.state.diving ? 'DIVING' : player.state.state,
          }));
        },
      },
      Config.sim.step,
      Config.sim.maxFrameDelta,
    );

    loop.paused = true;
    store.subscribe((state) => {
      loop.paused = state.phase !== 'running';
      audio.setPaused(loop.paused);
    });

    // Gamepad Start: pause, or start/resume without needing the mouse.
    function togglePause(): void {
      if (!loop.paused) {
        if (input.mouse.locked) document.exitPointerLock();
        else store.getState().setPhase('paused');
      } else {
        audio.unlock();
        store.getState().setPhase('running');
      }
    }

    if (isDebugEnabled()) {
      installTestHook({
        loop: loop.stats,
        render: () => renderer.stats,
        bodyCount: () => physics.bodyCount,
        input,
        player,
        camera: () => cameraRig.debug,
        combat,
        enemies,
        particles: () => particles.count,
      });
    }

    return new Game(loop);
  }

  start(): void {
    store.getState().setPhase('ready');
    this.loop.start();
  }
}
