# Decisions

Short dated entries. Newest first.

## Open verification

Things built and covered by automated tests, but never judged by a person. This is the real remaining work on the MVP.

- **Feel:** flight (spec section 57's human test), camera comfort, punching at speed, landing poses in motion.
- **Difficulty and length:** drone fights, Drone Swarm, Titan (9,000 health sized on paper for 4-6 minutes), event pacing, ring sizes in First Flight.
- **Audio:** nothing has been listened to. Levels, timbre, whether the music is pleasant.
- **Performance:** no real-GPU profile. One reading of 60 FPS at the title screen in the in-app browser; nothing during play.
- **Input:** pointer lock and Esc pause, real mouse buttons, a real gamepad.
- **Browsers:** Chromium only. Safari and Firefox untested.
- **Visuals in motion:** day/night transitions, rain building, shadows while flying fast, particle effects, most hero poses.

## 2026-10-06 — Hero movement presentation (director request)

- **Reproduced before fixing:** low-cruise sideways flight selected `ascend` even with no upward velocity; a held landing crouch survived jumping again; upward jumps used the fall pose. Regression tests failed for all three before the fixes.
- **Walking is now continuous:** quaternion blends between the stride extremes, driven by metres travelled, with stride strength fading toward idle for slow movement. Jump and damage poses added; the landing hold releases when walking or jumping resumes.
- **Banking follows travel turns**, with wrapped heading differences and a 25° cap. Mouse orbit alone does not bank or turn the hero. Space/C-only movement still stays upright.
- **Grounded poses get a visual height correction** from cached mesh bounds. The correction eases out after take-off. It does not move the capsule or camera pivot and does not change the rooftop collision fix. This is approximate lowest-point contact, not foot IK or planted-foot animation.
- **Animation tunables moved to `Config.hero`**, with numeric controls in the tuning panel. No dependencies or Blender changes.
- **Verified:** typecheck, lint, 226 unit tests, 17 Chromium smoke tests and production build pass; close-up hero/landing screenshots inspected with a clean console. Headless frame rates are not performance measurements.
- **A browser test exposed a timing-dependent particle assertion:** an explosion had only 18 survivors by the time the test inspected it, below the old >20 requirement. The test now uses a monotonically increasing emission count; the unit test still checks explosion size and expiry.
- **Still requires director judgment:** gait quality, banking comfort, landing in motion, and combat feel. Drone/Titan models still await explicit permission to drive the director's Blender; mobile remains post-MVP.

## 2026-10-06 — Filling empty ground (director feedback)

- **Midtown**: a new district of 12-46 m blocks lining both sides of the highway ring, where there used to be a bare 100 m band between downtown and everything else. Kept under 50 m so the airspace above the ring stays open for fast flight and for Titan's patrol.
- **A paved square is left south of downtown** where the First Flight course crosses at street level, rather than making the tutorial weave through buildings.
- **Residential** went from 40 m lots at 80% fill to 34 m lots at 93%, with side streets every third lot.
- **Industrial** grid tightened, plus storage tanks and sheds in the yards. **East docks** got a second container yard.
- **Suburbs are now a grid** that starts at the edge of the core at 90% fill and thins to 22% by 1.5 km, with scattered buildings beyond. Before, a random scatter began 200 m out and left a bare ring.
- **Open land carries field patches** (grass, crops, scrub, earth) instead of uniform grey.
- **Cost:** about 4,400 boxes (still one draw call) and 1,600 static colliders, up from about 700. Simulation measured 2.9 ms per frame in a headless run, inside the 4 ms budget but closer to it. Tree canopies were coarsened to compensate on triangles.
- **Still bare:** outer-district roads carry no traffic, and land beyond 1.5 km is fields with sparse buildings.

## 2026-10-06 — Hero sank into rooftops (director report)

- **Symptom:** on load the hero slowly sank up to 0.6 m into the spawn roof.
- **Cause:** standing was done by pushing the capsule down 2 m/s every step and letting Rapier's character controller stop it. On a wide surface that holds; on the top of a narrow box it lets the capsule creep in. The original floor test used a 4 km ground slab, so it never showed.
- **Fix:** on foot the controller no longer pushes down. After the horizontal move it casts the capsule down from slightly above and places it exactly on what it finds (`CollisionMover.groundOffset` / `shiftY`). No ground within 0.3 m means walking off an edge. The cast starts above the capsule, so a capsule that is already sunk is lifted back out.
- **Tests:** rooftops of five sizes, walking across and off the edge, jumping, landing from flight, and recovery from a sunk start; plus a browser check that the spawn height holds.

## 2026-10-06 — Trees and water (director feedback)

- **Trees are instanced meshes, not boxes**: lumpy multi-blob broadleaf canopies and stacked-cone conifers on tapered trunks, shading baked into vertex colours, a vertex shader for wind sway (stronger in rain) and a fragment mottle for leaf clumps. Four draw calls for about 300 trees; they cast and receive shadows.
- **Trees moved out of the building mesh** into `world/city/trees.ts` placements: park, a row down each side of the avenue, and residential yards, rejected where they would stand in a building, on a street or in the arch.
- **Still no tree colliders.**
- **Water is one shader on a flat plane**: wave normals from the analytic slope of six travelling sine waves, Fresnel mix of a depth colour and the reflected sky gradient, sun glint and sheen, shore foam driven by swell, whitecaps, rain roughening. No reflection of buildings, no refraction, no displacement.
- **Each wave fades out once it is finer than a pixel** (`fwidth` of its phase). Without that the fine waves aliased into concentric rings around the camera.
- **"Realistic" here means convincing at flight speed and distance**, not close-up. Trees are still low-poly up close, and the water does not mirror the skyline.

## 2026-10-06 — Phase 15

- **Settings are separate from tunables.** `Settings` is what a player may change, validated and saved; `Config` is what a developer tunes. `applySettings()` is the one bridge.
- **Save format bumped to version 2** to hold settings, with a migration that keeps version 1 progress.
- **The start click target is the prompt or the backdrop**, not the panels. A click on a settings slider must not start the game.
- **Mission select lives in the pause menu.** Starting from there resumes play straight away.
- **Hints stop after First Flight** and never compete with the beacon prompt or the objective text. On the ground the take-off hint wins over the combat hint, because a target is visible from the spawn roof.
- **Debug menu on Backquote with number keys**, as spec section 46 was patched to say. Not built from that list: collider wireframes and the asset inspector.
- **Reduce flashes** removes burst flashes and caps the damage vignette. It does not yet soften the sonic boom ring or explosion brightness.
- **No separate title art, loading bar or tutorial level.** The title is the menu over the live scene; loading is a line of text; the tutorial is First Flight plus hints.
- **Credits name tools, not people.** The director's name is theirs to add.

## 2026-10-06 — Phase 14

- **No GPU profiling was possible.** The only browser available for automated runs is headless with software rendering, and the in-app browser pane was hidden. What was measured: simulation cost (median under 4 ms per frame in a headless run with an event active), draw calls (about 60, budget 300), triangles (about 50k, budget 1.5M). Real-GPU frame rate is unmeasured.
- **So the phase built the means to hold frame rate rather than tuning to a number:** presets, dynamic resolution, and auto-adjust. Starts at MEDIUM as spec section 37 says and climbs to HIGH if there is headroom.
- **Auto-adjust never selects ULTRA.** Its 4096 shadow map and pixel ratio of 2 are a deliberate manual choice.
- **Removed per-frame allocations found by reading the hot paths:** a `Set` copied every frame in gamepad polling, and an options object copied per particle in bursts.
- **Not done:** merging the hero's 45 draw calls (needs a re-export from Blender), splitting the 1.8 MB gzip bundle (mostly Rapier's inlined WASM), asset streaming, mesh or texture compression. None is near a budget limit today.
- **Browser tests pin the preset to HIGH**, because software rendering would otherwise drive auto-adjust down and thin the world mid-test.

