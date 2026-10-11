# SKYBOUND — agent instructions

Read `spec.md` first. It is the source of truth; section 48 lists the agent rules.

## Current state

Built: Phases 0–10 and 12–15 of spec section 49, plus the hero model from Phase 11.

- 0–2 bootstrap, flight, camera and flight feel
- 3 city graybox, 7 street life, 13 sky / shadows / day-night / rain
- 4 combat, 5 drone AI, 6 combat VFX
- 8 world events, 9 missions + HUD + save, 10 Titan boss
- 12 audio (all synthesized), 14 quality presets and adaptive quality
- 15 menus, settings, mission select, hints, debug menu
- Hero: one fused, skinned body on a 17-bone skeleton with a simulated cape; generated walk and
  run cycle, breathing at rest, feet kept on the ground. Human feel remains unverified.
- City pass: four facade kinds, shopfronts, roofs, road markings and pavements, traffic signals,
  towers and street grid carried out past the core, about 2,400 trees, shaded ground, clouds,
  modelled cars and pedestrians.
- Heat beam (replaces the energy bolts): held, hitscan, overheats and must cool; hover-to-lock targeting.

Not built:

- Phase 11 remainder: drone and Titan models (still grayboxes). Needs the director's Blender (port 9876). Their go-ahead so far covered the hero only; do not drive their Blender for other assets until they say so.
- Phase 16: mobile and touch (post-MVP).

What is unverified is listed at the top of `docs/DECISIONS.md` under "Open verification". Almost all of it needs a person at the keyboard: feel, difficulty, audio, real-GPU frame rate, Safari and Firefox. Prefer acting on the director's play feedback over adding features.

Work one phase at a time. Update this section, `docs/ARCHITECTURE.md` and `docs/DECISIONS.md` when something lands.

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
- The renderer uses a logarithmic depth buffer. A hand-written `ShaderMaterial` must include the `logdepthbuf` chunks or it will not draw (see `vfx/BeamView.ts`).
- Any pattern drawn in a shader (windows, road paint, paving) must be antialiased with `fwidth` and fade out before it is smaller than a pixel. Hard `step()` edges are what made downtown flicker.
- The ground is a plane (`PhysicsWorld.addGround`), not a box. Do not add colliders kilometres wide: shape casts against them lose precision.
- No gameplay binding on Ctrl, Alt or Meta. Do not bind F1, F5, F6, F7, F10, F11, F12.
- Player-facing options go through `core/Settings.ts` (saved, validated); developer tunables stay in `Config`.
- No React, no backend, no ECS library, no WebGPU.
- TypeScript is pinned to 6.0.x until typescript-eslint supports 7 (see `docs/DECISIONS.md`).
- Record new dependencies and architectural decisions in `docs/DECISIONS.md`.
