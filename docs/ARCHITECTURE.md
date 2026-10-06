# Architecture

State as of Phase 6. Update this when a phase adds or changes a system.

## Boot

`src/main.ts` checks for WebGL2, then `Game.create()` initialises Rapier (async WASM), builds every system and starts the loop paused. The start screen's click unlocks audio and requests pointer lock; pointer lock gained means `running`, lost (Esc, focus loss, opening the tuning panel) means `paused`. Failures show a message in `#fatal` instead of a blank page.

## Frame loop

`core/GameLoop.ts` implements spec section 63.

- `FixedStepper` is the pure accumulator: clamps the frame delta, runs zero or more 1/60 s steps, returns the interpolation alpha.
- `GameLoop` drives it from `requestAnimationFrame`. While `paused` it runs no steps and renders with alpha 1.

Per fixed step: read input → (skip the rest during hit-stop) → `combat.fixedUpdate` → `player.fixedUpdate` → enemies → projectiles → `physics.step` → clear input edges.
Per rendered frame: poll gamepad → apply look → player view → camera → VFX → audio → render → overlay.

Gameplay state changes only in the fixed step. Anything simulated keeps a previous and a current state and is rendered at `lerp(previous, current, alpha)`.

## Player

| File                         | Role                                                                                                                          |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `player/PlayerState.ts`      | Plain data: position, velocity channels, aim, heading, state. Aim helpers.                                                    |
| `player/FlightController.ts` | `updateFlight`: pure function for HOVERING / FLYING / BOOSTING.                                                               |
| `player/GroundController.ts` | Pure functions for GROUND, JUMPING, LANDING.                                                                                  |
| `player/PlayerController.ts` | State machine. Picks the model, moves through the `CollisionMover`, applies collision response and transitions, emits events. |
| `player/Player.ts`           | Owns state and controller; look input; respawn.                                                                               |
| `player/PlayerView.ts`       | Placeholder capsule. Reads state only.                                                                                        |

Flight velocity is two channels. `cruise` is forward flight: its direction rotates toward the aim at a speed-dependent turn rate and its magnitude is damped separately, so turns keep speed. `nudge` is strafe, direct vertical and reverse, damped fast, so hovering is precise. `velocity = cruise + nudge`.

Aim versus heading: the mouse (or right stick) changes `aim`, which the camera orbits on and which flight steers toward while accelerating. `heading` is where the hero faces; it follows the direction of travel and holds when still.

## Collision

`physics/PhysicsWorld.ts` is the only module that imports Rapier. The player is a kinematic capsule moved by Rapier's `KinematicCharacterController`, which sweeps and slides, so nothing tunnels at any speed. `PlayerController` then removes the into-surface velocity, applies a scrape loss scaled by how head-on the hit was, and bounces with a short stagger on fast head-on hits (spec section 66). Gameplay depends on the `CollisionMover` interface, so unit tests use a fake floor and a separate suite runs against real Rapier in Node.

## World

`world/CityGenerator.ts` builds Nova City from a seed as plain `BuildingDescriptor` boxes (`world/Building.ts`). Physics makes a static cuboid for each solid one; `rendering/BuildingRenderer.ts` draws all of them as a single instanced mesh. One source, so visuals and colliders cannot drift apart.

Each district is its own file under `world/city/` with its own random stream, so editing one does not reshuffle the rest. `layout.ts` holds the shared map constants and palette, with a diagram.

| District    | Contents                                                                       | Flight line                                                 |
| ----------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| downtown    | 36 lots, towers 100–300 m, tallest at the centre; spawn tower; empty plaza lot | avenue canyon along x = 0; 14 m gap between the twin towers |
| residential | west and north bands, 10–40 m                                                  | —                                                           |
| industrial  | east band, warehouses, chimneys, tower crane                                   | window under the crane arm                                  |
| harbor      | container yard, piers, ships, ocean bridge                                     | under the bridge deck                                       |
| park        | lawn, non-solid trees, obelisk, arch                                           | through the arch                                            |
| highway     | elevated ring at radius 250 m                                                  | under the deck between pillars                              |
| surround    | sparse low blocks out to 3 km, three distant tower clusters                    | —                                                           |

Land and ocean share one flat collider at y = 0; the ocean lies south and east of `Layout.shore`.

`world/WorldBounds.ts` applies the soft limits from spec section 64 to the flight velocity channels: a headwind from 3 km that stops outward flight by 4 km and pushes back, and upward speed fading out between 1,500 and 2,000 m. `ui/BoundsWarning.ts` tells the player why.

## Combat

