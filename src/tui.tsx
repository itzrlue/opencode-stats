/** @jsxImportSource @opentui/solid */
import { createSignal, Show } from "solid-js"
import { Plugin } from "@opencode/plugin/tui"
import { RANGES, loadSidebarSummary, totalTokens, type Range, type SidebarSummary } from "./data"
import { delta, money, percent, segmentBar, sparkline, tokens, truncate, type Delta } from "./format"

const REFRESH_MS = 60_000
const BAR_WIDTH = 12
const SPARK_WIDTH = 20
const MODEL_MAX = 16

function StatsView(props: {
  context: Plugin.Context
  summary: () => SidebarSummary | undefined
  overall: () => SidebarSummary | undefined
  range: () => Range
}) {
  const [view, updateView] = props.context.storage.store("view", { initial: { open: true } })
  const theme = props.context.theme

  const toggle = () => {
    void updateView((draft) => {
      draft.open = !draft.open
    }).catch((error) => console.error("Failed to persist stats sidebar state", error))
  }

  const changeColor = (change: Delta) => {
    if (change.direction === "up") return theme.text.feedback.warning.base
    if (change.direction === "down") return theme.text.feedback.success.base
    return theme.text.muted
  }

  return (
    <box
      flexDirection="column"
      border
      borderStyle="rounded"
      borderColor={theme.border.base}
      paddingLeft={1}
      paddingRight={1}
    >
      <box flexDirection="row" gap={1} onMouseDown={toggle}>
        <text flexShrink={0} fg={theme.text.base}>
          {view.open ? "▼" : "▶"}
        </text>
        <text flexGrow={1} wrapMode="none" truncate minWidth={0} fg={theme.text.base}>
          <b>Stats</b>
          <span style={{ fg: theme.text.muted }}> · {props.range()}</span>
          <Show when={!view.open && props.summary()}>
            {(value) => <span style={{ fg: theme.text.muted }}> · {money(value().cost)}</span>}
          </Show>
        </text>
      </box>

      {/* Range section: this period's spend and tool health. */}
      <Show when={view.open && props.summary()}>
        {(value) => {
          const current = value()
          const tools = current.tools
          const ratio = tools.calls > 0 ? tools.succeeded / tools.calls : 0
          const cells = segmentBar([tools.succeeded, tools.failed, tools.unfinished], BAR_WIDTH)
          const change = delta(current.cost, current.previous?.cost)
          const detail = `${tokens(totalTokens(current.tokens))} tok · ${current.steps} steps · ${current.sessions} session${current.sessions === 1 ? "" : "s"}`

          return (
            <box flexDirection="column">
              <box flexDirection="row" gap={1}>
                <text flexGrow={1} wrapMode="none" truncate minWidth={0} fg={theme.text.base}>
                  <b>{money(current.cost)}</b>
                </text>
                <text flexShrink={0} fg={changeColor(change)}>
                  {change.text}
                </text>
              </box>
              <text fg={theme.text.muted} wrapMode="none" truncate minWidth={0}>
                {detail}
              </text>
              <Show when={tools.calls > 0}>
                <box flexDirection="row" gap={1}>
                  <text flexGrow={1} wrapMode="none" truncate minWidth={0} fg={theme.text.faint}>
                    tools{" "}
                    <span style={{ fg: theme.text.feedback.success.base }}>{"█".repeat(cells[0])}</span>
                    <span style={{ fg: theme.text.feedback.error.base }}>{"█".repeat(cells[1])}</span>
                    <span style={{ fg: theme.text.muted }}>{"░".repeat(cells[2])}</span>
                    {" " + percent(ratio, 0)}
                  </text>
                  <Show when={tools.failed > 0}>
                    <text flexShrink={0} fg={theme.text.feedback.error.base}>
                      {`${tools.failed} error${tools.failed > 1 ? "s" : ""}`}
                    </text>
                  </Show>
                </box>
              </Show>
            </box>
          )
        }}
      </Show>

      {/* Overall section: lifetime totals, top model, streak and activity. */}
      <Show when={view.open && props.overall()}>
        {(value) => {
          const all = value()
          const topLabel = all.topModel ? `top ${truncate(all.topModel.label, MODEL_MAX)}` : ""
          const meta = [
            `${all.streak}d streak`,
            all.cacheHit >= 0.01 ? `${percent(all.cacheHit, 0)} cache` : undefined,
          ]
            .filter(Boolean)
            .join(" · ")
          const spark = sparkline(
            all.activity.map((entry) => entry.steps),
            SPARK_WIDTH,
          )

          return (
            <box flexDirection="column">
              <box flexDirection="row" gap={1}>
                <text flexShrink={0} fg={theme.text.faint}>
                  overall
                </text>
                <text flexGrow={1} wrapMode="none" truncate minWidth={0} fg={theme.border.base}>
                  {"─".repeat(40)}
                </text>
              </box>
              <box flexDirection="row" gap={1}>
                <text flexGrow={1} wrapMode="none" truncate minWidth={0} fg={theme.text.base}>
                  <b>{money(all.cost)}</b>
                </text>
                <text flexShrink={0} fg={theme.text.muted}>
                  {`${all.sessions} session${all.sessions === 1 ? "" : "s"}`}
                </text>
              </box>
              <box flexDirection="row" gap={1}>
                <text flexGrow={1} wrapMode="none" truncate minWidth={0} fg={theme.text.muted}>
                  {`${tokens(totalTokens(all.tokens))} tok`}
                </text>
                {topLabel ? (
                  <text flexShrink={0} wrapMode="none" truncate minWidth={0} fg={theme.text.faint}>
                    {topLabel}
                  </text>
                ) : null}
              </box>
              <text fg={theme.text.faint} wrapMode="none" truncate minWidth={0}>
                {meta}
              </text>
              <Show when={all.activity.length > 0}>
                <text fg={theme.text.faint} wrapMode="none" truncate minWidth={0}>
                  activity <span style={{ fg: theme.text.muted }}>{spark}</span>
                </text>
              </Show>
            </box>
          )
        }}
      </Show>
    </box>
  )
}

