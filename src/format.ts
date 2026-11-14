/** Display formatting for opencode-stats. Pure functions only. */

export function money(value: number): string {
  if (!Number.isFinite(value)) return "$0"
  const abs = Math.abs(value)
  if (abs === 0) return "$0"
  if (abs >= 1000) return "$" + value.toLocaleString(undefined, { maximumFractionDigits: 0 })
  if (abs >= 1) return "$" + value.toFixed(2)
  if (abs >= 0.01) return "$" + value.toFixed(3)
  const digits = abs < 0.0001 ? 8 : 6
  return "$" + value.toFixed(digits).replace(/0+$/, "")
}

export function tokens(value: number): string {
  if (!Number.isFinite(value)) return "0"
  const abs = Math.abs(value)
  if (abs >= 1e9) return trim((value / 1e9).toFixed(1)) + "B"
  if (abs >= 1e6) return trim((value / 1e6).toFixed(1)) + "M"
  if (abs >= 1e4) return trim((value / 1e3).toFixed(1)) + "k"
  if (abs >= 1000) return trim((value / 1e3).toFixed(2)) + "k"
  return String(Math.round(value))
}

function trim(text: string): string {
  return text.replace(/\.0$/, "")
}

export function duration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0ms"
  if (ms < 1000) return Math.round(ms) + "ms"
  if (ms < 60_000) return (ms / 1000).toFixed(ms < 10_000 ? 1 : 0) + "s"
  const totalSeconds = Math.round(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes < 60) return `${minutes}m${String(seconds).padStart(2, "0")}s`
  const hours = Math.floor(minutes / 60)
  return `${hours}h${String(minutes % 60).padStart(2, "0")}m`
}

export function percent(fraction: number, digits = 1): string {
  if (!Number.isFinite(fraction)) return "0%"
  return (fraction * 100).toFixed(digits) + "%"
}

export interface Delta {
  text: string
  direction: "up" | "down" | "flat"
}

/** Signed change of current vs previous, as a display string. */
export function delta(current: number, previous: number | undefined): Delta {
  if (previous === undefined || !Number.isFinite(previous)) return { text: "—", direction: "flat" }
  if (previous === 0) {
    if (current === 0) return { text: "0%", direction: "flat" }
    return { text: "new", direction: "up" }
  }
  const change = (current - previous) / Math.abs(previous)
  const sign = change > 0 ? "+" : ""
  return {
    text: `${sign}${(change * 100).toFixed(1)}%`,
    direction: change > 0.0005 ? "up" : change < -0.0005 ? "down" : "flat",
  }
}

const SPARK_CHARS = "▁▂▃▄▅▆▇█"

/** Block-glyph sparkline, downsampled to at most `width` columns. */
export function sparkline(values: readonly number[], width = 24): string {
  if (values.length === 0) return ""
  const buckets = downsample(values, Math.max(1, Math.min(width, values.length)))
  let max = 0
  for (const value of buckets) if (Number.isFinite(value) && value > max) max = value
  if (max <= 0) return SPARK_CHARS[0].repeat(buckets.length)
  let out = ""
  for (const value of buckets) {
    const safe = Number.isFinite(value) && value > 0 ? value : 0
    const index = Math.min(SPARK_CHARS.length - 1, Math.floor((safe / max) * SPARK_CHARS.length))
    out += SPARK_CHARS[index]
  }
  return out
}

function downsample(values: readonly number[], count: number): number[] {
  if (values.length <= count) return [...values]
  const out: number[] = []
  const size = values.length / count
  for (let bucket = 0; bucket < count; bucket += 1) {
    const start = Math.floor(bucket * size)
    const end = Math.max(start + 1, Math.floor((bucket + 1) * size))
    let sum = 0
    for (let index = start; index < end && index < values.length; index += 1) sum += values[index] ?? 0
    out.push(sum)
  }
  return out
}

export function timeAgo(ms: number, now = Date.now()): string {
  const elapsed = now - ms
  if (!Number.isFinite(elapsed) || elapsed < 0) return "now"
  const seconds = Math.floor(elapsed / 1000)
  if (seconds < 60) return "now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

/** Fit a label into `width` columns, ellipsized on the right. */
export function truncate(text: string, width: number): string {
  if (width <= 0) return ""
  if (text.length <= width) return text
  if (width === 1) return text.slice(0, 1)
  return text.slice(0, width - 1) + "…"
}

/** Pad a label to `width` columns on the right. */
export function padEnd(text: string, width: number): string {
  return text.length >= width ? text : text + " ".repeat(width - text.length)
}

/** Pad a label to `width` columns on the left. */
export function padStart(text: string, width: number): string {
  return text.length >= width ? text : " ".repeat(width - text.length) + text
}

/** A one-line split bar of proportional segments (width in cells). */
export function segmentBar(segments: readonly number[], width: number): number[] {
  const total = segments.reduce((sum, value) => sum + Math.max(0, value), 0)
  const cells = segments.map(() => 0)
  if (total <= 0 || width <= 0) return cells
  let assigned = 0
  for (let index = 0; index < segments.length; index += 1) {
    const share = Math.max(0, segments[index] ?? 0) / total
    const count = index === segments.length - 1 ? width - assigned : Math.floor(share * width)
    cells[index] = Math.max(0, Math.min(count, width - assigned))
    assigned += cells[index]
  }
  return cells
}
