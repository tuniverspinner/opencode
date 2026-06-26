import { createMemo, Show, type JSX } from "solid-js"
import { RGBA } from "@opentui/core"
import { useLocal } from "@tui/context/local"
import { useTheme } from "@tui/context/theme"
import { useLeaderActive } from "@tui/keymap"
import { useKV } from "@tui/context/kv"
import { createFadeIn } from "@tui/util/signal"
import { Locale } from "@/util/locale"

function fadeColor(color: RGBA, alpha: number): RGBA {
  return RGBA.fromValues(color.r, color.g, color.b, color.a * alpha)
}

interface AgentityBarProps {
  mode: "normal" | "shell"
  right?: JSX.Element
  _test?: {
    agentName?: string
    modelLabel?: string
    providerLabel?: string
    variantName?: string | null
    showVariant?: boolean
    leader?: boolean
  }
}

function safeLocal(): ReturnType<typeof useLocal> | undefined {
  try { return useLocal() } catch { return undefined }
}
function safeThemeColors() {
  try { return (useTheme() as any).theme as { border: RGBA; primary: RGBA; text: RGBA; textMuted: RGBA; warning: RGBA; backgroundElement: RGBA } | undefined } catch { return undefined }
}
function safeLeader(): (() => boolean) | undefined {
  try { return useLeaderActive() } catch { return undefined }
}
function safeKV() {
  try { return useKV() } catch { return undefined }
}

export function AgentityBar(props: AgentityBarProps) {
  const local = safeLocal()
  const themeColors = safeThemeColors()
  const leaderFn = safeLeader()
  const kv = safeKV()
  const inject = () => props._test
  const isTest = () => inject() !== undefined

  const animationsEnabled = createMemo(() => kv?.get("animations_enabled", true) ?? true)

  const fc = () => RGBA.fromInts(128, 128, 128)
  const t = () => themeColors ?? { border: fc(), primary: fc(), text: RGBA.fromInts(220, 220, 220), textMuted: RGBA.fromInts(128, 128, 128), warning: RGBA.fromInts(200, 180, 0), backgroundElement: RGBA.fromInts(30, 30, 30) }

  const highlight = createMemo(() => {
    if (inject()?.leader ?? leaderFn?.() ?? false) return t().border
    if (props.mode === "shell") return t().primary
    const agent = local?.agent.current()
    if (!agent) return t().border
    return local!.agent.color(agent.name)
  })

  const showV = createMemo(() => {
    if (inject()?.showVariant !== undefined) return inject()!.showVariant!
    const variants = local?.model.variant.list()
    if (!variants || variants.length === 0) return false
    return !!local!.model.variant.current()
  })

  const currentProviderLabel = createMemo(() => inject()?.providerLabel ?? local?.model.parsed().provider ?? "")
  const agentName = createMemo(() => inject()?.agentName ?? (local?.agent.current() ? Locale.titlecase(local!.agent.current()!.name) : undefined))
  const modelLabel = createMemo(() => inject()?.modelLabel ?? local?.model.parsed().model ?? "")
  const variantName = createMemo(() => inject()?.variantName !== undefined ? inject()!.variantName : local?.model.variant.current() ?? undefined)

  const hasAgent = createMemo(() => inject()?.agentName !== undefined || !!local?.agent.current())

  const agentMetaAlpha = createFadeIn(hasAgent, animationsEnabled)
  const modelMetaAlpha = createFadeIn(() => hasAgent() && props.mode === "normal", animationsEnabled)
  const variantMetaAlpha = createFadeIn(
    () => hasAgent() && props.mode === "normal" && showV(),
    animationsEnabled,
  )

  const isLeader = () => inject()?.leader ?? leaderFn?.() ?? false

  return (
    <box flexDirection="row" gap={1}>
      <box flexDirection="row" gap={1}>
        <Show when={hasAgent()} fallback={<box height={1} />}>
          <text fg={fadeColor(highlight(), agentMetaAlpha())}>
            {props.mode === "shell" ? "Shell" : agentName()}
          </text>
          <Show when={props.mode === "normal"}>
            <box flexDirection="row" gap={1}>
              <text fg={fadeColor(t().textMuted, modelMetaAlpha())}>·</text>
              <text
                flexShrink={0}
                fg={fadeColor(isLeader() ? t().textMuted : t().text, modelMetaAlpha())}
              >
                {modelLabel()}
              </text>
              <text fg={fadeColor(t().textMuted, modelMetaAlpha())}>{currentProviderLabel()}</text>
              <Show when={showV()}>
                <text fg={fadeColor(t().textMuted, variantMetaAlpha())}>·</text>
                <text>
                  <span style={{ fg: fadeColor(t().warning, variantMetaAlpha()), bold: true }}>
                    {variantName()}
                  </span>
                </text>
              </Show>
            </box>
          </Show>
        </Show>
      </box>
      <Show when={props.right !== undefined}>
        <box flexDirection="row" gap={1} alignItems="center">
          {props.right}
        </box>
      </Show>
    </box>
  )
}