export default Plugin.define({
  id: "opencode-stats",
  setup(context) {
    const [range, setRange] = createSignal<Range>("7d")
    const [summary, setSummary] = createSignal<SidebarSummary | undefined>(undefined)
    const [overall, setOverall] = createSignal<SidebarSummary | undefined>(undefined)

    let disposed = false
    let generation = 0

    const refresh = async () => {
      const current = ++generation
      try {
        const [next, lifetime] = await Promise.all([
          loadSidebarSummary(context.client, range()),
          loadSidebarSummary(context.client, "all"),
        ])
        // A slower earlier request must not clobber a newer range's numbers.
        if (!disposed && current === generation) {
          setSummary(next)
          setOverall(lifetime)
        }
      } catch {
        // Stats are best-effort: keep the last good numbers on failure.
      }
    }

    void refresh()
    const timer = setInterval(() => void refresh(), REFRESH_MS)
    const stopListening = context.data.on("session.execution.succeeded", () => void refresh())

    const removeSlot = context.ui.slot({
      append: "sidebar.content",
      render: () => <StatsView context={context} summary={summary} overall={overall} range={range} />,
    })

    context.keymap.layer(() => ({
      // global: stay reachable while the slash autocomplete (mode "autocomplete")
      // or any dialog (mode "modal") is open — base-mode layers are filtered out there.
      mode: "global",
      enabled: () => true,
      commands: [
        {
          id: "opencode-stats.range",
          title: "Cycle stats range",
          group: "Stats",
          palette: true,
          slash: { name: "stats" },
          run: () => {
            const next = RANGES[(RANGES.indexOf(range()) + 1) % RANGES.length]
            setRange(next)
            context.ui.toast.show({ message: `Stats range: ${next}`, variant: "info", duration: 2000 })
            void refresh()
          },
        },
      ],
    }))

    return () => {
      disposed = true
      clearInterval(timer)
      stopListening()
      removeSlot()
    }
  },
})
