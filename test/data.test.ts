import { describe, expect, it } from "vitest"
import { pickTopModel, rangeWindow } from "../src/data"

describe("pickTopModel", () => {
  const model = (id: string, steps: number, cost = 0) => ({ model: { id }, steps, cost })

  it("picks the model with the most steps", () => {
    const models = [model("small-model", 12), model("big-model", 480), model("mid-model", 90)]
    expect(pickTopModel(models)).toEqual({ label: "big-model", steps: 480 })
  })

  it("breaks ties by cost", () => {
    const models = [model("cheap", 10, 1), model("pricey", 10, 5)]
    expect(pickTopModel(models)?.label).toBe("pricey")
  })

  it("skips models without an id", () => {
    expect(pickTopModel([{ model: {}, steps: 100 }])).toBeUndefined()
    expect(pickTopModel([model("", 100), model("real", 5)])).toEqual({ label: "real", steps: 5 })
  })

  it("returns undefined for empty input or zero steps", () => {
    expect(pickTopModel(undefined)).toBeUndefined()
    expect(pickTopModel([])).toBeUndefined()
    expect(pickTopModel([model("unused", 0)])).toBeUndefined()
  })

  it("tolerates missing numeric fields", () => {
    expect(pickTopModel([{ model: { id: "x" } }])).toBeUndefined()
    expect(pickTopModel([{ model: { id: "x" }, steps: 3, cost: undefined }])).toEqual({
      label: "x",
      steps: 3,
    })
  })
})

describe("rangeWindow", () => {
  it("uses no lower bound for all-time", () => {
    const win = rangeWindow("all", 1_000_000)
    expect(win.from).toBe(0)
    expect(win.prevFrom).toBeUndefined()
    expect(win.label).toBe("all time")
  })

  it("labels day and week windows", () => {
    const now = 1_000_000_000_000
    expect(rangeWindow("24h", now).label).toBe("last 24 hours")
    expect(rangeWindow("7d", now).label).toBe("last 7 days")
    expect(rangeWindow("7d", now).prevTo).toBe(rangeWindow("7d", now).from)
  })
})
