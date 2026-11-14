/**
 * Data loading and aggregation for opencode-stats.
 *
 * Reads only the OpenCode server API through the provided client: stats
 * totals, projects, sessions, messages and model prices. Nothing here writes
 * to the database or depends on its schema.
 */

import type {
  ModelInfo,
  OpenCodeClient,
  Project,
  SessionInfo,
  SessionMessageInfo,
  SessionStatsInfo,
  TokenUsageInfo,
} from "@opencode/client"

export type Range = "24h" | "7d" | "30d" | "90d" | "all"
export type Metric = "cost" | "tokens" | "steps"
export type SortKey = "cost" | "sessions" | "tokens" | "avg" | "wall" | "p50" | "last" | "name"

export const RANGES: readonly Range[] = ["24h", "7d", "30d", "90d", "all"]
export const METRICS: readonly Metric[] = ["cost", "tokens", "steps"]

export interface Tokens {
  input: number
  output: number
  reasoning: number
  cache: { read: number; write: number }
}

export interface RangeWindow {
  from: number
  to: number
  prevFrom: number | undefined
  prevTo: number | undefined
  label: string
  days: number
}

export interface LatencySummary {
  count: number
  p50?: number
  p95?: number
  p99?: number
  mean?: number
}

export interface Call {
  id: string
  sessionID: string
  projectID: string
  projectName: string
  model: ModelRefLike | undefined
  start: number
  streamed: number | undefined
  end: number
  cost: number
  tokens: Tokens
  ttft: number | undefined
  duration: number
  stepDuration: number
  toolTime: number
  outputSpeed: number | undefined
  cacheSavings: number
}

export interface ToolCall {
  name: string
  sessionID: string
  projectID: string
  projectName: string
  start: number
  ran: number
  end: number
  status: string
  duration: number
  wait: number
  execution: number
}

export interface Daily {
  date: string
  cost: number
  tokens: number
  input: number
  output: number
  reasoning: number
  cacheRead: number
  cacheWrite: number
  steps: number
  tools: number
  prompts: number
  cacheSavings: number
}

export interface SessionData {
  id: string
  title: string
  projectID: string
  projectName: string
  parentID: string | undefined
  model: ModelRefLike | undefined
  created: number
  updated: number
  cost: number
  tokens: Tokens
  prompts: number
  steps: number
  tools: ToolCall[]
  calls: Call[]
  wall: number
  busy: number
  idle: number
  first: number | undefined
  last: number | undefined
  cacheSavings: number
  totalCost: number
  totalTokens: number
}

export interface ProjectData {
  id: string
  name: string
  path: string
  sessions: SessionData[]
  roots: SessionData[]
  children: SessionData[]
  cost: number
  tokens: Tokens
  prompts: number
  steps: number
  tools: ToolCall[]
  calls: Call[]
  wall: number
  busy: number
  idle: number
  lastActive: number
  cacheSavings: number
}

export interface ModelAgg {
  label: string
  modelID: string
  providerID: string
  steps: number
  tokens: Tokens
  cost: number
  cacheSavings: number
}

export interface DashboardTotals {
  cost: number
  tokens: Tokens
  prompts: number
  steps: number
  sessions: number
  subagents: number
  activeDays: number
  streak: number
  cacheSavings: number
  cacheHit: number
  wall: number
  busy: number
  idle: number
  tools: number
  toolErrors: number
}

export interface Dashboard {
  window: RangeWindow
  stats: SessionStatsInfo | undefined
  previous: { cost: number; tokens: number; prompts: number; steps: number } | undefined
  projects: ProjectData[]
  sessions: SessionData[]
  calls: Call[]
  tools: ToolCall[]
  daily: Record<string, Daily>
  dailyOrder: string[]
  models: ModelAgg[]
  totals: DashboardTotals
  latency: {
    ttft: LatencySummary
    duration: LatencySummary
    step: LatencySummary
    outputSpeed: LatencySummary
    toolDuration: LatencySummary
  }
  slowestCalls: Call[]
  slowestTools: ToolCall[]
}

