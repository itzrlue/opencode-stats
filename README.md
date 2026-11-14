# opencode-stats

Always-on usage, cost and latency stats for [OpenCode](https://opencode.ai)'s TUI — a live sidebar panel that keeps your spend, token usage and tool health one glance away.

```
╭────────────────────────────╮
│ ▼ Stats · 7d               │
│ $1.23              +12.4%  │
│ 1.5M tok · 42 steps · 3 sessions
│ tools ████████░░░░░  93%   │
│ activity ▁▂▃▄▅▆▇█▁▂▃▄▅▆    │
│ 5d streak · 72% cache      │
╰────────────────────────────╯
```

## Features

- **Cost at a glance** — headline spend for the selected range with a colored delta vs the previous period (green down, orange up)
- **Usage breakdown** — tokens, steps and session count in one line
- **Tool health bar** — segmented bar of succeeded / failed / unfinished tool calls with a success percentage and an error count when things go wrong
- **Activity sparkline** — daily step volume for the range
- **Streak & cache** — active-day streak and prompt-cache hit rate
- **Collapsible** — click the header to collapse the panel; the cost stays visible
- **Range cycling** — `/stats` (or the command palette) cycles `24h → 7d → 30d → 90d → all`
- **Live** — refreshes every 60 seconds and whenever a session execution succeeds
- **Best-effort** — stats failures never crash the TUI; the last good numbers are kept

## Install

### As a local plugin (this repo)

Add the repo path to the `plugins` array in your global `cli.json`
(`~/.config/opencode/cli.json` on Linux/macOS, `%USERPROFILE%\.config\opencode\cli.json` on Windows):

```jsonc
{
  "plugins": [
    "./plugins/codex-pet",
    "/absolute/path/to/opencode-stats"
  ]
}
```

`opencode-stats` is a TUI-only package, so it belongs in `cli.json` (not `opencode.json`).
Config changes hot-reload; if the panel doesn't appear, run `/reload` in the TUI.

### Verify it loaded

```bash
opencode plugin list
```

You should see `opencode-stats` with `SOURCE` pointing at this directory.

## Usage

| Action | How |
| --- | --- |
| Toggle the panel | Click the `▼ Stats · 7d` header |
| Cycle the range | Type `/stats` or run **Stats: Cycle stats range** from the command palette |

Ranges: `24h`, `7d`, `30d`, `90d`, `all`.

## How it works

The panel reads only the OpenCode server API through the connected client — no database access, no writes:

- `experimental.session.stats` for cheap range totals (cost, tokens, steps, streak, cache hit, tool totals, daily activity)
- Two calls per refresh (current range + previous range for the delta), so refreshes stay fast

All aggregation and formatting live in pure, tested modules:

| File | Responsibility |
| --- | --- |
| `src/tui.tsx` | Sidebar panel, refresh loop, `/stats` command |
| `src/data.ts` | Server API reads and range/window helpers |
| `src/format.ts` | Pure display formatting (money, tokens, sparkline, delta, bars) |

## Development

Requires Node.js >= 22.13.

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest run
```

Tests cover the formatting layer (`test/format.test.ts`).

## Requirements

- OpenCode with a server exposing `experimental.session.stats`
- TUI with plugin support (OpenCode v2)

## License

[MIT](LICENSE)
