# Decisions

Short dated entries. Newest first.

## 2026-10-06 — Phase 8

- **One event at a time, one event type (drone attack).** New types implement `WorldEvent` and are added to the factory list; the manager does not change.
- **The event clock stops while the player is at the site.** An event can only be lost by not going. Once there, the fight takes as long as it takes.
- **Standing patrols cut from six to two**; the other drones are a dormant reserve of eight that events deploy. The city is quiet between events, which suits free flight.
- **Failure has no penalty** beyond the missed reward, as spec section 24 says.
- **Score and event counts live in the zustand store** (low-frequency state). They are not saved yet; persistence comes with missions in Phase 9.
- **First event after 25 s, then 25–50 s gaps.** Guesses, in `Config.events`.

## 2026-10-06 — Landing poses and building design (director feedback)

- **Space / C keep the hero upright.** The body now leans only with forward flight (the `cruise` channel), not with total velocity, so a vertical descent is a hover landing rather than a nose dive. New `ascend` and `descend` poses; the landing crouch became a one-knee superhero landing and is held for 0.55 s.
- **Building facades are a shader, not textures or geometry.** Boxes flagged `windows` get a window grid in real metres with corner piers, a ground-floor band, a parapet, per-window glass tint and a share of lit windows. Still one draw call. The pattern fades to its average tone with distance to avoid shimmer.
- **`setWindowLight()` is exposed** for the day/night pass (Phase 13) to light the city at night.
- **Towers are a podium plus one to three stepped tiers plus rooftop plant.** Roof plant and masts are non-solid so there is nothing thin to snag on.
- **Part of Phase 13 (world polish) pulled forward** at the director's request. Sky, shadows, water and signage are still to do.

## 2026-10-06 — Hero model (Phase 11, started early)

- **Pulled forward at the director's request** once Blender was reachable (Blender MCP add-on socket on port 9876, driven directly; no MCP tool was attached to the session).
- **Aether is a stylized armoured figure built procedurally**: lofted body shapes, armour shells, emissive core, visor and strips. 31k triangles, 4 materials, 529 KB. Hard-surface was chosen because it is what scripted modelling does well; an organic bare-faced hero is not.
- **Rigid segments on a node hierarchy, not a skinned mesh.** This is rung 4 of the fallback ladder in spec section 69. No weight painting, no armature, joints hidden by overlapping armour. The cost is no soft deformation.
- **Poses are authored in code, not as Blender clips.** One Euler rotation per joint, blended. Cheap to iterate from in-game screenshots, and flight needs silhouettes more than cycles.
- **14 joints with 4 materials each cost about 45 draw calls.** Within budget; merge materials into a palette texture if it matters later.
- **The model was built in a new scene (`SKYBOUND_Aether`) inside the director's already-open Blender file.** Their other scenes were not touched and the file was not saved. The source is written separately to `blender/characters/aether.blend`.

## 2026-10-06 — Phase 7

- **Chunks gate street life, not geometry.** The whole graybox city is about 1,000 boxes in one draw call, so there is nothing worth unloading. Chunk-level building LOD and asset streaming wait until real art makes them necessary (spec section 34 allows this).
- **Traffic and pedestrians are path followers**, not agents: fixed straight paths, wrap at the ends, shrink in and out instead of popping. Vehicles pass through each other at intersections. No collision with the player.
- **Roads are a hand-written list** matching the downtown lot grid, the highway ring and the bridge. Outer districts have no roads yet; their lots are not laid out around streets.
- **Pedestrians are plain boxes** with no walk animation. Vertex-animation textures (spec section 22) come with a real crowd mesh.
- **Street lamps and asphalt are boxes in the building mesh**: no new draw calls, no colliders.

## 2026-10-06 — Phase 6

- **Particles are solid-colour cubes that shrink away, not additive sprites.** Additive blending washed every colour to white against the daytime sky. Revisit with soft sprites and bloom in the graphics pass.
- **One particle pool for everything** (700, one draw call). When full the oldest particle is recycled, so a big fight degrades instead of allocating.
- **Effects are driven only by events and by a `smoking` flag** on drones and missiles; no effect code in gameplay.
- **No energy trail or boost trail on the hero yet.** The earlier 1 px trail was removed on feedback; a ribbon needs the hero model to anchor to.
- **Visual check of this phase was a headless screenshot**, because the in-app browser pane was hidden and not animating.

## 2026-10-06 — Phase 5

