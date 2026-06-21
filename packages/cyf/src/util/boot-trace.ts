// Boot tracing that bypasses console entirely.

//
// When CYF_BOOT_TRACE_FILE is set, all trace output goes directly to that file
// via writeSync — no console, no renderer interception, no buffering.
//
// Uses a string key on globalThis for the fd singleton because Bun may create
// duplicate module instances when mixing @/alias and ./relative import paths.
// Symbol.for() didn't survive across copies; a plain string key does.
import { openSync, writeSync } from "node:fs"

const FD_KEY = "__cyfBootTraceFd"
const T0 = performance.now()

export function setBootT0(): void {
  // no-op: T0 is set at module load time. Kept for backward compat with index.ts.
}

function getFd(): number | null {
  const g = globalThis as any
  if (g[FD_KEY] !== undefined) return g[FD_KEY] as number | null

  const file = process.env.CYF_BOOT_TRACE_FILE
  if (!file || (process.env.CYF_BOOT_TRACE !== "1" && process.env.CYF_BOOT_PROFILE !== "1")) {
    g[FD_KEY] = null
    return null
  }

  try {
    const fd = openSync(file, "a")
    g[FD_KEY] = fd
    return fd
  } catch {
    g[FD_KEY] = null
    return null
  }
}

function emit(line: string): void {
  const fd = getFd()
  if (fd !== null) {
    try {
      writeSync(fd, line + "\n")
    } catch {
      // best-effort; don't crash boot on trace failure
    }
  }
}

export function bootTrace(label: string): void {
  if (process.env.CYF_BOOT_TRACE !== "1") return
  emit(`[boot-trace] +${Math.round(performance.now() - T0)}ms ${label}`)
}

export function bootProfile(name: string, elapsed: number): void {
  if (process.env.CYF_BOOT_PROFILE !== "1") return
  emit(`[boot-profile] ${name} ${elapsed}ms`)
}

export * as BootTrace from "./boot-trace"
