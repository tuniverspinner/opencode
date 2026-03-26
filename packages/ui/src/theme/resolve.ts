import type { ColorValue, DesktopTheme, HexColor, ResolvedTheme, ThemeVariant } from "./types"
import { blend, generateNeutralScale, generateScale, hexToRgb, shift, withAlpha } from "./color"

export function resolveThemeVariant(variant: ThemeVariant, isDark: boolean): ResolvedTheme {
  const colors = getColors(variant)
  const { overrides = {} } = variant

  const neutral = generateNeutralScale(colors.neutral, isDark)
  const primary = generateScale(colors.primary, isDark)
  const accent = generateScale(colors.accent, isDark)
  const success = generateScale(colors.success, isDark)
  const warning = generateScale(colors.warning, isDark)
  const error = generateScale(colors.error, isDark)
  const info = generateScale(colors.info, isDark)
  const interactive = generateScale(colors.interactive, isDark)
  const amber = generateScale(
    shift(colors.warning, isDark ? { h: -14, l: -0.028, c: 1.06 } : { h: -18, l: -0.042, c: 1.02 }),
    isDark,
  )
  const blue = generateScale(shift(colors.interactive, { h: -12, l: isDark ? 0.048 : 0.072, c: 1.06 }), isDark)
  const diffAdd = generateScale(
    colors.diffAdd ?? shift(colors.success, { c: isDark ? 0.82 : 0.72, l: isDark ? -0.06 : 0.06 }),
    isDark,
  )
  const diffDelete = generateScale(
    colors.diffDelete ?? shift(colors.error, { c: isDark ? 0.88 : 0.74, l: isDark ? -0.04 : 0.04 }),
    isDark,
  )
  const backgroundOverride = overrides["background-base"]
  const backgroundHex = getHex(backgroundOverride)
  const overlay = Boolean(backgroundOverride) && !backgroundHex
  const background = backgroundHex ?? neutral[0]
  const alphaTone = (color: HexColor, alpha: number) =>
    overlay ? (withAlpha(color, alpha) as ColorValue) : blend(color, background, alpha)
  const content = (scale: HexColor[], idx = 10) =>
    shift(scale[idx], { l: isDark ? 0.012 : -0.014, c: isDark ? 0.94 : 0.9 })
  const surface = (
    seed: HexColor,
    alpha: { base: number; weak: number; weaker: number; strong: number; stronger: number },
  ) => ({
    base: alphaTone(seed, alpha.base),
    weak: alphaTone(seed, alpha.weak),
    weaker: alphaTone(seed, alpha.weaker),
    strong: alphaTone(seed, alpha.strong),
    stronger: alphaTone(seed, alpha.stronger),
  })
  const diffHiddenSurface = surface(
    isDark ? shift(colors.interactive, { c: 0.56 }) : shift(colors.interactive, { c: 0.42, l: 0.06 }),
    isDark
      ? { base: 0.14, weak: 0.08, weaker: 0.18, strong: 0.26, stronger: 0.42 }
      : { base: 0.12, weak: 0.08, weaker: 0.16, strong: 0.24, stronger: 0.36 },
  )
  const neutralAlpha = generateNeutralAlphaScale(neutral, isDark)
  const brandb = primary[8]
  const brandh = primary[9]
  const interb = interactive[isDark ? 6 : 4]
  const interh = interactive[isDark ? 7 : 5]
  const interw = interactive[isDark ? 5 : 3]
  const succb = success[isDark ? 6 : 4]
  const succw = success[isDark ? 5 : 3]
  const succs = success[10]
  const warnb = warning[isDark ? 6 : 4]
  const warnw = warning[isDark ? 5 : 3]
  const warns = warning[10]
  const critb = error[isDark ? 6 : 4]
  const critw = error[isDark ? 5 : 3]
  const crits = error[10]
  const infob = info[isDark ? 6 : 4]
  const infow = info[isDark ? 5 : 3]
  const infos = info[10]
  const lum = (hex: HexColor) => {
    const rgb = hexToRgb(hex)
    const lift = (value: number) => (value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4))
    return 0.2126 * lift(rgb.r) + 0.7152 * lift(rgb.g) + 0.0722 * lift(rgb.b)
  }
  const hit = (a: HexColor, b: HexColor) => {
    const x = lum(a)
    const y = lum(b)
    const light = Math.max(x, y)
    const dark = Math.min(x, y)
    return (light + 0.05) / (dark + 0.05)
  }
  const on = (fill: HexColor) => {
    const light = "#ffffff" as HexColor
    const dark = "#000000" as HexColor
    return hit(light, fill) > hit(dark, fill) ? light : dark
  }
  const pink = generateScale(shift(colors.error, isDark ? { h: -42, c: 0.84 } : { h: -48, l: 0.024, c: 0.74 }), isDark)
  const mint = success
  const orange = amber
  const purple = accent
  const cyan = info
  const lime = generateScale(
    shift(colors.primary, isDark ? { h: -76, l: -0.03, c: 0.78 } : { h: -86, l: 0.024, c: 0.72 }),
    isDark,
  )
  const tokens: ResolvedTheme = {}

  tokens["background-base"] = neutral[0]
  tokens["background-weak"] = neutral[2]
  tokens["background-strong"] = neutral[0]
  tokens["background-stronger"] = neutral[1]

  tokens["surface-base"] = neutralAlpha[1]
  tokens["base"] = neutralAlpha[1]
  tokens["surface-base-hover"] = neutralAlpha[2]
  tokens["surface-base-active"] = neutralAlpha[2]
  tokens["surface-base-interactive-active"] = withAlpha(interactive[2], isDark ? 0.32 : 0.24) as ColorValue
  tokens["base2"] = neutralAlpha[1]
  tokens["base3"] = neutralAlpha[1]
  tokens["surface-inset-base"] = neutralAlpha[1]
  tokens["surface-inset-base-hover"] = neutralAlpha[2]
  tokens["surface-inset-strong"] = alphaTone(neutral[11], isDark ? 0.08 : 0.04)
  tokens["surface-inset-strong-hover"] = alphaTone(neutral[11], isDark ? 0.12 : 0.06)
  tokens["surface-raised-base"] = neutralAlpha[0]
  tokens["surface-float-base"] = isDark ? neutral[1] : neutral[11]
  tokens["surface-float-base-hover"] = isDark ? neutral[2] : neutral[10]
  tokens["surface-raised-base-hover"] = neutralAlpha[1]
  tokens["surface-raised-base-active"] = neutralAlpha[2]
  tokens["surface-raised-strong"] = isDark ? neutralAlpha[3] : neutral[0]
  tokens["surface-raised-strong-hover"] = isDark ? neutralAlpha[5] : neutral[0]
  tokens["surface-raised-stronger"] = isDark ? neutralAlpha[5] : neutral[0]
  tokens["surface-raised-stronger-hover"] = isDark ? neutralAlpha[6] : neutral[1]
  tokens["surface-weak"] = neutralAlpha[2]
  tokens["surface-weaker"] = neutralAlpha[3]
  tokens["surface-strong"] = isDark ? neutralAlpha[6] : neutral[0]
  tokens["surface-raised-stronger-non-alpha"] = isDark ? neutral[2] : neutral[0]

  tokens["surface-brand-base"] = brandb
  tokens["surface-brand-hover"] = brandh

  tokens["surface-interactive-base"] = interb
  tokens["surface-interactive-hover"] = interh
  tokens["surface-interactive-weak"] = interw
  tokens["surface-interactive-weak-hover"] = interb

  tokens["surface-success-base"] = succb
  tokens["surface-success-weak"] = succw
  tokens["surface-success-strong"] = succs
  tokens["surface-warning-base"] = warnb
  tokens["surface-warning-weak"] = warnw
  tokens["surface-warning-strong"] = warns
  tokens["surface-critical-base"] = critb
  tokens["surface-critical-weak"] = critw
  tokens["surface-critical-strong"] = crits
  tokens["surface-info-base"] = infob
  tokens["surface-info-weak"] = infow
  tokens["surface-info-strong"] = infos

  tokens["surface-diff-unchanged-base"] = isDark ? neutral[0] : "#ffffff00"
  tokens["surface-diff-skip-base"] = isDark ? neutralAlpha[0] : neutral[1]
  tokens["surface-diff-hidden-base"] = diffHiddenSurface.base
  tokens["surface-diff-hidden-weak"] = diffHiddenSurface.weak
  tokens["surface-diff-hidden-weaker"] = diffHiddenSurface.weaker
  tokens["surface-diff-hidden-strong"] = diffHiddenSurface.strong
  tokens["surface-diff-hidden-stronger"] = diffHiddenSurface.stronger
  tokens["surface-diff-add-base"] = diffAdd[2]
  tokens["surface-diff-add-weak"] = diffAdd[isDark ? 3 : 1]
  tokens["surface-diff-add-weaker"] = diffAdd[isDark ? 2 : 0]
  tokens["surface-diff-add-strong"] = diffAdd[4]
  tokens["surface-diff-add-stronger"] = diffAdd[isDark ? 10 : 8]
  tokens["surface-diff-delete-base"] = diffDelete[2]
  tokens["surface-diff-delete-weak"] = diffDelete[isDark ? 3 : 1]
  tokens["surface-diff-delete-weaker"] = diffDelete[isDark ? 2 : 0]
  tokens["surface-diff-delete-strong"] = diffDelete[isDark ? 4 : 5]
  tokens["surface-diff-delete-stronger"] = diffDelete[isDark ? 10 : 8]

  tokens["input-base"] = isDark ? neutral[1] : neutral[0]
  tokens["input-hover"] = isDark ? neutral[2] : neutral[1]
  tokens["input-active"] = isDark ? interactive[6] : interactive[0]
  tokens["input-selected"] = isDark ? interactive[7] : interactive[3]
  tokens["input-focus"] = isDark ? interactive[6] : interactive[0]
  tokens["input-disabled"] = neutral[3]

  tokens["text-base"] = neutral[10]
  tokens["text-weak"] = neutral[8]
  tokens["text-weaker"] = neutral[7]
  tokens["text-strong"] = neutral[11]
  tokens["text-invert-base"] = isDark ? neutral[10] : neutral[1]
  tokens["text-invert-weak"] = isDark ? neutral[8] : neutral[2]
  tokens["text-invert-weaker"] = isDark ? neutral[7] : neutral[3]
  tokens["text-invert-strong"] = isDark ? neutral[11] : neutral[0]
  tokens["text-interactive-base"] = content(interactive)
  tokens["text-on-brand-base"] = on(brandb)
  tokens["text-on-interactive-base"] = on(interb)
  tokens["text-on-interactive-weak"] = on(interb)
  tokens["text-on-success-base"] = on(succb)
  tokens["text-on-critical-base"] = on(critb)
  tokens["text-on-critical-weak"] = on(critb)
  tokens["text-on-critical-strong"] = on(crits)
  tokens["text-on-warning-base"] = on(warnb)
  tokens["text-on-info-base"] = on(infob)
  tokens["text-diff-add-base"] = content(diffAdd)
  tokens["text-diff-delete-base"] = content(diffDelete)
  tokens["text-diff-delete-strong"] = diffDelete[11]
  tokens["text-diff-add-strong"] = diffAdd[11]
  tokens["text-on-info-weak"] = on(infob)
  tokens["text-on-info-strong"] = on(infos)
  tokens["text-on-warning-weak"] = on(warnb)
  tokens["text-on-warning-strong"] = on(warns)
  tokens["text-on-success-weak"] = on(succb)
  tokens["text-on-success-strong"] = on(succs)
  tokens["text-on-brand-weak"] = on(brandb)
  tokens["text-on-brand-weaker"] = on(brandb)
  tokens["text-on-brand-strong"] = on(brandh)

  tokens["button-primary-base"] = neutral[11]
  tokens["button-secondary-base"] = isDark ? neutral[2] : neutral[0]
  tokens["button-secondary-hover"] = isDark ? neutral[3] : neutral[1]
  tokens["button-ghost-hover"] = neutralAlpha[1]
  tokens["button-ghost-hover2"] = neutralAlpha[2]

  tokens["border-base"] = neutralAlpha[6]
  tokens["border-hover"] = neutralAlpha[7]
  tokens["border-active"] = neutralAlpha[8]
  tokens["border-selected"] = withAlpha(interactive[8], isDark ? 0.9 : 0.99) as ColorValue
  tokens["border-disabled"] = neutralAlpha[7]
  tokens["border-focus"] = neutralAlpha[8]
  tokens["border-weak-base"] = neutralAlpha[isDark ? 5 : 4]
  tokens["border-strong-base"] = neutralAlpha[isDark ? 7 : 6]
  tokens["border-strong-hover"] = neutralAlpha[7]
  tokens["border-strong-active"] = neutralAlpha[isDark ? 7 : 6]
  tokens["border-strong-selected"] = withAlpha(interactive[5], 0.6) as ColorValue
  tokens["border-strong-disabled"] = neutralAlpha[5]
  tokens["border-strong-focus"] = neutralAlpha[isDark ? 7 : 6]
  tokens["border-weak-hover"] = neutralAlpha[isDark ? 6 : 5]
  tokens["border-weak-active"] = neutralAlpha[isDark ? 7 : 6]
  tokens["border-weak-selected"] = withAlpha(interactive[4], isDark ? 0.6 : 0.5) as ColorValue
  tokens["border-weak-disabled"] = neutralAlpha[5]
  tokens["border-weak-focus"] = neutralAlpha[isDark ? 7 : 6]
  tokens["border-weaker-base"] = neutralAlpha[2]

  tokens["border-interactive-base"] = interactive[6]
  tokens["border-interactive-hover"] = interactive[7]
  tokens["border-interactive-active"] = interactive[8]
  tokens["border-interactive-selected"] = interactive[8]
  tokens["border-interactive-disabled"] = neutral[7]
  tokens["border-interactive-focus"] = interactive[8]

  tokens["border-success-base"] = success[6]
  tokens["border-success-hover"] = success[7]
  tokens["border-success-selected"] = success[8]
  tokens["border-warning-base"] = warning[6]
  tokens["border-warning-hover"] = warning[7]
  tokens["border-warning-selected"] = warning[8]
  tokens["border-critical-base"] = error[6]
  tokens["border-critical-hover"] = error[7]
  tokens["border-critical-selected"] = error[8]
  tokens["border-info-base"] = info[6]
  tokens["border-info-hover"] = info[7]
  tokens["border-info-selected"] = info[8]
  tokens["border-color"] = neutral[0]

  tokens["icon-base"] = neutral[isDark ? 9 : 8]
  tokens["icon-hover"] = neutral[10]
  tokens["icon-active"] = neutral[11]
  tokens["icon-selected"] = neutral[11]
  tokens["icon-disabled"] = neutral[isDark ? 6 : 7]
  tokens["icon-focus"] = neutral[11]
  tokens["icon-invert-base"] = neutral[0]
  tokens["icon-weak-base"] = neutral[isDark ? 5 : 6]
  tokens["icon-weak-hover"] = neutral[isDark ? 11 : 7]
  tokens["icon-weak-active"] = neutral[8]
  tokens["icon-weak-selected"] = neutral[isDark ? 8 : 9]
  tokens["icon-weak-disabled"] = neutral[isDark ? 3 : 5]
  tokens["icon-weak-focus"] = neutral[8]
  tokens["icon-strong-base"] = neutral[11]
  tokens["icon-strong-hover"] = neutral[11]
  tokens["icon-strong-active"] = neutral[11]
  tokens["icon-strong-selected"] = neutral[11]
  tokens["icon-strong-disabled"] = neutral[7]
  tokens["icon-strong-focus"] = neutral[11]
  tokens["icon-brand-base"] = on(brandb)
  tokens["icon-interactive-base"] = interactive[8]
  tokens["icon-success-base"] = success[isDark ? 8 : 6]
  tokens["icon-success-hover"] = success[9]
  tokens["icon-success-active"] = success[10]
  tokens["icon-warning-base"] = amber[isDark ? 8 : 6]
  tokens["icon-warning-hover"] = amber[9]
  tokens["icon-warning-active"] = amber[10]
  tokens["icon-critical-base"] = error[isDark ? 8 : 9]
  tokens["icon-critical-hover"] = error[9]
  tokens["icon-critical-active"] = error[10]
  tokens["icon-info-base"] = info[isDark ? 8 : 6]
  tokens["icon-info-hover"] = info[isDark ? 9 : 7]
  tokens["icon-info-active"] = info[10]
  tokens["icon-on-brand-base"] = on(brandb)
  tokens["icon-on-brand-hover"] = on(brandh)
  tokens["icon-on-brand-selected"] = on(brandh)
  tokens["icon-on-interactive-base"] = on(interb)

  tokens["icon-agent-plan-base"] = info[8]
  tokens["icon-agent-docs-base"] = amber[8]
  tokens["icon-agent-ask-base"] = blue[8]
  tokens["icon-agent-build-base"] = interactive[isDark ? 10 : 8]

  tokens["icon-on-success-base"] = on(succb)
  tokens["icon-on-success-hover"] = on(succs)
  tokens["icon-on-success-selected"] = on(succs)
  tokens["icon-on-warning-base"] = on(warnb)
  tokens["icon-on-warning-hover"] = on(warns)
  tokens["icon-on-warning-selected"] = on(warns)
  tokens["icon-on-critical-base"] = on(critb)
  tokens["icon-on-critical-hover"] = on(crits)
  tokens["icon-on-critical-selected"] = on(crits)
  tokens["icon-on-info-base"] = on(infob)
  tokens["icon-on-info-hover"] = on(infos)
  tokens["icon-on-info-selected"] = on(infos)

  tokens["icon-diff-add-base"] = diffAdd[10]
  tokens["icon-diff-add-hover"] = diffAdd[11]
  tokens["icon-diff-add-active"] = diffAdd[11]
  tokens["icon-diff-delete-base"] = diffDelete[10]
  tokens["icon-diff-delete-hover"] = diffDelete[11]
  tokens["icon-diff-modified-base"] = amber[10]

  tokens["syntax-comment"] = "var(--text-weak)"
  tokens["syntax-regexp"] = content(primary)
  tokens["syntax-string"] = content(success)
  tokens["syntax-keyword"] = content(accent)
  tokens["syntax-primitive"] = content(primary)
  tokens["syntax-operator"] = content(info)
  tokens["syntax-variable"] = "var(--text-strong)"
  tokens["syntax-property"] = content(info)
  tokens["syntax-type"] = content(warning)
  tokens["syntax-constant"] = content(accent)
  tokens["syntax-punctuation"] = "var(--text-weak)"
  tokens["syntax-object"] = "var(--text-strong)"
  tokens["syntax-success"] = success[10]
  tokens["syntax-warning"] = amber[10]
  tokens["syntax-critical"] = error[10]
  tokens["syntax-info"] = content(info)
  tokens["syntax-diff-add"] = diffAdd[10]
  tokens["syntax-diff-delete"] = diffDelete[10]
  tokens["syntax-diff-unknown"] = content(accent)

  tokens["markdown-heading"] = content(primary)
  tokens["markdown-text"] = tokens["text-base"]
  tokens["markdown-link"] = content(interactive)
  tokens["markdown-link-text"] = content(info)
  tokens["markdown-code"] = content(success)
  tokens["markdown-block-quote"] = content(warning)
  tokens["markdown-emph"] = content(warning)
  tokens["markdown-strong"] = content(accent)
  tokens["markdown-horizontal-rule"] = tokens["border-base"]
  tokens["markdown-list-item"] = content(interactive)
  tokens["markdown-list-enumeration"] = content(info)
  tokens["markdown-image"] = content(interactive)
  tokens["markdown-image-text"] = content(info)
  tokens["markdown-code-block"] = tokens["text-base"]

  tokens["avatar-background-pink"] = pink[isDark ? 2 : 1]
  tokens["avatar-background-mint"] = mint[isDark ? 2 : 1]
  tokens["avatar-background-orange"] = orange[isDark ? 2 : 1]
  tokens["avatar-background-purple"] = purple[isDark ? 2 : 1]
  tokens["avatar-background-cyan"] = cyan[isDark ? 2 : 1]
  tokens["avatar-background-lime"] = lime[isDark ? 2 : 1]
  tokens["avatar-text-pink"] = pink[9]
  tokens["avatar-text-mint"] = mint[9]
  tokens["avatar-text-orange"] = orange[9]
  tokens["avatar-text-purple"] = purple[9]
  tokens["avatar-text-cyan"] = cyan[9]
  tokens["avatar-text-lime"] = lime[9]

  for (const [key, value] of Object.entries(overrides)) {
    tokens[key] = value
  }

  if ("text-weak" in overrides && !("text-weaker" in overrides)) {
    const weak = tokens["text-weak"]
    if (weak.startsWith("#")) {
      tokens["text-weaker"] = shift(weak as HexColor, { l: isDark ? -0.12 : 0.12, c: 0.75 })
    } else {
      tokens["text-weaker"] = weak
    }
  }

  if (!("markdown-text" in overrides)) {
    tokens["markdown-text"] = tokens["text-base"]
  }
  if (!("markdown-code-block" in overrides)) {
    tokens["markdown-code-block"] = tokens["text-base"]
  }
  if (!("text-stronger" in overrides)) {
    tokens["text-stronger"] = tokens["text-strong"]
  }

  return tokens
}

