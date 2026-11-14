import { describe, expect, it } from "vitest"
import {
  delta,
  duration,
  money,
  padEnd,
  percent,
  segmentBar,
  sparkline,
  tokens,
  truncate,
} from "../src/format"

describe("money", () => {
  it("formats whole and cent amounts", () => {
    expect(money(0)).toBe("$0")
    expect(money(1.5)).toBe("$1.50")
    expect(money(12.345)).toBe("$12.35")
    expect(money(1234.5)).toBe("$1,235")
  })

  it("formats sub-cent amounts without trailing zeros", () => {
    expect(money(0.0042)).toBe("$0.0042")
    expect(money(0.00001)).toBe("$0.00001")
  })

  it("handles non-finite input", () => {
    expect(money(Number.NaN)).toBe("$0")
  })
})

describe("tokens", () => {
  it("abbreviates large counts", () => {
    expect(tokens(999)).toBe("999")
    expect(tokens(1500)).toBe("1.50k")
    expect(tokens(23_400)).toBe("23.4k")
    expect(tokens(2_500_000)).toBe("2.5M")
    expect(tokens(3_100_000_000)).toBe("3.1B")
  })
})

describe("duration", () => {
  it("scales from ms to hours", () => {
    expect(duration(450)).toBe("450ms")
    expect(duration(4200)).toBe("4.2s")
    expect(duration(45_000)).toBe("45s")
    expect(duration(200_000)).toBe("3m20s")
    expect(duration(3_720_000)).toBe("1h02m")
  })
})

describe("percent", () => {
  it("renders fractions", () => {
    expect(percent(0.7234)).toBe("72.3%")
    expect(percent(1)).toBe("100.0%")
  })
})

describe("delta", () => {
  it("reports signed change", () => {
    expect(delta(120, 100)).toEqual({ text: "+20.0%", direction: "up" })
    expect(delta(80, 100)).toEqual({ text: "-20.0%", direction: "down" })
    expect(delta(100, 100)).toEqual({ text: "0.0%", direction: "flat" })
  })

  it("handles zero and missing baselines", () => {
    expect(delta(5, 0)).toEqual({ text: "new", direction: "up" })
    expect(delta(0, 0)).toEqual({ text: "0%", direction: "flat" })
    expect(delta(5, undefined)).toEqual({ text: "—", direction: "flat" })
  })
})

describe("sparkline", () => {
  it("maps values to block glyphs", () => {
    const line = sparkline([0, 1, 2, 3], 4)
    expect(line).toHaveLength(4)
    expect(line[0]).toBe("▁")
    expect(line[3]).toBe("█")
  })

  it("downsamples to the requested width", () => {
    const line = sparkline(Array.from({ length: 100 }, (_, index) => index), 10)
    expect(line).toHaveLength(10)
  })

  it("renders flat zeros as a baseline", () => {
    expect(sparkline([0, 0, 0], 3)).toBe("▁▁▁")
  })

  it("is empty without values", () => {
    expect(sparkline([], 10)).toBe("")
  })
})

describe("truncate / padEnd", () => {
  it("ellipsizes long labels", () => {
    expect(truncate("hello world", 8)).toBe("hello w…")
    expect(truncate("short", 10)).toBe("short")
    expect(truncate("abcdef", 1)).toBe("a")
  })

  it("pads to width", () => {
    expect(padEnd("ab", 5)).toBe("ab   ")
    expect(padEnd("abcdef", 3)).toBe("abcdef")
  })
})

describe("segmentBar", () => {
  it("assigns proportional cells that sum to the width", () => {
    expect(segmentBar([1, 1, 1], 9)).toEqual([3, 3, 3])
    expect(segmentBar([1, 0, 1], 8)).toEqual([4, 0, 4])
    expect(segmentBar([0, 0, 0], 8)).toEqual([0, 0, 0])
    const partial = segmentBar([1, 1, 1], 7)
    expect(partial.reduce((sum, cells) => sum + cells, 0)).toBe(7)
  })
})
