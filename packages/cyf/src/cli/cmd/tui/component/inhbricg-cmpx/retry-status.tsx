import { createMemo, createSignal, onCleanup, onMount, Show } from "solid-js"
import type { RGBA } from "@opentui/core"
import type { SessionStatus } from "@cyf-ai/sdk/v2"
import { formatDuration } from "@/util/format"

interface RetryStatusProps {
  status: () => SessionStatus
  errorColor: RGBA
  onExpand: (message: string) => void
}

export function RetryStatus(props: RetryStatusProps) {
  const retry = createMemo(() => {
    const s = props.status()
    return s.type === "retry" ? s : undefined
  })

  const message = createMemo(() => {
    const r = retry()
    if (!r) return
    if (r.message.includes("exceeded your current quota") && r.message.includes("gemini"))
      return "gemini is way too hot right now"
    if (r.message.length > 80) return r.message.slice(0, 80) + "..."
    return r.message
  })

  const isTruncated = createMemo(() => {
    const r = retry()
    if (!r) return false
    return r.message.length > 120
  })

  const [seconds, setSeconds] = createSignal(0)
  onMount(() => {
    const timer = setInterval(() => {
      const next = retry()?.next
      if (next) setSeconds(Math.round((next - Date.now()) / 1000))
    }, 1000)
    onCleanup(() => clearInterval(timer))
  })

  const retryText = () => {
    const r = retry()
    if (!r) return ""
    const baseMessage = message()
    const truncatedHint = isTruncated() ? " (click to expand)" : ""
    const duration = formatDuration(seconds())
    const retryInfo = ` [retrying ${duration ? `in ${duration} ` : ""}attempt #${r.attempt}]`
    return baseMessage + truncatedHint + retryInfo
  }

  return (
    <Show when={retry()}>
      <box onMouseUp={() => isTruncated() && props.onExpand(message()!)}>
        <text fg={props.errorColor}>{retryText()}</text>
      </box>
    </Show>
  )
}