export interface SidebarSummary {
  range: Range
  window: RangeWindow
  cost: number
  tokens: Tokens
  prompts: number
  steps: number
  sessions: number
  subagents: number
  activeDays: number
  streak: number
  cacheHit: number
  tools: { calls: number; succeeded: number; failed: number; unfinished: number }
  activity: Array<{ date: string; steps: number }>
  previous: { cost: number; steps: number } | undefined
  /** Most-used model by step count, when the server reports model usage. */
  topModel: { label: string; steps: number } | undefined
}

export interface CostSplit {
  input: number
  output: number
  cached: number
  total: number
}

/** Message cache: sessionID → messages + the session.updated they reflect. */
export interface MessageCache {
  entries: Map<string, { updated: number; messages: SessionMessageInfo[] }>
}

export function createMessageCache(): MessageCache {
  return { entries: new Map() }
}

type ModelRefLike = {
  id?: string
  modelID?: string
  providerID?: string
  variant?: string
}

type AssistantMessage = Extract<SessionMessageInfo, { type: "assistant" }>
type ToolPart = Extract<AssistantMessage["content"][number], { type: "tool" }>
type ModelPrice = ModelInfo["cost"][number]

const DAY_MS = 86_400_000
const LATENCY_CAP_MS = 10 * 60 * 1000
const MESSAGE_PAGE_SIZE = 50
const MESSAGE_PAGE_CAP = 200

export function rangeWindow(range: Range, now = Date.now()): RangeWindow {
  if (range === "all") {
    return { from: 0, to: now, prevFrom: undefined, prevTo: undefined, label: "all time", days: 0 }
  }
  const days = range === "24h" ? 1 : range === "7d" ? 7 : range === "30d" ? 30 : 90
  const to = now
  const from = now - days * DAY_MS
  return {
    from,
    to,
    prevFrom: from - days * DAY_MS,
    prevTo: from,
    label: range === "24h" ? "last 24 hours" : `last ${days} days`,
    days,
  }
}

export function emptyTokens(): Tokens {
  return { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }
}

export function totalTokens(tokens: Tokens | undefined): number {
  if (!tokens) return 0
  return (
    (tokens.input ?? 0) +
    (tokens.output ?? 0) +
    (tokens.reasoning ?? 0) +
    (tokens.cache?.read ?? 0) +
    (tokens.cache?.write ?? 0)
  )
}

function addTokens(target: Tokens, source: Partial<TokenUsageInfo> | undefined): void {
  if (!source) return
  target.input += Number(source.input ?? 0) || 0
  target.output += Number(source.output ?? 0) || 0
  target.reasoning += Number(source.reasoning ?? 0) || 0
  target.cache.read += Number(source.cache?.read ?? 0) || 0
  target.cache.write += Number(source.cache?.write ?? 0) || 0
}

function addTokensFrom(target: Tokens, source: Tokens): void {
  target.input += source.input
  target.output += source.output
  target.reasoning += source.reasoning
  target.cache.read += source.cache.read
  target.cache.write += source.cache.write
}

export function dayKey(ms: number): string {
  const date = new Date(ms)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

export function dayLabel(key: string): string {
  const [year, month, day] = key.split("-").map(Number)
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

function emptyDaily(date: string): Daily {
  return {
    date,
    cost: 0,
    tokens: 0,
    input: 0,
    output: 0,
    reasoning: 0,
    cacheRead: 0,
    cacheWrite: 0,
    steps: 0,
    tools: 0,
    prompts: 0,
    cacheSavings: 0,
  }
}

function quantile(values: readonly number[], q: number): number | undefined {
  if (values.length === 0) return undefined
  const sorted = [...values].sort((a, b) => a - b)
  const position = (sorted.length - 1) * q
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) return sorted[lower]
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower)
}

export function summary(values: readonly number[]): LatencySummary {
  const clean = values.filter((value) => Number.isFinite(value) && value >= 0)
  if (clean.length === 0) return { count: 0 }
  const sum = clean.reduce((total, value) => total + value, 0)
  return {
    count: clean.length,
    p50: quantile(clean, 0.5),
    p95: quantile(clean, 0.95),
    p99: quantile(clean, 0.99),
    mean: sum / clean.length,
  }
}

export function percentile(values: readonly number[], q: number): number | undefined {
  return quantile(values, q)
}