## 2026-10-06 — Phase 13

- **A full day lasts 15 minutes**, starting at 10:00. Showers arrive every 3-7 minutes and last 1-2.
- **One shadow-casting light**, 2048 map, covering 170 m around the player, snapped to texels. Buildings, ground and the hero take part; drones, traffic and pedestrians do not.
- **The moon reuses the sun's light and shadow map** at low intensity rather than adding a second light.
- **The sky is a shader dome**, not a texture: two colours and a sun glow. No clouds, stars or moon disc.
- **Night lighting is emissive only** (windows, lamps, signs, headlights). No real light sources, as spec section 32 asks.
- **Rain is lines in camera space** plus fog, dimmer light, lower ground roughness and a noise layer. No reflections or puddles.
- **Billboards are flat coloured boxes** on about 40% of towers; no artwork.
- **No tone mapping change.** Trying ACES risked shifting every colour chosen so far; left for the graphics pass.
- **Not done from the Phase 13 list:** more traffic and pedestrian variety, and atmospheric scattering beyond distance fog.

## 2026-10-06 — Phase 12 (before the rest of Phase 11)

- **Phase 11's drone and Titan models were skipped for now.** Building them means driving the director's running Blender, whose open file has unsaved work. Their go-ahead covered the hero; asking before doing more.
- **All audio is still synthesized**, music included. It is a complete pass in the sense that every category in spec section 40 makes a sound, not in the sense of quality: designed or recorded assets should replace it.
- **Music is generative and adaptive**: one arrangement function of (step, bar, intensity, boss). Intensity comes from the situation (boss > enemy engaged > objective active > nothing) and is eased, so layers fade in rather than cut.
- **Notes are scheduled 0.2 s ahead on the audio clock**, so timing does not wobble with frame rate.
- **Near-geometry whoosh** uses three rays (left, right, down) ten times a second. Cheap, and enough to make canyons sound close.
- **No audio has been listened to by a person.** Levels, timbres and whether the music is pleasant are unverified.

