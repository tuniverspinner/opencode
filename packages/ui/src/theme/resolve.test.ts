import { describe, expect, test } from "bun:test"
import type { HexColor, ThemeVariant } from "./types"
import { generateNeutralScale, generateScale, hexToOklch } from "./color"
import { DEFAULT_THEMES } from "./default-themes"
import { resolveThemeVariant } from "./resolve"

function dist(a: HexColor, b: HexColor) {
  const x = hexToOklch(a)
  const y = hexToOklch(b)
  const hue = Math.abs(((((y.h - x.h) % 360) + 540) % 360) - 180) / 360
  return Math.abs(x.l - y.l) + Math.abs(x.c - y.c) + hue
}

describe("theme resolve", () => {
  test("resolves every bundled theme from seeds", () => {
    for (const theme of Object.values(DEFAULT_THEMES)) {
      const light = resolveThemeVariant(theme.light, false)
      const dark = resolveThemeVariant(theme.dark, true)

      expect(light["background-base"]).toStartWith("#")
      expect(light["text-base"]).toBeTruthy()
      expect(light["surface-brand-base"]).toStartWith("#")
      expect(dark["background-base"]).toStartWith("#")
      expect(dark["text-base"]).toBeTruthy()
      expect(dark["surface-brand-base"]).toStartWith("#")
    }
  })

  test("applies token overrides after generation", () => {
    const variant: ThemeVariant = {
      seeds: {
        neutral: "#f4f4f5",
        primary: "#3b7dd8",
        success: "#3d9a57",
        warning: "#d68c27",
        error: "#d1383d",
        info: "#318795",
      },
      overrides: {
        "text-base": "#111111",
      },
    }
    const tokens = resolveThemeVariant(variant, false)

    expect(tokens["text-base"]).toBe("#111111")
    expect(tokens["markdown-text"]).toBe("#111111")
    expect(tokens["text-stronger"]).toBe(tokens["text-strong"])
  })

  test("keeps accent scales centered on step 9", () => {
    const seed = "#3b7dd8" as HexColor
    const light = generateScale(seed, false)
    const dark = generateScale(seed, true)

    expect(dist(light[8], seed)).toBeLessThan(dist(light[7], seed))
    expect(dist(light[8], seed)).toBeLessThan(dist(light[10], seed))
    expect(dist(dark[8], seed)).toBeLessThan(dist(dark[7], seed))
    expect(dist(dark[8], seed)).toBeLessThan(dist(dark[10], seed))
  })

  test("keeps neutral scales monotonic", () => {
    const light = generateNeutralScale("#f7f7f7", false).map((hex) => hexToOklch(hex).l)
    const dark = generateNeutralScale("#1f1f1f", true).map((hex) => hexToOklch(hex).l)

    for (let i = 1; i < light.length; i++) {
      expect(light[i - 1]).toBeGreaterThanOrEqual(light[i])
      expect(dark[i - 1]).toBeLessThanOrEqual(dark[i])
    }
  })
})
