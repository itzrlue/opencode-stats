# Changelog

## 0.2.0

- **Overall section**: all-time totals — lifetime spend, sessions opened, tokens used
- **Top model**: most-used model by step count (ties broken by cost)
- Section divider separating range stats from lifetime stats
- Streak and cache-hit rate moved to the overall section
- Activity sparkline now shows all-time daily steps
- New unit tests for model picking and range windows (22 total)

## 0.1.0

Initial release.

- Sidebar stats panel: cost with period delta, tokens/steps/sessions, tool-health bar, activity sparkline, streak and cache-hit rate
- Collapsible panel header with persisted open/closed state
- `/stats` slash command and command-palette entry to cycle the range (`24h`, `7d`, `30d`, `90d`, `all`)
- Auto-refresh every 60s and on successful session execution
- Pure, tested formatting layer (`money`, `tokens`, `delta`, `sparkline`, `segmentBar`, …)
