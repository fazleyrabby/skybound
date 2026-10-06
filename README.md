# SKYBOUND

Browser-based 3D superhero flight game. Working title. See [spec.md](spec.md).

Status: playable vertical slice. Fly around Nova City, fight drones, respond to drone attacks, play three missions (First Flight, Drone Swarm, Titan). Graybox city, one modelled hero, synthesized audio. Most of it has not been play-tested by a person yet; see "Open verification" in [docs/DECISIONS.md](docs/DECISIONS.md).

## Run

```bash
pnpm install
pnpm dev
```

Open http://localhost:5173 and click "Click to fly". Controls, settings and the mission list are on the title and pause screens. F3 toggles the performance overlay; Backquote opens the debug menu.

## Check

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e
```

The first e2e run needs `pnpm exec playwright install chromium`.

## Docs

- [spec.md](spec.md) — specification
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how the code is organised
- [docs/DECISIONS.md](docs/DECISIONS.md) — dated decisions
- [AGENTS.md](AGENTS.md) — instructions for coding agents