function mergeIntervals(intervals: Array<[number, number]>): Array<[number, number]> {
  const sorted = intervals
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0])
  const merged: Array<[number, number]> = []
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1]
    if (last && start <= last[1]) last[1] = Math.max(last[1], end)
    else merged.push([start, end])
  }
  return merged
}

export function unionLength(intervals: Array<[number, number]>): number {
  return mergeIntervals(intervals).reduce((total, [start, end]) => total + (end - start), 0)
}

function safeNumber(value: unknown): number {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  run: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const output = new Array<R>(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(Math.max(1, limit), Math.max(1, items.length)) }, async () => {
    while (true) {
      const index = next++
      if (index >= items.length) return
      output[index] = await run(items[index], index)
    }
  })
  await Promise.all(workers)
  return output
}

async function listMessages(client: OpenCodeClient, sessionID: string): Promise<SessionMessageInfo[]> {
  const messages: SessionMessageInfo[] = []
  const seen = new Set<string>()
  let cursor: string | undefined
  for (let page = 0; page < MESSAGE_PAGE_CAP; page += 1) {
    const input = cursor
      ? { sessionID, limit: MESSAGE_PAGE_SIZE, cursor }
      : { sessionID, limit: MESSAGE_PAGE_SIZE, order: "asc" as const }
    let response: Awaited<ReturnType<OpenCodeClient["message"]["list"]>>
    try {
      response = await client.message.list(input)
    } catch {
      break
    }
    messages.push(...response.data)
    const next = response.cursor?.next ?? undefined
    if (!next || next === cursor || seen.has(next) || response.data.length === 0) break
    seen.add(next)
    cursor = next
  }
  return messages
}

export function projectLabel(project: Project | { id: string; canonical?: string; name?: string } | undefined): string {
  if (!project) return "global"
  if (typeof project.name === "string" && project.name.trim()) return project.name.trim()
  const path = String(project.canonical ?? "").replace(/\/+$/, "")
  if (!path || path === "/") return project.id === "global" ? "global" : String(project.id ?? "global")
  const parts = path.split("/").filter(Boolean)
  return parts[parts.length - 1] ?? path
}

function priceMapFrom(models: readonly ModelInfo[]): Map<string, ModelPrice> {
  const byKey = new Map<string, ModelPrice>()
  for (const model of models) {
    const cost = model.cost?.[0]
    if (!cost) continue
    byKey.set(`${model.providerID}/${model.modelID}`, cost)
    byKey.set(model.modelID, cost)
    if (model.canonical) byKey.set(`${model.canonical}/${model.modelID}`, cost)
  }
  return byKey
}

function priceFor(model: ModelRefLike | undefined, prices: Map<string, ModelPrice>): ModelPrice | undefined {
  const modelID = model?.modelID ?? model?.id
  if (!modelID) return undefined
  return (
    prices.get(`${model?.providerID ?? ""}/${modelID}`) ??
    prices.get(modelID) ??
    prices.get(`${model?.providerID ?? ""}/${modelID.split("/").pop() ?? modelID}`)
  )
}

function cacheSavingsFor(
  model: ModelRefLike | undefined,
  tokens: Tokens,
  prices: Map<string, ModelPrice>,
): number {
  const price = priceFor(model, prices)
  if (!price) return 0
  const input = safeNumber(price.input)
  const cacheRead = safeNumber(price.cache?.read ?? input)
  const readTokens = tokens.cache.read
  if (readTokens <= 0 || input <= cacheRead) return 0
  return (readTokens * (input - cacheRead)) / 1_000_000
}

function inWindow(ms: number, from: number, to: number): boolean {
  return Number.isFinite(ms) && ms >= from && ms <= to
}

interface BuiltSession {
  session: SessionData
  promptsByDay: Record<string, number>
}

