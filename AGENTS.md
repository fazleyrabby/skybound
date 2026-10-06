# SKYBOUND — agent instructions

Read `spec.md` first. It is the source of truth; section 48 lists the agent rules.

## Current state

Phases 0–8 are built: bootstrap, flight prototype, camera and flight feel, city graybox, combat, enemy AI (drones), combat VFX, world system, events (drone attack).
Phase 11 (real assets) has started early at the director's request: the hero model `aether.glb` is in, built from `blender/characters/build_aether.py` and posed in code by `player/HeroRig.ts`. Drone and Titan models are not started.
Next is Phase 9 (missions and HUD: mission framework, objectives, markers, mission UI, rewards, save of progress; First Flight and Drone Swarm), spec section 49. The director is steering by playing the build and giving feedback; apply their feedback before starting new work.
Work one phase at a time and do not start the next phase's features early. Update this section, `docs/ARCHITECTURE.md` and `docs/DECISIONS.md` when a phase lands.

`spec.md` is gitignored at the director's request, so it exists only in their working copy.

## Commands

- `pnpm dev` — dev server on http://localhost:5173
- `pnpm typecheck` / `pnpm lint` / `pnpm format`
- `pnpm test` — Vitest unit tests (`tests/unit`)
- `pnpm test:e2e` — Playwright smoke tests (`tests/e2e`), starts the dev server itself
- `pnpm build` — typecheck + production build

Before reporting a task done: typecheck, lint, unit tests, e2e, and a clean browser console.

## Rules that are easy to break

- Gameplay state changes only inside the fixed step (`GameLoop` → `fixedUpdate`). Camera, VFX, audio and UI run per rendered frame.
- Never `value *= drag` or `lerp(a, b, constant)` per frame. Use `damp()` from `src/utils/math.ts`.
- Gameplay modules do not import from `rendering/`, `vfx/`, `audio/` or `ui/`.
- Every tunable goes in `src/core/Config.ts`. It is mutable on purpose: the tuning panel edits it live.
- The mouse orbits the camera and sets the aim; it never turns the hero. `PlayerState.heading` follows the direction of travel.
- Gameplay talks to presentation only through `EventBus<GameEvents>`.
- Zustand is `zustand/vanilla`, for low-frequency state only.
- No gameplay binding on Ctrl, Alt or Meta. Do not bind F1, F5, F6, F7, F10, F11, F12.
- No React, no backend, no ECS library, no WebGPU.
- TypeScript is pinned to 6.0.x until typescript-eslint supports 7 (see `docs/DECISIONS.md`).
- Record new dependencies and architectural decisions in `docs/DECISIONS.md`.
