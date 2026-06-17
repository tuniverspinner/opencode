import { BackgroundJob as CoreBackgroundJob } from "@cyf-ai/core/background-job"
import { Database } from "@cyf-ai/core/database/database"
import { Identifier } from "@cyf-ai/core/id/id"
import { JobTable } from "@cyf-ai/core/job.sql"
import { InstanceState } from "@/effect/instance-state"
import type { InstanceContext } from "@/project/instance-context"
import { and, eq, isNull, lt, or } from "drizzle-orm"
import { Effect, Layer, Scope } from "effect"

export {
  Service,
  type ExtendInput,
  type Info,
  type Interface,
  type StartInput,
  type Status,
  type WaitInput,
  type WaitResult,
} from "@cyf-ai/core/background-job"

type DB = Database.Interface["db"]

const fromRow = (row: typeof JobTable.$inferSelect): CoreBackgroundJob.Info => ({
  id: row.id,
  type: row.type,
  title: row.title ?? undefined,
  status: row.status,
  started_at: row.started_at,
  completed_at: row.completed_at ?? undefined,
  output: row.output ?? undefined,
  error: row.error ?? undefined,
  metadata: (row.metadata ?? undefined) as Record<string, unknown> | undefined,
})

const toRow = (ctx: InstanceContext, info: CoreBackgroundJob.Info) => ({
  id: info.id,
  project_id: ctx.project.id,
  directory: ctx.directory,
  type: info.type,
  title: info.title,
  status: info.status,
  started_at: info.started_at,
  completed_at: info.completed_at,
  output: info.output,
  error: info.error,
  metadata: info.metadata,
  payload: {},
})

const whereInstance = (ctx: InstanceContext) =>
  and(eq(JobTable.project_id, ctx.project.id), eq(JobTable.directory, ctx.directory))

const whereId = (ctx: InstanceContext, id: string) => and(whereInstance(ctx), eq(JobTable.id, id))

const upsert = (db: DB, ctx: InstanceContext, info: CoreBackgroundJob.Info) =>
  db
    .insert(JobTable)
    .values(toRow(ctx, info))
    .onConflictDoUpdate({
      target: [JobTable.project_id, JobTable.directory, JobTable.id],
      set: toRow(ctx, info),
    })
    .run()
    .pipe(Effect.orDie, Effect.ignore)

function recover(db: DB, ctx: InstanceContext) {
  const now = Date.now()
  return db
    .update(JobTable)
    .set({ status: "cancelled", error: "stale" })
    .where(
      and(
        whereInstance(ctx),
        eq(JobTable.status, "running"),
        or(isNull(JobTable.lease_expires_at), lt(JobTable.lease_expires_at, now)),
      ),
    )
    .run()
    .pipe(Effect.orDie, Effect.ignore)
}

export const layer = Layer.effect(
  CoreBackgroundJob.Service,
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    const scope = yield* Scope.Scope
    const state = yield* InstanceState.make((ctx) =>
      Effect.gen(function* () {
        yield* recover(db, ctx)
        return yield* CoreBackgroundJob.make
      }),
    )

    return CoreBackgroundJob.Service.of({
      list: Effect.fn("BackgroundJob.list")(function* () {
        const ctx = yield* InstanceState.context
        const jobs = yield* InstanceState.get(state)
        const memory = yield* jobs.list()
        const rows = yield* db.select().from(JobTable).where(whereInstance(ctx)).all().pipe(Effect.orDie)
        const byId = new Map(memory.map((info) => [info.id, info]))
        for (const row of rows) {
          if (!byId.has(row.id)) byId.set(row.id, fromRow(row))
        }
        return Array.from(byId.values()).toSorted((a, b) => a.started_at - b.started_at)
      }),

      get: Effect.fn("BackgroundJob.get")(function* (id) {
        const ctx = yield* InstanceState.context
        const jobs = yield* InstanceState.get(state)
        const info = yield* jobs.get(id)
        if (info) return info
        const row = yield* db.select().from(JobTable).where(whereId(ctx, id)).get().pipe(Effect.orDie)
        return row ? fromRow(row) : undefined
      }),

      start: Effect.fn("BackgroundJob.start")(function* (input) {
        const id = Identifier.ascending("job", input.id)
        const ctx = yield* InstanceState.context
        const jobs = yield* InstanceState.get(state)
        const existing = yield* jobs.get(id)
        if (existing?.status === "running") return existing
        if (existing === undefined) {
          const row = yield* db.select().from(JobTable).where(whereId(ctx, id)).get().pipe(Effect.orDie)
          if (row?.status === "running") return fromRow(row)
        }
        const info = yield* jobs.start({ ...input, id, run: input.run })
        yield* upsert(db, ctx, info)
        return info
      }),

      extend: Effect.fn("BackgroundJob.extend")(function* (input) {
        const ctx = yield* InstanceState.context
        const jobs = yield* InstanceState.get(state)
        const extended = yield* jobs.extend(input)
        if (extended) {
          const info = yield* jobs.get(input.id)
          if (info) yield* upsert(db, ctx, info)
        }
        return extended
      }),

      wait: Effect.fn("BackgroundJob.wait")(function* (input) {
        const ctx = yield* InstanceState.context
        const jobs = yield* InstanceState.get(state)
        const result = yield* jobs.wait(input)
        if (result.info && result.info.status !== "running") yield* upsert(db, ctx, result.info)
        return result
      }),

      waitForPromotion: Effect.fn("BackgroundJob.waitForPromotion")(function* (id) {
        const jobs = yield* InstanceState.get(state)
        return yield* jobs.waitForPromotion(id)
      }),

      promote: Effect.fn("BackgroundJob.promote")(function* (id) {
        const ctx = yield* InstanceState.context
        const jobs = yield* InstanceState.get(state)
        const info = yield* jobs.promote(id)
        if (info) yield* upsert(db, ctx, info)
        return info
      }),

      cancel: Effect.fn("BackgroundJob.cancel")(function* (id) {
        const ctx = yield* InstanceState.context
        const jobs = yield* InstanceState.get(state)
        const info = yield* jobs.cancel(id)
        if (info) yield* upsert(db, ctx, info)
        return info
      }),
    })
  }),
)

export const defaultLayer = layer.pipe(Layer.provide(Database.defaultLayer))

export * as BackgroundJob from "./job"