function buildSession(
  raw: SessionInfo,
  messages: readonly SessionMessageInfo[],
  win: RangeWindow,
  projectName: string,
  prices: Map<string, ModelPrice>,
): BuiltSession {
  const tokens = emptyTokens()
  const calls: Call[] = []
  const tools: ToolCall[] = []
  const intervals: Array<[number, number]> = []
  const promptsByDay: Record<string, number> = {}
  let prompts = 0
  let cost = 0
  let cacheSavings = 0
  let first = Number.POSITIVE_INFINITY
  let last = Number.NEGATIVE_INFINITY
  const projectID = raw.projectID ?? "global"

  for (const message of messages) {
    if (message.type === "user") {
      const at = safeNumber(message.time.created)
      if (inWindow(at, win.from, win.to)) {
        prompts += 1
        const key = dayKey(at)
        promptsByDay[key] = (promptsByDay[key] ?? 0) + 1
      }
      continue
    }
    if (message.type !== "assistant") continue
    const assistant: AssistantMessage = message
    const end = safeNumber(assistant.time.completed)
    if (!end || !inWindow(end, win.from, win.to)) continue
    const start = safeNumber(assistant.time.created) || end
    const streamed =
      Number.isFinite(assistant.time.streamed) && (assistant.time.streamed ?? 0) > 0
        ? assistant.time.streamed
        : undefined

    const messageTokens = emptyTokens()
    addTokens(messageTokens, assistant.tokens)
    addTokens(tokens, assistant.tokens)
    const messageCost = safeNumber(assistant.cost)
    const savings = cacheSavingsFor(assistant.model ?? raw.model, messageTokens, prices)
    cost += messageCost
    cacheSavings += savings

    const messageTools: ToolCall[] = []
    for (const part of assistant.content) {
      if (part.type !== "tool") continue
      const tool: ToolPart = part
      const toolStart = safeNumber(tool.time.created) || safeNumber(tool.time.ran)
      const toolEnd = safeNumber(tool.time.completed)
      if (!toolStart || !toolEnd || toolEnd < toolStart) continue
      const ran = safeNumber(tool.time.ran) || toolStart
      messageTools.push({
        name: String(tool.name ?? "tool"),
        sessionID: String(raw.id),
        projectID: String(projectID),
        projectName,
        start: toolStart,
        ran,
        end: toolEnd,
        status: String(tool.state.status ?? "completed"),
        duration: Math.max(0, toolEnd - toolStart),
        wait: Math.max(0, ran - toolStart),
        execution: Math.max(0, toolEnd - ran),
      })
    }

    const toolTime = unionLength(messageTools.map((tool) => [tool.start, tool.end] as [number, number]))
    const firstToolStart =
      messageTools.length > 0 ? Math.min(...messageTools.map((tool) => tool.start)) : end
    const modelEnd = Math.max(start, Math.min(end, firstToolStart))
    const stepDuration = Math.max(0, end - start)
    const callDuration = Math.max(0, modelEnd - start)
    const output = messageTokens.output
    const call: Call = {
      id: String(assistant.id),
      sessionID: String(raw.id),
      projectID: String(projectID),
      projectName,
      model: assistant.model ?? raw.model,
      start,
      streamed,
      end,
      cost: messageCost,
      tokens: messageTokens,
      ttft: streamed !== undefined ? Math.max(0, streamed - start) : undefined,
      duration: callDuration,
      stepDuration,
      toolTime,
      outputSpeed: output > 0 && callDuration > 0 ? output / (callDuration / 1000) : undefined,
      cacheSavings: savings,
    }
    calls.push(call)
    tools.push(...messageTools)
    intervals.push([start, end])
    first = Math.min(first, start)
    last = Math.max(last, end)
  }

  const created = safeNumber(raw.time.created)
  const updated = safeNumber(raw.time.updated) || created
  const callStart = Number.isFinite(first) ? first : created
  const callEnd = Number.isFinite(last) ? last : updated
  const wall = Math.max(0, callEnd - callStart) || Math.max(0, updated - created)
  const busy = unionLength(intervals)
  const idle = Math.max(0, wall - busy)

  return {
    session: {
      id: String(raw.id),
      title: String(raw.title ?? "Untitled session"),
      projectID: String(projectID),
      projectName,
      parentID: raw.parentID ? String(raw.parentID) : undefined,
      model: raw.model,
      created,
      updated,
      cost,
      tokens,
      prompts,
      steps: calls.length,
      tools,
      calls,
      wall,
      busy,
      idle,
      first: Number.isFinite(first) ? first : undefined,
      last: Number.isFinite(last) ? last : undefined,
      cacheSavings,
      totalCost: safeNumber(raw.cost),
      totalTokens: totalTokens(raw.tokens),
    },
    promptsByDay,
  }
}

