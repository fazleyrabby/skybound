# Architecture

State as of Phase 15 (Phase 11 partly done, Phase 16 not started). Update this when a phase adds or changes a system.

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

| File                                | Role                                                                                                                          |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `player/PlayerState.ts`             | Plain data: position, velocity channels, aim, heading, state. Aim helpers.                                                    |
| `player/FlightController.ts`        | `updateFlight`: pure function for HOVERING / FLYING / BOOSTING.                                                               |
| `player/GroundController.ts`        | Pure functions for GROUND, JUMPING, LANDING.                                                                                  |
| `player/PlayerController.ts`        | State machine. Picks the model, moves through the `CollisionMover`, applies collision response and transitions, emits events. |
| `player/Player.ts`                  | Owns state and controller; look input; respawn.                                                                               |
| `player/PlayerView.ts`              | Draws the Aether model (capsule fallback if it fails to load), leans it into flight, picks the pose. Reads state only.        |
| `player/HeroRig.ts`, `heroPoses.ts` | Rotates the model's joint nodes toward named poses, eased per joint. Poses are data: one Euler rotation per joint.            |

Flight velocity is two channels. `cruise` is forward flight: its direction rotates toward the aim at a speed-dependent turn rate and its magnitude is damped separately, so turns keep speed. `nudge` is strafe, direct vertical and reverse, damped fast, so hovering is precise. `velocity = cruise + nudge`.

Aim versus heading: the mouse (or right stick) changes `aim`, which the camera orbits on and which flight steers toward while accelerating. `heading` is where the hero faces; it follows the direction of travel and holds when still.

### Hero model

`public/assets/characters/aether.glb` is 14 rigid segments on a node hierarchy (torso, head, and three joints per limb), not a skinned mesh. It is built by `blender/characters/build_aether.py` and exported by `export_aether.py`; both run inside Blender. Animation is blended poses in code rather than authored clips: idle, two walk extremes, fall, land, hover, fly, boost, dive, charge, punch, blast. `rendering/AssetManager.ts` loads it through `assetManifest.ts`; a failed load falls back to the capsule.

`HeroRig.setWalk()` blends continuously between the two stride extremes, driven by distance travelled and scaled down for small movement inputs. Upward jumps have their own pose; damage briefly interrupts movement. `PlayerView` banks the body from changes in travel heading, wraps heading differences across ±π, and keeps Space/C-only movement upright. A landing hold ends when walking or jumping resumes.

An appearance group sits under the interpolated player root. On the ground, cached mesh bounds align its lowest posed point to the capsule's foot height; the offset eases away after take-off. This is presentation only: it changes neither the collision capsule nor the camera pivot, and is approximate contact rather than foot IK. Rates, thresholds and hold times live in `Config.hero`; its numeric controls are available in the tuning panel.

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

### Building look

`rendering/BuildingRenderer.ts` patches the standard material: boxes whose descriptor has `windows: true` get a procedural window facade computed from the box's own size, so no UVs or textures are needed. Downtown towers are built in `world/city/downtown.ts` as podium, stepped tiers and non-solid rooftop plant.

### Sky, light and weather

- `world/DayNightSystem.ts` — the clock, and `sampleSky(hour)`: a pure function from time of day to light direction, colours, intensities, sky colours, a `night` factor and the share of windows lit. Keyframes for dawn, day, sunset and night, interpolated; continuous across midnight.
- `world/WeatherSystem.ts` — clear or rain on a seeded timer; `rain` eases 0..1.
- `rendering/Atmosphere.ts` — applies both: gradient sky dome with sun glow, hemisphere and directional light, one shadow map centred on the player and snapped to texels, fog that takes the horizon colour and closes in with rain, wet ground, night headlights, and the lit-window and night uniforms of the building shader.
- `rendering/Water.ts` — the ocean shader: sine-wave normals with per-wave anti-aliasing, Fresnel sky reflection, sun glint, shore foam. Fed the same sky sample as the atmosphere.
- `rendering/TreeRenderer.ts` — instanced canopies and trunks for two species, with wind sway. Placements come from `world/city/trees.ts`.
- `vfx/Rain.ts` — streaks in a box that travels with the camera, moved by fall speed minus the hero's velocity.
- Boxes flagged `glow` (lamp heads, billboards) light up in their own colour at night, in the same building shader.

### Street life

