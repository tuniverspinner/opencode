import path from "node:path"
import { describe, expect } from "bun:test"
import { Database } from "@cyf-ai/core/database/database"
import { JobTable } from "@cyf-ai/core/job.sql"
import { eq } from "drizzle-orm"
import { Effect, Schedule } from "effect"
import { cliIt } from "../../lib/cli-process"

describe("opencode run --async", () => {
  cliIt.live(
    "delegates to a detached process and finalizes on completion",
    ({ opencode, home }) => {
      const dbPath = path.join(home, "async-test.db")
      return Effect.gen(function* () {
        const result = yield* opencode.run("say hi", {
          extraArgs: ["--async"],
          env: { CYF_DB: dbPath },
        })
        opencode.expectExit(result, 0)

        const match = result.stdout.match(/Started async job (\S+) \(PID (\d+)\)/)
        expect(match).toBeTruthy()
        const jobId = match![1]
        const pid = Number(match![2])

        const { db } = yield* Database.Service
        const row = yield* Effect.retry(
          Effect.gen(function* () {
            const found = yield* db.select().from(JobTable).where(eq(JobTable.id, jobId)).get().pipe(Effect.orDie)
            if (!found || found.status === "running") return yield* Effect.fail(new Error("still running"))
            return found
          }),
          { schedule: Schedule.spaced("1 second"), times: 30 },
        )

        expect(["completed", "error"]).toContain(row.status)

        try {
          process.kill(pid, 0)
          process.kill(pid, "SIGTERM")
        } catch {}
      }).pipe(Effect.provide(Database.layerFromPath(dbPath)))
    },
    60_000,
  )
})