function projectAggregate(project: Project | { id: string; canonical?: string }, sessions: SessionData[]): ProjectData {
  const roots = sessions.filter((session) => !session.parentID)
  const children = sessions.filter((session) => Boolean(session.parentID))
  const calls = sessions.flatMap((session) => session.calls)
  const tools = sessions.flatMap((session) => session.tools)
  const tokens = emptyTokens()
  let cost = 0
  let prompts = 0
  let cacheSavings = 0
  let lastActive = 0
  for (const session of sessions) {
    cost += session.cost
    prompts += session.prompts
    cacheSavings += session.cacheSavings
    addTokensFrom(tokens, session.tokens)
    lastActive = Math.max(lastActive, session.updated)
  }
  const busy = unionLength(calls.map((call) => [call.start, call.end] as [number, number]))
  const wall =
    calls.length > 0 ? Math.max(...calls.map((call) => call.end)) - Math.min(...calls.map((call) => call.start)) : 0
  const canonical = "canonical" in project ? project.canonical : undefined
  return {
    id: String(project.id ?? "global"),
    name: projectLabel(project),
    path: String(canonical ?? ""),
    sessions,
    roots,
    children,
    cost,
    tokens,
    prompts,
    steps: calls.length,
    tools,
    calls,
    wall,
    busy,
    idle: Math.max(0, wall - busy),
    lastActive,
    cacheSavings,
  }
}

function statsTokens(stats: SessionStatsInfo | undefined): Tokens {
  const tokens = emptyTokens()
  addTokens(tokens, stats?.tokens)
  return tokens
}

function previousFrom(stats: SessionStatsInfo | undefined) {
  if (!stats) return undefined
  return {
    cost: safeNumber(stats.cost),
    tokens: totalTokens(stats.tokens),
    prompts: safeNumber(stats.prompts),
    steps: safeNumber(stats.steps),
  }
}

async function statsCall(
  client: OpenCodeClient,
  input: { from?: number; to: number; timezone: string; tools: "none" | "summary"; project?: string },
): Promise<SessionStatsInfo | undefined> {
  try {
    return await client.experimental.session.stats(input)
  } catch {
    return undefined
  }
}

export interface LoadOptions {
  onPhase?: (phase: string) => void
  onProgress?: (done: number, total: number) => void
}

/**
 * Loads the full dashboard for a range. Completed sessions reuse the message
 * cache, so repeated (live) refreshes only fetch messages of sessions that
 * changed since the last load.
 */
