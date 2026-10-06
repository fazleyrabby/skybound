import { Vector3 } from 'three';
import { AudioManager } from '../audio/AudioManager';
import { FlightAudio } from '../audio/FlightAudio';
import { intensityFor, MusicManager } from '../audio/MusicManager';
import { SoundBank } from '../audio/SoundBank';
import { CameraRig } from '../camera/CameraRig';
import type { Damageable } from '../combat/Damageable';
import { Projectiles } from '../combat/Projectiles';
import { PerfOverlay } from '../debug/PerfOverlay';
import { installTestHook, isDebugEnabled } from '../debug/testHook';
import { DebugMenu } from '../debug/DebugMenu';
import { TuningPanel } from '../debug/TuningPanel';
import { BossFight, knockPlayer } from '../enemies/boss/BossFight';
import { TitanView } from '../enemies/boss/TitanView';
import { DroneView } from '../enemies/DroneView';
import { EnemyManager } from '../enemies/EnemyManager';
import { InputManager } from '../input/InputManager';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { CombatController } from '../player/CombatController';
import { Player } from '../player/Player';
import { createPlayerInput } from '../player/PlayerState';
import { PlayerView } from '../player/PlayerView';
import { AssetManager } from '../rendering/AssetManager';
import { Atmosphere } from '../rendering/Atmosphere';
import { addBuildings } from '../rendering/BuildingRenderer';
import { addEnvironment } from '../rendering/Environment';
import { FollowerRenderer } from '../rendering/FollowerRenderer';
import { ProjectileRenderer } from '../rendering/ProjectileRenderer';
import { TreeRenderer } from '../rendering/TreeRenderer';
import { Water } from '../rendering/Water';
import { AdaptiveQuality, writePreset, type QualityPreset } from '../rendering/QualitySettings';
import { Renderer } from '../rendering/Renderer';
import { BossBar } from '../ui/BossBar';
import { BoundsWarning } from '../ui/BoundsWarning';
import { DamageFlash } from '../ui/DamageFlash';
import { EventUI } from '../ui/EventUI';
import { HUD } from '../ui/HUD';
import { Hints } from '../ui/Hints';
import { Menus } from '../ui/Menus';
import { TargetReticle } from '../ui/TargetReticle';
import { CombatEffects, type SmokeSource } from '../vfx/CombatEffects';
import { FlightVfx } from '../vfx/FlightVfx';
import { Rain } from '../vfx/Rain';
import { ParticleSystem } from '../vfx/ParticleSystem';
import { ShockRings } from '../vfx/ShockRings';
import { ChunkManager } from '../world/ChunkManager';
import { DayNightSystem } from '../world/DayNightSystem';
import { WeatherSystem } from '../world/WeatherSystem';
import { generateCity } from '../world/CityGenerator';
import { createMissions } from '../missions/Mission';
import { MissionManager } from '../missions/MissionManager';
import { MissionMarkers } from '../rendering/MissionMarkers';
import { LocalStorageAdapter } from '../save/LocalStorageAdapter';
import { SaveManager } from '../save/SaveManager';
import { MissionUI } from '../ui/MissionUI';
import { DroneAttackEvent } from '../world/events/DroneAttackEvent';
import { StreetLife } from '../world/StreetLife';
import { WorldEvents } from '../world/WorldEvents';
import { Layout } from '../world/city/layout';
import { Config } from './Config';
import { applySettings } from './Settings';
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

/** Width, height, length in metres. */
const VEHICLE_SIZE = [2, 1.5, 4.4] as const;
const PEDESTRIAN_SIZE = [0.5, 1.7, 0.35] as const;

