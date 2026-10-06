# SKYBOUND

Browser-based 3D superhero flight game. Working title. See [spec.md](spec.md).

Status: Phases 0–2 — a placeholder hero flying around a graybox test block, with camera, speed effects and synthesized audio. Flight feel is being tuned.

## Run

```bash
pnpm install
pnpm dev
```

Open http://localhost:5173 and click to fly. Controls are listed on the start screen. F3 toggles the performance overlay; Backquote opens the tuning panel.

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