- **Six hostile drones on fixed patrol posts, respawning 20 s after destruction.** A stand-in until the event system (Phase 8) decides when and where enemies appear. Posts are kept away from the spawn roof so free flight starts in peace.
- **One passive training dummy stays by the spawn roof**, built from the same `Drone` class with a `passive` flag.
- **Drones are not Rapier bodies.** They move by sphere cast against the static world. Cheaper, and nothing else needs to collide with them physically.
- **Obstacle avoidance is "climb over it".** One ray ahead; if blocked, go up. Good enough above a box city; revisit if drones look stupid among towers.
- **Missiles are targets** (they implement `Damageable`), so the lock-on can pick them and they can be punched or blasted.
- **Fixed: teleport left the collider at its old position until the next physics step**, so the first move after a teleport could report ground that was not there and drop the hero out of flight. Found by a flaky browser test; `propagateModifiedBodyPositionsToColliders()` after teleport fixes it.
- **Browser tests judge by simulated time** (step count), not wall time, where they wait on gameplay. Software rendering can run well below real time.
- **`spec.md` is gitignored** at the director's request.

## 2026-10-06 — Phase 4

- **Punch fires on press; holding on charges a heavy punch, thrown on release.** So a heavy punch is always preceded by a light one. Chosen over deciding tap-versus-hold on release, which would delay every punch.
- **Dash attack needs a target in range**; with none it does nothing and does not go on cooldown.
- **Extreme speed now costs energy** (spec section 67). When it runs out the hero drops to boost speed until boost is released; energy still trickles back meanwhile.
- **Knock-out respawns above the spawn roof**, not the nearest rooftop as the spec says. Nearest-rooftop needs a roof query that does not exist yet.
- **Camera pivot raised above the hero's head** so the hero no longer covers the crosshair and the target.
- **Soft combat camera framing (spec section 12) is not built.** The reticle and lock-on exist; the camera does not yet try to keep hero and target both on screen.
- **Combat visuals are minimal** (hit flash, health bar, bolts). Impacts, explosions and debris are Phase 6.
- **Dummies ignore buildings** when knocked back. Collision damage from knockback comes with real drones in Phase 5.

## 2026-10-06 — Phase 3

- **Whole city is one instanced mesh and loaded at once** (about 700 boxes, 10k triangles, 6 draw calls). Chunking waits for Phase 7, as spec section 34 allows.
- **World boundary is a headwind, not an auto-turn.** Spec section 64 describes turning the hero around in an arc; removing the outward velocity component and pushing back gives the same result without taking the controls away. Revisit if it feels like a wall.
- **Logarithmic depth buffer.** Ground layers (land, water, grid, lawn) flickered with a standard buffer at a 0.1 m near / 12 km far range. Costs some fill-rate; revisit in the optimization phase if it shows up in profiles.
- **Water is solid** at ground level, as the spec allows for the MVP. No spray yet.
- **Trees are not solid.** Hundreds of small colliders at street level would make low flight through the park frustrating at graybox stage.
- **No hills in the surround.** Boxes read badly as terrain; low blocks and distant tower clusters only.

## 2026-10-06 — Phases 1 and 2

- **Mouse orbits the camera; it does not turn the hero.** Director feedback during Phase 1. The hero's `heading` follows the direction of travel and holds when still. Flight still steers toward the aim while accelerating (spec section 9).
- **Player collision uses Rapier's `KinematicCharacterController`** rather than hand-written shape casts. It already sweeps and slides; the custom part (scrape loss, bounce, stagger) is applied to velocity afterwards from the reported hit normals.
- **Two velocity channels in flight (`cruise`, `nudge`).** A single damped velocity either lost speed in turns or made hovering floaty.
- **`Config` is mutable**, not `as const`, so the tuning panel can edit it live.
- **Opening the tuning panel releases pointer lock and pauses.** Sliders need the cursor. Values apply on resume. Tuned values are not persisted; use Copy JSON and paste into `Config.ts`.
- **Extreme speed tier is reached by sustained boost** (2 s delay, 4 s ramp). The energy cost from spec section 67 arrives with combat in Phase 4.
- **No energy trail for now.** The 1 px line version was removed on director feedback; a proper ribbon comes with the VFX pass.
- **No near-geometry whoosh audio yet** (spec section 40). Wind, rumble, boom and impact only.
- **Pointer lock is not covered by automated tests.** Headless Chromium never grants it. Tests start the simulation through the test hook instead.

## 2026-10-06 — Phase 0 bootstrap

- **TypeScript pinned to ~6.0.** typescript-eslint 8.71 declares a peer range of `<6.1.0`, and TypeScript 7 is outside it. Revisit when typescript-eslint supports 7.
- **Rapier via `@dimforge/rapier3d-compat`.** WASM is inlined as base64, so there is no separate `.wasm` to serve. Cost: the production bundle is about 4.9 MB raw / 1.8 MB gzip, almost all Rapier plus Three.js. This fits the 3 MB "flyable graybox" budget (spec section 35) but leaves limited room; if it becomes a problem, switch to the non-compat package with a WASM plugin.
- **Playwright runs headless Chromium with SwiftShader** (`--use-angle=swiftshader --enable-unsafe-swiftshader`). Smoke tests check correctness only; software-rendered frame times mean nothing.
- **Perf overlay defaults to visible in dev builds, hidden in production.** F3 toggles in both.