- `world/city/roads.ts` — fixed list of straight roads: the downtown street grid, the elevated ring, the ocean bridge. `world/city/props.ts` lays asphalt strips and lamp posts along the streets as non-solid boxes in the shared building mesh.
- `world/ChunkManager.ts` — 5 × 5 grid of 200 m chunks over the core. A chunk is live when near the player or near where the player will be in 1.5 s; switches are limited to two per update. For now "live" gates pedestrians; geometry stays loaded.
- `world/PathFollowers.ts` — things that travel along paths and wrap: typed arrays, no allocation, position a pure function of distance travelled. Writes a packed instance buffer.
- `world/StreetLife.ts` — 150 vehicles on the roads, 320 pedestrians on sidewalks and park paths. Pedestrians are drawn only in live chunks, within 260 m and below 140 m altitude.
- `rendering/FollowerRenderer.ts` — one instanced mesh per kind.

### Events

- `world/WorldEvents.ts` — runs one dynamic event at a time: IDLE → ACTIVE ⇄ ENGAGED → SUCCESS | FAILURE → IDLE. Picks a site (never the same twice running), owns the clock, banks the reward in the store, emits `world:eventStarted` / `world:eventEnded`. The clock runs only while the player is away from the site.
- `world/events/WorldEvent.ts` — the interface an event type implements (`start`, `update`, `status`, `reward`, `cleanup`) and the list of sites. `DroneAttackEvent.ts` is the first type: deploy a squad from the reserve, succeed when all are destroyed.
- Reserve drones: `EnemyManager.addReserve()` creates dormant drones up front; events `deploy()` and `dismiss()` them. Nothing is allocated when an event starts.
- `ui/EventUI.ts` — banner, site marker that slides to the screen edge when out of view, result, score.

## Missions

- `missions/Objective.ts` — one step of a mission: `update()` returns true when met, plus a label, progress text and an optional target. Built-in kinds: take off, fly a ring course (tested against the path flown each step, so rings are not skipped at speed), reach a speed, land on a spot, destroy N drones in waves from the reserve.
- `missions/Mission.ts` — missions as data: title, brief, reward, prerequisite, beacon position, and a function that builds fresh objectives. First Flight and Drone Swarm are defined here.
- `missions/MissionManager.ts` — offers unlocked missions at their beacons (interact to start), steps the active one, settles the reward, supports abandon and replay. Suspends world events while a mission runs, since both use the drone reserve.
- `rendering/MissionMarkers.ts` — beacon pillars, the ring at the current checkpoint, a flat ring on a landing spot. `ui/MissionUI.ts` — objective panel, target marker, beacon prompt, result. `ui/ScreenMarker.ts` is the shared label-pinned-to-a-world-point used by missions and events.

## Save

`save/SaveManager.ts` reads and writes one versioned JSON object under `skybound.save` through a `StorageAdapter`. Unreadable data is copied to `skybound.save.corrupt` and replaced with defaults; individual bad fields are repaired. `LocalStorageAdapter` guards every access, so the game runs without persistence where storage is unavailable. `Game.ts` loads into the store at boot and saves when score or completed missions change.

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

## Boss