| File                         | Role                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------- |
| `combat/Damageable.ts`       | Interface for anything that can be targeted and hit. Enemies and the boss implement it.     |
| `combat/Targeting.ts`        | Soft lock-on: the scoring formula from spec section 14, stickiness, lock and drop rules.    |
| `combat/Projectiles.ts`      | Pooled energy blasts, swept each step against targets (segment-sphere) and the world (ray). |
| `player/CombatController.ts` | Punch, heavy punch, dash attack, blast; input buffering; hit-stop.                          |
| `player/PlayerVitals.ts`     | Health and energy rules, damage, knock-out.                                                 |

Melee is built on an assist lunge. A punch near a target sets `PlayerState.lungeVelocity` / `lungeTime`; while that is active `PlayerController` flies the hero along it instead of running normal flight. The lunge homes each step, adds the target's velocity so it cannot be outrun, and counts contact as soon as one step's closing distance would reach the target, so it cannot overshoot. On exit the hero gets back most of the speed they came in with. A unit test runs 60 randomised approaches at 40–160 m/s against an orbiting drone and requires every one to land.

Damage and knockback scale with the speed carried into the hit. Hit-stop is a short whole-simulation freeze; presses made during it, during a cooldown or mid-lunge are buffered for 0.3 s.

## Enemies

| File                      | Role                                                                                                                               |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `enemies/EnemyFactory.ts` | `generateEnemy(seed)`: one deterministic drone variation (scale, armor, speed, health, weapon, colour, aggression).                |
| `enemies/Drone.ts`        | Entity: state, health, movement by sphere cast, knockback, crash damage, respawn. Implements `Damageable`.                         |
| `enemies/EnemyAI.ts`      | `think()`: PATROL → DETECT → CHASE ⇄ ATTACK ⇄ EVADE, DAMAGED stagger. Writes `drone.desired` only.                                 |
| `enemies/EnemyFire.ts`    | Pooled bullets and homing missiles, swept against world and player. Missiles are `Damageable`.                                     |
| `enemies/EnemyManager.ts` | Staggers AI decisions (12 Hz each), runs weapons and movement every step, drone-on-drone crashes, the `targets` list combat reads. |

Design rules from spec section 15 that the tests enforce: every drone is slower than boost, bullets are slower than boost, attacks are telegraphed, a drone needs line of sight to detect and to fire, a drone thrown into a wall or another drone takes damage, missiles can be shot down or outrun. Ten drones in a fight cost under 0.5 ms per step.

Drones are not physics bodies; they query the world through the `WorldQuery` interface (`castRay`, `castSphere`), which tests fake.

## Presentation

All of this reads `PlayerState` and listens on `EventBus<GameEvents>` (`player:state`, `player:impact`). Gameplay imports none of it.

- `camera/CameraRig.ts` — orbit on aim, distance and FOV by speed, sphere-cast collision (pull in at once, ease out), landing dip, capped roll, trauma shake (`CameraShake.ts`). Everything is damped; a unit test asserts no per-frame jump.
- `vfx/` — `SpeedLines` (camera-attached streaks aligned to velocity), `SonicBoom`, grouped by `FlightVfx`.
- `vfx/ParticleSystem.ts` — one pooled instanced mesh (700 solid-colour cubes, one draw call) shared by every effect; oldest particle recycled when full. `vfx/ShockRings.ts` — pooled camera-facing rings. `vfx/CombatEffects.ts` — maps combat events to bursts: hit sparks, explosions with falling debris, muzzle flashes, wall impacts, smoke behind missiles and crippled drones.
- `ui/DamageFlash.ts` — red vignette on taking damage.
- `audio/FlightAudio.ts` — synthesized wind, rumble, boom and impact. No audio files.
- `ui/StartScreen.ts` — click-to-fly / paused gate. `ui/HUD.ts` — health and energy bars that fade when full. `ui/TargetReticle.ts` — crosshair and target marker.
- `enemies/DroneView.ts`, `rendering/ProjectileRenderer.ts` — graybox drone with hit flash and health bar; instanced blast bolts.

## Input

`input/InputManager.ts` maps keyboard (`KeyboardEvent.code`), mouse and gamepad to a `PlayerInput` of abstract values. Press edges are latched until a fixed step consumes them. Blur and pointer-lock loss release everything.

## Debug

- F3: `debug/PerfOverlay.ts`.
- Backquote: `debug/TuningPanel.ts`, live sliders over `Config.flight/camera/ground/vfx/audio/gamepad`, with Copy JSON and Reset.
- `debug/testHook.ts`: `window.__SKYBOUND__` (state, input injection, start without pointer lock). Dev or `?debug` only.

## Dependency direction

`core`, `utils`, `physics` at the bottom. `player`, `world` depend on those. `camera`, `vfx`, `audio`, `ui`, `rendering`, `debug` read gameplay; gameplay never imports them. `core/Game.ts` is the only place that wires across.

## Conventions

1 unit = 1 metre, Y up, −Z forward, seconds, radians (spec section 64). Yaw 0 faces −Z; positive pitch looks up.