function formatHour(hour: number): string {
  const minutes = Math.floor((hour % 1) * 60);
  return `${String(Math.floor(hour)).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

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
    const ground = addEnvironment(renderer.scene, {
      worldHalfSize,
      shore: city.shore,
      gridHalfSize: Layout.coreHalf + 100,
    });
    const buildings = addBuildings(renderer.scene, city.buildings);

    // Street life: chunks decide where it runs; traffic and pedestrians follow the roads.
    const chunks = new ChunkManager();
    const streetLife = new StreetLife(city.roads, chunks, Config.world.seed);
    const vehicleRenderer = new FollowerRenderer(
      renderer.scene,
      Config.world.vehicleCount,
      VEHICLE_SIZE,
    );
    const pedestrianRenderer = new FollowerRenderer(
      renderer.scene,
      Config.world.pedestrianCount,
      PEDESTRIAN_SIZE,
    );

    // Time of day and weather drive the sky, light, fog, lit windows and rain.
    const dayNight = new DayNightSystem();
    const weather = new WeatherSystem(Config.world.seed);
    const water = new Water(renderer.scene, worldHalfSize, city.shore);
    const trees = new TreeRenderer(renderer.scene, city.trees);
    const atmosphere = new Atmosphere(renderer.scene, renderer.camera, renderer.backend, {
      land: ground.land,
      vehicles: vehicleRenderer.material,
      setWindowLight: buildings.setWindowLight,
    });

    // Quality: a preset sets the limits; within them resolution follows the frame time.
    const quality = new AdaptiveQuality();
    const applyQuality = (): void => {
      writePreset(quality.preset);
      renderer.setPixelRatio(quality.pixelRatio);
      atmosphere.configureShadows();
    };
    applyQuality();

    // Player: spawn standing on the central rooftop.
    const { height, radius, skin, maxSlope } = Config.player;
    const spawn = new Vector3(city.spawn.x, city.spawn.y + height / 2 + skin, city.spawn.z);
    const mover = physics.createCharacterMover({ height, radius, skin, maxSlope }, spawn);
    const player = new Player(mover, spawn, events);
    const assets = new AssetManager();
    const heroModel = await assets.loadModel('hero');
    const playerView = new PlayerView(renderer.scene, player.state, events, heroModel);

    // Enemies: a training dummy off the spawn roof, and hostile drones on patrol.
    const enemies = new EnemyManager(events, physics, player.state, (amount) =>
      player.damage(amount),
    );
    enemies.spawnTrainingDummy(spawn.x, spawn.y + 3, spawn.z - 30);
    DRONE_POSTS.slice(0, Config.enemies.count).forEach(([x, y, z], index) => {
      enemies.spawnHostile(Config.world.seed + index, x, y, z);
    });
    // Reserve drones sit dormant until an event deploys them.
    for (let i = 0; i < Config.enemies.reserve; i++) {
      enemies.addReserve(Config.world.seed + 100 + i);
    }
    const worldEvents = new WorldEvents(
      [(site, rng) => new DroneAttackEvent(site, enemies, rng)],
      events,
      Config.world.seed,
    );
    const boss = new BossFight(
      player.state,
      enemies.fire,
      physics,
      {
        damage: (amount) => player.damage(amount),
        knock: (velocity) => knockPlayer(player.state, velocity),
      },
      events,
      Config.world.seed,
    );
    const titanView = new TitanView(renderer.scene, boss.titan, boss.attacks);
    // Everything the player can hit: drones, missiles, and Titan's hull and weak points.
    const targets: Damageable[] = [];
    const refreshTargets = (): void => {
      targets.length = 0;
      targets.push(...enemies.targets, ...boss.targets);
    };

    const missions = new MissionManager(
      createMissions({ spawnRoof: city.spawn }),
      { player: player.state, enemies, boss },
      worldEvents,
      events,
    );
    const missionMarkers = new MissionMarkers(renderer.scene, renderer.camera, missions);

    // Progress: load once at boot, save whenever it changes.
    const saves = new SaveManager(new LocalStorageAdapter());
    const saved = saves.load();
    store.setState({
      score: saved.score,
      eventsCompleted: saved.eventsCompleted,
      eventsFailed: saved.eventsFailed,
      missionsCompleted: saved.missionsCompleted,
      settings: saved.settings,
    });
    applySettings(saved.settings);
    quality.choose(saved.settings.quality);
    applyQuality();
    store.subscribe((state, previous) => {
      if (
        state.score !== previous.score ||
        state.missionsCompleted !== previous.missionsCompleted ||
        state.eventsFailed !== previous.eventsFailed ||
        state.settings !== previous.settings
      ) {
        const { score, eventsCompleted, eventsFailed, missionsCompleted, settings } = state;
        saves.save({ score, eventsCompleted, eventsFailed, missionsCompleted, settings });
      }
      if (state.settings !== previous.settings) {
        applySettings(state.settings);
        if (state.settings.quality !== previous.settings.quality) {
          quality.choose(state.settings.quality);
          applyQuality();
        }
      }
    });
    const projectiles = new Projectiles(physics, events);
    const combat = new CombatController(player.state, () => targets, projectiles, events);
    const droneViews = enemies.drones.map((drone) => new DroneView(renderer.scene, drone));
    const shotRenderers = [
      new ProjectileRenderer(renderer.scene, projectiles.pool, BLAST_STYLE),
      new ProjectileRenderer(renderer.scene, enemies.fire.bullets, BULLET_STYLE),
      new ProjectileRenderer(renderer.scene, enemies.fire.missiles, MISSILE_STYLE),
    ];

    // Presentation: reads player state and listens to events; gameplay knows none of it.
    const cameraRig = new CameraRig(renderer.camera, player.state, physics, events);
    const vfx = new FlightVfx(renderer.scene, renderer.camera, player.state, events);
    const rain = new Rain(renderer.camera, player.state);
    const audio = new AudioManager();
    const sounds = new SoundBank(audio, events);
    const flightAudio = new FlightAudio(audio, player.state, physics, () => weather.rain);
    const music = new MusicManager(audio);
    const particles = new ParticleSystem(renderer.scene);
    const shockRings = new ShockRings(renderer.scene, renderer.camera);
    const smokeSources: SmokeSource[] = [...enemies.drones, ...enemies.fire.missiles];
    const combatEffects = new CombatEffects(particles, shockRings, () => smokeSources, events);

    // Pointer lock drives pause: locked = running, released (Esc, focus loss) = paused.
    const input = new InputManager(canvas, (locked) => {
      store.getState().setPhase(locked ? 'running' : 'paused');
    });
    new Menus(document.body, missions, () => {
      const kind = store.getState().phase === 'paused' ? 'resume' : 'start';
      void audio.unlock().then(() => sounds.ui(kind));
      void input.mouse.requestLock();
    });
    const overlay = new PerfOverlay(document.body);
    const boundsWarning = new BoundsWarning(document.body, player.state);
    const hud = new HUD(document.body, player.state, combat);
    const bossBar = new BossBar(document.body, boss.titan);
    const missionUI = new MissionUI(
      document.body,
      renderer.camera,
      missions,
      player.state.position,
    );
    const eventUI = new EventUI(document.body, renderer.camera, worldEvents, player.state.position);
    const damageFlash = new DamageFlash(document.body, events);
    const reticle = new TargetReticle(document.body, renderer.camera, combat.targeting);
    const hints = new Hints(document.body, () => ({
      player: player.state,
      missionActive: missions.active !== null,
      atBeacon: missions.offered !== null,
      hasTarget: combat.targeting.current !== null,
      firstFlightDone: missions.isCompleted('first-flight'),
    }));

    if (isDebugEnabled()) {
      const tuning = new TuningPanel(document.body);
      const teleports: ReadonlyArray<readonly [x: number, y: number, z: number]> = [
        [spawn.x, spawn.y + 2, spawn.z],
        [0, 6, 120],
        [0, 900, 0],
        [0, 400, 190],
      ];
      let teleportIndex = 0;
      new DebugMenu(document.body, [
        {
          key: '1',
          label: 'Spawn enemy',
          run: () => {
            const { x, y, z } = player.state.position;
            enemies.reserve[0]?.deploy(x + 60, y + 10, z - 60);
          },
        },
        { key: '2', label: 'Spawn boss', run: () => boss.start() },
        {
          key: '3',
          label: 'Teleport (roof / street / high / boss arena)',
          run: () => {
            const [x, y, z] = teleports[teleportIndex++ % teleports.length] ?? [0, 300, 0];
            player.teleport(x, y, z);
          },
        },
        {
          key: '4',
          label: 'Toggle weather',
          run: () => weather.set(weather.weather === 'rain' ? 'clear' : 'rain'),
        },
        { key: '5', label: 'Advance time 3 h', run: () => dayNight.setHour(dayNight.hour + 3) },
        {
          key: '6',
          label: 'Toggle god mode',
          run: () => {
            player.invulnerable = !player.invulnerable;
          },
        },
        {
          key: '7',
          label: 'Unlock all missions',
          run: () => {
            for (const mission of missions.all) store.getState().completeMission(mission.id, 0);
          },
        },
        { key: '9', label: 'Flight tuning panel', run: () => tuning.toggle() },
      ]);
    }

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
            projectiles.fixedUpdate(step, targets);
            enemies.fixedUpdate(step);
            boss.fixedUpdate(step);
            refreshTargets();
            worldEvents.fixedUpdate(step, player.state.position);
            missions.fixedUpdate(playerInput, step);
            streetLife.fixedUpdate(step);
            dayNight.fixedUpdate(step);
            weather.fixedUpdate(step);
            chunks.update(player.state.position, player.state.velocity);
            physics.step();
          }
          input.endStep();
        },
        render(alpha, frameDelta) {
          if (!loop.paused && quality.sample(frameDelta)) applyQuality();
          input.poll();
          if (input.gamepad.consumeStart()) togglePause();
          input.consumeLook(frameDelta, look);
          if (!loop.paused) player.applyLook(look.yaw, look.pitch);
          playerView.update(alpha, frameDelta);
          for (const view of droneViews) view.update(alpha, frameDelta);
          for (const shots of shotRenderers) shots.update(alpha);
          titanView.update(alpha);
          streetLife.prepare(player.state.position, loop.paused ? 0 : alpha * Config.sim.step);
          vehicleRenderer.update(
            streetLife.vehicleBuffer,
            streetLife.vehicleColors,
            streetLife.visibleVehicles,
          );
          pedestrianRenderer.update(
            streetLife.pedestrianBuffer,
            streetLife.pedestrianColors,
            streetLife.visiblePedestrians,
          );
          cameraRig.update(alpha, frameDelta);
          vfx.update(frameDelta);
          atmosphere.update(dayNight.sample, playerView.position, weather.rain);
          water.update(frameDelta, dayNight.sample, weather.rain);
          trees.update(frameDelta, weather.rain);
          rain.update(frameDelta, weather.rain);
          combatEffects.update(frameDelta);
          particles.update(frameDelta);
          shockRings.update(frameDelta);
          audio.update();
          flightAudio.update(frameDelta);
          music.setIntensity(
            intensityFor({
              boss: boss.active,
              fighting: enemies.drones.some(
                (drone) => drone.alive && (drone.state === 'ATTACK' || drone.state === 'CHASE'),
              ),
              objective: missions.active !== null || worldEvents.current !== null,
            }),
            boss.active,
          );
          music.update(frameDelta);
          boundsWarning.update();
          hud.update(frameDelta);
          bossBar.update();
          eventUI.update(frameDelta);
          hints.update(frameDelta);
          missionUI.update(frameDelta);
          missionMarkers.update(frameDelta);
          damageFlash.update(frameDelta);
          reticle.update();
          renderer.render();
          overlay.update(frameDelta, () => ({
            ...renderer.stats,
            simMs: loop.stats.lastSimMs,
            bodies: physics.bodyCount,
            particles: particles.count,
            chunks: `${chunks.liveCount}/${chunks.total}`,
            vehicles: streetLife.visibleVehicles,
            pedestrians: streetLife.visiblePedestrians,
            quality: `${quality.preset}${quality.auto ? ' (auto)' : ''}`,
            clock: `${formatHour(dayNight.hour)}${weather.rain > 0.05 ? '  rain' : ''}`,
            entities: targets.length,
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
        void audio.unlock();
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
        emittedParticles: () => particles.emittedCount,
        hero: () => playerView.debug,
        worldEvents,
        missions,
        boss,
        audio: () => ({
          running: audio.running,
          intensity: music.intensity,
          whoosh: flightAudio.whoosh,
        }),
        world: () => ({
          liveChunks: chunks.liveCount,
          totalChunks: chunks.total,
          vehicles: streetLife.visibleVehicles,
          pedestrians: streetLife.visiblePedestrians,
          hour: dayNight.hour,
          night: dayNight.sample.night,
          rain: weather.rain,
        }),
        dayNight,
        weather,
        quality: {
          get: () => ({
            preset: quality.preset,
            auto: quality.auto,
            pixelRatio: quality.pixelRatio,
          }),
          set: (choice: QualityPreset | 'auto') => {
            quality.choose(choice);
            applyQuality();
          },
        },
        simMs: () => loop.stats.lastSimMs,
      });
    }

    return new Game(loop);
  }

  start(): void {
    store.getState().setPhase('ready');
    this.loop.start();
  }
}