export async function loadDashboard(
  client: OpenCodeClient,
  range: Range,
  cache: MessageCache,
  options: LoadOptions = {},
): Promise<Dashboard> {
  const { onPhase = () => {}, onProgress = () => {} } = options
  const win = rangeWindow(range)
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

  onPhase("Loading totals")
  const statsPromise = statsCall(client, {
    ...(win.from > 0 ? { from: win.from } : {}),
    to: win.to,
    timezone,
    tools: "summary",
  })
  const previousPromise =
    win.prevFrom !== undefined && win.prevTo !== undefined
      ? statsCall(client, { from: win.prevFrom, to: win.prevTo, timezone, tools: "none" })
      : Promise.resolve(undefined)
  const projectsPromise = client.project.list().catch(() => [] as Project[])
  const modelsPromise = client.model.list().catch(() => undefined)

  const [stats, previousStats, rawProjects, modelsResponse] = await Promise.all([
    statsPromise,
    previousPromise,
    projectsPromise,
    modelsPromise,
  ])
  const previous = previousFrom(previousStats)

  onPhase("Loading sessions")
  const projectList: Project[] = rawProjects.length > 0 ? rawProjects : [{ id: "global" } as Project]
  const projectByID = new Map<string, Project>()
  for (const project of projectList) projectByID.set(String(project.id), project)

  const sessionLists = await Promise.all(
    projectList.map(async (project) => {
      try {
        const response = await client.session.list({ project: String(project.id), limit: 1000, order: "desc" })
        return response.data
      } catch {
        return [] as SessionInfo[]
      }
    }),
  )

  const rawSessions: SessionInfo[] = []
  const seenSessions = new Set<string>()
  for (const list of sessionLists) {
    for (const session of list) {
      const id = String(session.id)
      if (!id || seenSessions.has(id)) continue
      seenSessions.add(id)
      rawSessions.push(session)
    }
  }

  const candidates = rawSessions.filter((session) => {
    if (range === "all") return true
    const updated = safeNumber(session.time.updated)
    const created = safeNumber(session.time.created)
    return updated >= win.from || created >= win.from
  })

  onPhase("Loading messages")
  let done = 0
  onProgress(0, candidates.length)
  await mapLimit(candidates, 4, async (session) => {
    const id = String(session.id)
    const updated = safeNumber(session.time.updated)
    const cached = cache.entries.get(id)
    if (!cached || cached.updated < updated) {
      let messages: SessionMessageInfo[] = []
      try {
        messages = await listMessages(client, id)
      } catch {
        messages = []
      }
      cache.entries.set(id, { updated, messages })
    }
    done += 1
    onProgress(done, candidates.length)
  })

  onPhase("Aggregating")
  const prices = modelsResponse ? priceMapFrom(modelsResponse.data ?? []) : new Map<string, ModelPrice>()

  const built: SessionData[] = []
  const promptsByDay: Record<string, number> = {}
  for (const raw of candidates) {
    const projectID = String(raw.projectID ?? "global")
    const project = projectByID.get(projectID)
    const name = projectLabel(project ?? { id: projectID })
    const entry = cache.entries.get(String(raw.id))
    const result = buildSession(raw, entry?.messages ?? [], win, name, prices)
    built.push(result.session)
    for (const [key, count] of Object.entries(result.promptsByDay)) {
      promptsByDay[key] = (promptsByDay[key] ?? 0) + count
    }
  }

  const sessionsByProject = new Map<string, SessionData[]>()
  for (const session of built) {
    const list = sessionsByProject.get(session.projectID) ?? []
    list.push(session)
    sessionsByProject.set(session.projectID, list)
  }
  const projects: ProjectData[] = projectList
    .map((project) => projectAggregate(project, sessionsByProject.get(String(project.id)) ?? []))
    .filter(
      (project) =>
        project.sessions.length > 0 || project.cost > 0 || String(project.id) === "global",
    )
  for (const [projectID, sessions] of sessionsByProject) {
    if (projectList.some((project) => String(project.id) === projectID)) continue
    projects.push(projectAggregate({ id: projectID }, sessions))
  }

  const calls = built.flatMap((session) => session.calls)
  const tools = built.flatMap((session) => session.tools)

  const daily: Record<string, Daily> = {}
  const dailyFor = (key: string) => (daily[key] ??= emptyDaily(key))
  for (const call of calls) {
    const bucket = dailyFor(dayKey(call.end))
    bucket.cost += call.cost
    bucket.input += call.tokens.input
    bucket.output += call.tokens.output
    bucket.reasoning += call.tokens.reasoning
    bucket.cacheRead += call.tokens.cache.read
    bucket.cacheWrite += call.tokens.cache.write
    bucket.tokens += totalTokens(call.tokens)
    bucket.steps += 1
    bucket.cacheSavings += call.cacheSavings
  }
  for (const tool of tools) dailyFor(dayKey(tool.end)).tools += 1
  for (const [key, count] of Object.entries(promptsByDay)) dailyFor(key).prompts += count
  const dailyOrder = Object.keys(daily).sort()

  const totals: DashboardTotals = {
    cost: 0,
    tokens: emptyTokens(),
    prompts: 0,
    steps: calls.length,
    sessions: built.filter((session) => !session.parentID).length,
    subagents: built.filter((session) => Boolean(session.parentID)).length,
    activeDays: 0,
    streak: 0,
    cacheSavings: 0,
    cacheHit: 0,
    wall: 0,
    busy: 0,
    idle: 0,
    tools: tools.length,
    toolErrors: tools.filter((tool) => tool.status === "error").length,
  }
  for (const session of built) {
    totals.cost += session.cost
    totals.prompts += session.prompts
    totals.cacheSavings += session.cacheSavings
    addTokensFrom(totals.tokens, session.tokens)
  }
  totals.activeDays = dailyOrder.filter((key) => daily[key].steps > 0 || daily[key].prompts > 0).length
  const cacheDenominator = totals.tokens.cache.read + totals.tokens.input + totals.tokens.cache.write
  totals.cacheHit = cacheDenominator > 0 ? totals.tokens.cache.read / cacheDenominator : 0
  const busyIntervals = calls.map((call) => [call.start, call.end] as [number, number])
  totals.busy = unionLength(busyIntervals)
  if (calls.length > 0) {
    const start = Math.min(...calls.map((call) => call.start))
    const end = Math.max(...calls.map((call) => call.end))
    totals.wall = Math.max(0, end - start)
    totals.idle = Math.max(0, totals.wall - totals.busy)
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  if (!daily[dayKey(today.getTime())]?.steps) today.setDate(today.getDate() - 1)
  while (daily[dayKey(today.getTime())]?.steps) {
    totals.streak += 1
    today.setDate(today.getDate() - 1)
  }

  const modelsByKey = new Map<string, ModelAgg>()
  for (const call of calls) {
    const modelID = call.model?.modelID ?? call.model?.id ?? ""
    const providerID = call.model?.providerID ?? ""
    const key = modelID ? `${providerID}/${modelID}` : "unknown"
    const existing =
      modelsByKey.get(key) ??
      ({
        label: modelID ? (providerID ? `${providerID}/${modelID}` : modelID) : "unknown",
        modelID,
        providerID,
        steps: 0,
        tokens: emptyTokens(),
        cost: 0,
        cacheSavings: 0,
      } satisfies ModelAgg)
    existing.steps += 1
    existing.cost += call.cost
    existing.cacheSavings += call.cacheSavings
    addTokensFrom(existing.tokens, call.tokens)
    modelsByKey.set(key, existing)
  }

  const latencyCalls = calls.filter((call) => call.duration <= LATENCY_CAP_MS)
  const latency = {
    ttft: summary(calls.flatMap((call) => (call.ttft !== undefined ? [call.ttft] : []))),
    duration: summary(latencyCalls.map((call) => call.duration)),
    step: summary(latencyCalls.map((call) => call.stepDuration)),
    outputSpeed: summary(
      latencyCalls.flatMap((call) => (call.outputSpeed !== undefined ? [call.outputSpeed] : [])),
    ),
    toolDuration: summary(
      tools.filter((tool) => tool.duration <= LATENCY_CAP_MS).map((tool) => tool.duration),
    ),
  }

  return {
    window: win,
    stats,
    previous,
    projects: projects.sort((a, b) => b.cost - a.cost),
    sessions: built,
    calls,
    tools,
    daily,
    dailyOrder,
    models: [...modelsByKey.values()].sort((a, b) => b.cost - a.cost),
    totals,
    latency,
    slowestCalls: [...calls].sort((a, b) => b.duration - a.duration).slice(0, 20),
    slowestTools: [...tools].sort((a, b) => b.duration - a.duration).slice(0, 20),
  }
}

/**
 * Picks the most-used model from stats model usage, by step count.
 * Ties go to the higher-cost model; models without an id are skipped.
 */
export function pickTopModel(
  models: ReadonlyArray<{ model?: { id?: string } | undefined; steps?: number; cost?: number }> | undefined,
): { label: string; steps: number } | undefined {
  if (!models || models.length === 0) return undefined
  let best: { label: string; steps: number; cost: number } | undefined
  for (const entry of models) {
    const id = String(entry.model?.id ?? "")
    if (!id) continue
    const steps = safeNumber(entry.steps)
    const cost = safeNumber(entry.cost)
    if (!best || steps > best.steps || (steps === best.steps && cost > best.cost)) {
      best = { label: id, steps, cost }
    }
  }
  if (!best || best.steps <= 0) return undefined
  return { label: best.label, steps: best.steps }
}

/** A cheap range summary for the sidebar: stats requests only, no messages. */
export async function loadSidebarSummary(
  client: OpenCodeClient,
  range: Range,
  options: { project?: string; previous?: boolean } = {},
  now = Date.now(),
): Promise<SidebarSummary> {
  const win = rangeWindow(range, now)
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const current = await statsCall(client, {
    ...(win.from > 0 ? { from: win.from } : {}),
    to: win.to,
    timezone,
    tools: "summary",
    ...(options.project ? { project: options.project } : {}),
  })

  let previous: SidebarSummary["previous"]
  if (options.previous !== false && win.prevFrom !== undefined && win.prevTo !== undefined) {
    const prior = await statsCall(client, {
      from: win.prevFrom,
      to: win.prevTo,
      timezone,
      tools: "none",
      ...(options.project ? { project: options.project } : {}),
    })
    if (prior) previous = { cost: safeNumber(prior.cost), steps: safeNumber(prior.steps) }
  }

  const tokens = statsTokens(current)
  const toolTotals =
    current && current.tools.mode !== "none" && "totals" in current.tools ? current.tools.totals : undefined

  return {
    range,
    window: win,
    cost: safeNumber(current?.cost),
    tokens,
    prompts: safeNumber(current?.prompts),
    steps: safeNumber(current?.steps),
    sessions: safeNumber(current?.sessions),
    subagents: safeNumber(current?.subagents),
    activeDays: safeNumber(current?.activeDays),
    streak: safeNumber(current?.streak),
    cacheHit:
      tokens.cache.read + tokens.input + tokens.cache.write > 0
        ? tokens.cache.read / (tokens.cache.read + tokens.input + tokens.cache.write)
        : 0,
    tools: {
      calls: safeNumber(toolTotals?.calls),
      succeeded: safeNumber(toolTotals?.succeeded),
      failed: safeNumber(toolTotals?.failed),
      unfinished: safeNumber(toolTotals?.unfinished),
    },
    activity: (current?.activity ?? []).map((item) => ({ date: String(item.date), steps: safeNumber(item.steps) })),
    previous,
    topModel: pickTopModel(current?.models),
  }
}

/** Prices are static for a process, so read the model catalog once. */
let priceCache: Promise<Map<string, ModelPrice>> | undefined

export function loadPriceMap(client: OpenCodeClient): Promise<Map<string, ModelPrice>> {
  if (!priceCache) {
    priceCache = (async () => {
      try {
        const response = await client.model.list()
        return priceMapFrom(response.data ?? [])
      } catch {
        return new Map<string, ModelPrice>()
      }
    })()
  }
  return priceCache
}

/**
 * Split a session's cost by where the tokens came from. Token counts times
 * the model's per-million prices give the shape; scaling to the reported
 * session cost keeps the total exact.
 */
export function sessionCostSplit(
  session: { tokens?: Partial<TokenUsageInfo> | undefined; cost?: number | undefined; model?: ModelRefLike | undefined },
  prices: Map<string, ModelPrice>,
): CostSplit {
  const price = priceFor(session.model, prices)
  const inputPrice = safeNumber(price?.input)
  const outputPrice = safeNumber(price?.output)
  const readPrice = safeNumber(price?.cache?.read ?? price?.input)
  const writePrice = safeNumber(price?.cache?.write ?? price?.input)

  const inputTokens = safeNumber(session.tokens?.input)
  const outputTokens = safeNumber(session.tokens?.output)
  const readTokens = safeNumber(session.tokens?.cache?.read)
  const writeTokens = safeNumber(session.tokens?.cache?.write)

  const input = (inputTokens * inputPrice) / 1_000_000
  const output = (outputTokens * outputPrice) / 1_000_000
  const cached = (readTokens * readPrice + writeTokens * writePrice) / 1_000_000
  const computed = input + output + cached
  const actual = safeNumber(session.cost)

  if (computed > 0 && actual > 0) {
    const scale = actual / computed
    return { input: input * scale, output: output * scale, cached: cached * scale, total: actual }
  }

  const tokenTotal = inputTokens + outputTokens + readTokens + writeTokens
  if (tokenTotal > 0 && actual > 0) {
    return {
      input: (actual * inputTokens) / tokenTotal,
      output: (actual * outputTokens) / tokenTotal,
      cached: (actual * (readTokens + writeTokens)) / tokenTotal,
      total: actual,
    }
  }

  return { input, output, cached, total: computed }
}