| File                                         | Role                                                                                                                                                                                     |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enemies/boss/Titan.ts`                      | State and damage rules. Hull is a `Damageable` with per-phase armour; `WeakPoint`s are separate `Damageable`s that forward damage at a multiplier. Health cannot skip a phase threshold. |
| `enemies/boss/TitanAI.ts`                    | Movement: drop in for the reveal, then patrol the clear corridor above the ring road; phase 3 adds a run down the avenue canyon. Always turns to face the player.                        |
| `enemies/boss/TitanAttacks.ts`               | Guns and missile salvos (phase 1), sweeping laser with a warning (phase 2), melee swipe and expanding pulse (phase 3). Uses the shared `EnemyFire` pools.                                |
| `enemies/boss/BossFight.ts`                  | The encounter: reveal (eases the player's aim onto Titan), phase events, checkpoint restore when the player is knocked out, destruction sequence.                                        |
| `enemies/boss/TitanView.ts`, `ui/BossBar.ts` | Graybox machine, armour plates that vanish in phase 2, weak-point glows, laser and pulse; health bar with phase notches and the name card.                                               |

Phase thresholds are 70% and 30%. Each is a checkpoint: a knocked-out player resumes with Titan at the start of the current phase. The Titan mission (`DefeatBossObjective`) starts the fight and completes on `boss:defeated`.

## Presentation

All of this reads `PlayerState` and listens on `EventBus<GameEvents>` (`player:state`, `player:impact`). Gameplay imports none of it.

- `camera/CameraRig.ts` — orbit on aim, distance and FOV by speed, sphere-cast collision (pull in at once, ease out), landing dip, capped roll, trauma shake (`CameraShake.ts`). Everything is damped; a unit test asserts no per-frame jump.
- `vfx/` — `SpeedLines` (camera-attached streaks aligned to velocity), `SonicBoom`, grouped by `FlightVfx`.
- `vfx/ParticleSystem.ts` — one pooled instanced mesh (700 solid-colour cubes, one draw call) shared by every effect; oldest particle recycled when full. `vfx/ShockRings.ts` — pooled camera-facing rings. `vfx/CombatEffects.ts` — maps combat events to bursts: hit sparks, explosions with falling debris, muzzle flashes, wall impacts, smoke behind missiles and crippled drones.
- `ui/DamageFlash.ts` — red vignette on taking damage.
- `audio/AudioManager.ts` — the AudioContext, a master gain with music and effects buses, and the synthesis primitives (noise burst, tone run, pitch sweep, enveloped note). Nothing plays until `unlock()` runs from a user gesture. No audio files.
- `audio/FlightAudio.ts` — continuous layers driven by flight: wind, boost rumble, a whoosh when passing close to surfaces at speed (three rays, ten times a second), city hum near street level.
- `audio/SoundBank.ts` — every one-shot, as a mapping from game events to synthesis.
- `audio/MusicManager.ts` — generative music scheduled on the audio clock. `notesForStep()` is the arrangement as a pure function: pad while exploring, bass and arpeggio in a fight, drums when intense, a darker progression and faster tempo for the boss.
- `ui/Menus.ts` — click-to-fly / paused gate and menu tabs. `ui/HUD.ts` — health and energy bars that fade when full. `ui/TargetReticle.ts` — crosshair and target marker.
- `enemies/DroneView.ts`, `rendering/ProjectileRenderer.ts` — graybox drone with hit flash and health bar; instanced blast bolts.

## Quality

`rendering/QualitySettings.ts` holds the five presets (MOBILE to ULTRA) as data, `writePreset()` which copies one into `Config`, and `AdaptiveQuality`, which is pure logic fed one frame time per frame. It trades resolution first, within the preset's range; if the lowest resolution is still slow for three seconds it drops a preset; with eight seconds of headroom at full resolution it tries the next one up, never past HIGH by itself. A manual choice fixes the preset and leaves dynamic resolution on. `Game.ts` applies changes: pixel ratio on the renderer, shadow settings on the atmosphere; density and particle multipliers are read from `Config` by the systems that use them.

## Input

`input/InputManager.ts` maps keyboard (`KeyboardEvent.code`), mouse and gamepad to a `PlayerInput` of abstract values. Press edges are latched until a fixed step consumes them. Blur and pointer-lock loss release everything.

## Menus and settings

- `core/Settings.ts` — the player-facing options, their ranges, `sanitizeSettings()` (repairs anything into valid settings) and `applySettings()` (writes them into `Config`). Settings live in the store and are saved with progress; the save format is at version 2, with a migration from 1.
- `ui/Menus.ts` — title and pause screen. The prompt or backdrop click starts or resumes (the user gesture for pointer lock and audio); tabs for controls, settings, missions (start, replay, abandon) and credits swallow their own clicks.
- `ui/Hints.ts` — one contextual control hint at a time for players who have not finished First Flight. `currentHint()` is pure.

## Debug

- F3: `debug/PerfOverlay.ts`.
- Backquote: `debug/DebugMenu.ts`. While open, number keys spawn an enemy or the boss, cycle teleports, toggle weather, advance time, toggle god mode, unlock missions, and (9) open `debug/TuningPanel.ts`: live sliders over most `Config` sections with Copy JSON and Reset.
- `debug/testHook.ts`: `window.__SKYBOUND__` (state, input injection, start without pointer lock, teleport, spawners, time and weather, quality). Dev or `?debug` only.
- Particle diagnostics include both current survivors and total emissions. Browser assertions use emissions where particle expiry during software rendering would make survivor counts unreliable.

## Dependency direction

`core`, `utils`, `physics` at the bottom. `player`, `world` depend on those. `camera`, `vfx`, `audio`, `ui`, `rendering`, `debug` read gameplay; gameplay never imports them. `core/Game.ts` is the only place that wires across.

## Conventions

1 unit = 1 metre, Y up, −Z forward, seconds, radians (spec section 64). Yaw 0 faces −Z; positive pitch looks up.
