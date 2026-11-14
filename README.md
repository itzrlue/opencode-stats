# opencode-stats

Always-on usage, cost and latency stats for [OpenCode](https://opencode.ai)'s TUI — a live sidebar panel that keeps your spend, token usage and tool health one glance away.

```
╭──────────────────────────────╮
│ ▼ Stats · 7d                  │
│ $1.23              +12.4%     │
│ 1.5M tok · 42 steps · 3 sessions
│ tools ████████░░░░░  93%      │
│ overall ─────────────────────│
│ $123.45            89 sessions│
│ 45.2M tok        top gpt-5.2 │
│ 12d streak · 72% cache        │
│ activity ▁▂▃▄▅▆▇█▁▂▃▄▅▆      │
╰──────────────────────────────╯
```

## Features

- **Range stats** — headline spend for the selected range with a colored delta vs the previous period (green down, orange up), tokens/steps/sessions, and a segmented tool-health bar (green/red/muted with success % and error count)
- **Overall section** — lifetime totals: all-time spend, sessions opened, tokens used, plus your **top model** (most-used by step count), active-day streak and prompt-cache hit rate
- **Activity sparkline** — all-time daily step volume
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

- `experimental.session.stats` twice per refresh: once for the selected range (with the previous-period call for the delta) and once all-time for the overall section — all `tools: "none"`/`"summary"` calls, so refreshes stay fast
- Top model comes from the stats response's `models` array (highest step count, ties broken by cost)

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

Tests cover the model-picking/range logic and formatting layers (22 tests across `test/data.test.ts` and `test/format.test.ts`).

## Requirements

- OpenCode with a server exposing `experimental.session.stats`
- TUI with plugin support (OpenCode v2)

## License

[MIT](LICENSE)