interface ThemeColors {
  neutral: HexColor
  primary: HexColor
  accent: HexColor
  success: HexColor
  warning: HexColor
  error: HexColor
  info: HexColor
  interactive: HexColor
  diffAdd?: HexColor
  diffDelete?: HexColor
}

function getColors(variant: ThemeVariant): ThemeColors {
  if (!variant.seeds) {
    throw new Error("Theme variant requires `seeds`")
  }

  return {
    neutral: variant.seeds.neutral,
    primary: variant.seeds.primary,
    accent: variant.seeds.accent ?? variant.seeds.info,
    success: variant.seeds.success,
    warning: variant.seeds.warning,
    error: variant.seeds.error,
    info: variant.seeds.info,
    interactive: variant.seeds.interactive ?? variant.seeds.primary,
    diffAdd: variant.seeds.diffAdd,
    diffDelete: variant.seeds.diffDelete,
  }
}

function generateNeutralAlphaScale(neutral: HexColor[], isDark: boolean): HexColor[] {
  const alpha = isDark
    ? [0.038, 0.066, 0.1, 0.142, 0.19, 0.252, 0.334, 0.446, 0.58, 0.718, 0.854, 0.985]
    : [0.03, 0.06, 0.1, 0.145, 0.2, 0.265, 0.35, 0.47, 0.61, 0.74, 0.86, 0.97]

  return alpha.map((value) => blend(neutral[11], neutral[0], value))
}

function getHex(value: ColorValue | undefined): HexColor | undefined {
  if (!value?.startsWith("#")) return
  return value as HexColor
}

export function resolveTheme(theme: DesktopTheme): { light: ResolvedTheme; dark: ResolvedTheme } {
  return {
    light: resolveThemeVariant(theme.light, false),
    dark: resolveThemeVariant(theme.dark, true),
  }
}

export function themeToCss(tokens: ResolvedTheme): string {
  return Object.entries(tokens)
    .map(([key, value]) => `--${key}: ${value};`)
    .join("\n  ")
}
