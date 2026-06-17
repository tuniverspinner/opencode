import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

async function main() {
  const tmpdir = path.join(os.tmpdir(), "cyf-async-isolate-" + Math.random().toString(36).slice(2))
  await fs.mkdir(tmpdir, { recursive: true })
  process.env.CYF_DB = path.join(tmpdir, "isolate.db")
  process.env.CYF_PURE = "1"
  process.env.CYF_DISABLE_AUTOUPDATE = "1"
  process.env.CYF_DISABLE_AUTOCOMPACT = "1"
  process.env.CYF_DISABLE_MODELS_FETCH = "1"

  const { Effect } = await import("effect")
  const { BackgroundJob } = await import("@/background/job")
  const { Database } = await import("@cyf-ai/core/database/database")
  const { InstanceRef } = await import("@/effect/instance-ref")
  const { InstanceRuntime } = await import("@/project/instance-runtime")

  const ctxA = await InstanceRuntime.load({ directory: tmpdir })
  const id = "job_isolate_test"

  const proc = Bun.spawn(["sleep", "5"], {
    detached: true,
    stdio: ["ignore", "ignore", "ignore"],
  })
  proc.unref()
  const pid = proc.pid

  try {
    await Effect.runPromise(
      Effect.gen(function* () {
        const jobs = yield* BackgroundJob.Service
        yield* BackgroundJob.registerDetached(ctxA, id, "isolate", pid, {}, 60_000)
        const first = yield* jobs.get(id)
        if (first?.status !== "running") throw new Error(`expected running after live spawn, got ${first?.status}`)
      }).pipe(
        Effect.provideService(InstanceRef, ctxA),
        Effect.provide(BackgroundJob.defaultLayer),
        Effect.provide(Database.defaultLayer),
      ),
    )

    process.kill(pid, "SIGTERM")

    await InstanceRuntime.disposeInstance(ctxA)
    const ctxB = await InstanceRuntime.load({ directory: tmpdir })

    await Effect.runPromise(
      Effect.gen(function* () {
        const jobs = yield* BackgroundJob.Service
        const second = yield* jobs.get(id)
        if (second?.status !== "cancelled") throw new Error(`expected cancelled after orphan kill, got ${second?.status}`)
      }).pipe(
        Effect.provideService(InstanceRef, ctxB),
        Effect.provide(BackgroundJob.defaultLayer),
        Effect.provide(Database.defaultLayer),
      ),
    )

    await InstanceRuntime.disposeInstance(ctxB)
    console.log("async-delegate-isolate: OK")
  } finally {
    try {
      process.kill(pid, "SIGKILL")
    } catch {}
    await fs.rm(tmpdir, { recursive: true, force: true })
  }
  process.exit(0)
}

main().catch((error) => {
  console.error("async-delegate-isolate: FAIL", error)
  process.exit(1)
})