## 2026-10-06 — Phase 10

- **Titan has 9,000 health**, hull armour of 0.35 / 0.5 / 0.6 by phase, weak points at 1.5x and the reactor at 2.5x. Sized on paper for the 4-6 minute target; nobody has fought it by hand yet, so expect to retune.
- **Titan ignores buildings.** Its patrol runs above the ring road, which is clear of anything tall, and down the avenue in phase 3, which is 48 m wide against a 28 m machine. No collision or pathfinding.
- **Every heavy attack is telegraphed**: laser warning line for 1.3 s, hull glowing red before a swipe or pulse. The laser tracks at 0.45 rad/s so it can be out-flown, and buildings block it.
- **Titan is slower than the player's un-boosted top speed in every phase**, so breaking away is always possible.
- **The reveal eases the player's aim onto Titan** for three seconds rather than taking the camera away. Mouse input still adds on top.
- **A melee hit throws the player using the attack-lunge velocity override**, in reverse. No new movement state.
- **Graybox Titan**: boxes. A proper model is part of Phase 11.

## 2026-10-06 — Phase 9

- **Missions start at beacons on the spawn roof** (press E), not from a menu. A mission select in the pause menu comes with Phase 15.
- **First Flight is the tutorial**: take off, eight rings that use each hand-placed flight line once, boost past a speed, land back on the roof. No timer and no way to fail it.
- **Drone Swarm sends ten drones in waves of four** from the eight-drone reserve, recycling the fallen.
- **Missions cannot be failed, only abandoned** (X). Being knocked out mid-mission keeps the progress made, which is the "restart from the last checkpoint" of spec section 67 at its simplest.
- **World events are suspended during a mission** and one already running is ended quietly, because both draw on the same drone reserve.
- **The Titan mission is not defined yet**; it arrives with the boss in Phase 10.
- **Save holds score, event counts and completed missions.** Settings are not saved yet because there is no settings screen. Ability unlocks and statistics from spec section 45 do not exist yet.
- **HUD gained a speed readout and a dash cooldown bar.** Target health stays on the drone's own bar.

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
