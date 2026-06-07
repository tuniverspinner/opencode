export * as SessionRunCoordinator from "./run-coordinator"

import { Cause, Context, Deferred, Effect, Exit, Fiber, FiberSet, Layer, Scope, SynchronizedRef } from "effect"
import { SessionRunner } from "./runner"
import { SessionSchema } from "./schema"
import { SessionRunCoordinatorMachine } from "./run-coordinator-machine"

export type Mode = SessionRunCoordinatorMachine.Mode

export interface Coordinator<Key, A, E> {
  readonly run: (key: Key) => Effect.Effect<A, E>
  readonly wake: (key: Key, seq?: number) => Effect.Effect<void>
  readonly awaitIdle: (key: Key) => Effect.Effect<void, E>
  readonly interrupt: (key: Key, seq?: number) => Effect.Effect<void>
}

type Chain<A, E> = {
  readonly done: Deferred.Deferred<A, E>
  readonly settled: Deferred.Deferred<Exit.Exit<A, E>>
}

export const make = <Key, A, E>(options: {
  readonly drain: (key: Key, mode: Mode) => Effect.Effect<A, E>
  readonly onFailure?: (key: Key, cause: Cause.Cause<E>) => Effect.Effect<void>
}): Effect.Effect<Coordinator<Key, A, E>, never, Scope.Scope> =>
  Effect.gen(function* () {
    const state = yield* SynchronizedRef.make(SessionRunCoordinatorMachine.initial<Key>())
    const report = yield* FiberSet.makeRuntime<never, void, never>()
    const fork = yield* FiberSet.makeRuntime<never, void, never>()
    const chains = new Map<number, Chain<A, E>>()
    const waiters = new Map<number, Deferred.Deferred<A, E>>()
    const owners = new Map<number, Deferred.Deferred<Fiber.Fiber<void>>>()
    const shutdown = Deferred.makeUnsafe<void>()

    const chain = (chainID: number) => {
      const existing = chains.get(chainID)
      if (existing !== undefined) return existing
      const created = { done: Deferred.makeUnsafe<A, E>(), settled: Deferred.makeUnsafe<Exit.Exit<A, E>>() }
      chains.set(chainID, created)
      return created
    }
    const waiter = (waiterID: number) => {
      const existing = waiters.get(waiterID)
      if (existing !== undefined) return existing
      const created = Deferred.makeUnsafe<A, E>()
      waiters.set(waiterID, created)
      return created
    }
    const owner = (attemptID: number) => {
      const existing = owners.get(attemptID)
      if (existing !== undefined) return existing
      const created = Deferred.makeUnsafe<Fiber.Fiber<void>>()
      owners.set(attemptID, created)
      return created
    }

    const requireChain = (chainID: number) => {
      const existing = chains.get(chainID)
      if (existing !== undefined) return existing
      throw new Error(`Missing Session run chain ${chainID}`)
    }
    const requireWaiter = (waiterID: number) => {
      const existing = waiters.get(waiterID)
      if (existing !== undefined) return existing
      throw new Error(`Missing Session run waiter ${waiterID}`)
    }

    type RuntimeResponse =
      | { readonly _tag: "None" | "Idle" | "Closed" }
      | { readonly _tag: "Await"; readonly deferred: Deferred.Deferred<A, E> }
      | { readonly _tag: "Retry" | "Observe"; readonly deferred: Deferred.Deferred<Exit.Exit<A, E>> }

    const transition = (event: SessionRunCoordinatorMachine.Event<Key>) =>
      SynchronizedRef.modifyEffect(state, (current) => {
        const result = SessionRunCoordinatorMachine.reduce(current, event)
        return Effect.sync(() => {
          result.actions.forEach((action) => {
            if (action._tag !== "Start") return
            chain(action.chain)
            owner(action.attempt)
          })
          if (result.response._tag === "AwaitChain") chain(result.response.chain)
          if (result.response._tag === "AwaitWaiter") waiter(result.response.waiter)
          const response: RuntimeResponse =
            result.response._tag === "AwaitChain"
              ? { _tag: "Await", deferred: requireChain(result.response.chain).done }
              : result.response._tag === "AwaitWaiter"
                ? { _tag: "Await", deferred: requireWaiter(result.response.waiter) }
                : result.response._tag === "RetryAfter"
                  ? { _tag: "Retry", deferred: requireChain(result.response.chain).settled }
                  : result.response._tag === "ObserveChain"
                    ? { _tag: "Observe", deferred: requireChain(result.response.chain).settled }
                    : { _tag: result.response._tag }
          return [{ actions: result.actions, response }, result.state] as const
        })
      })

    type Execution = { readonly _tag: "General" } | { readonly _tag: "Settlement"; readonly exit: Exit.Exit<A, E> }

    const execute = (
      actions: ReadonlyArray<SessionRunCoordinatorMachine.Action<Key>>,
      execution: Execution,
    ): Effect.Effect<void> =>
      Effect.forEach(
        actions,
        (action): Effect.Effect<void> => {
          if (action._tag === "Start") {
            requireChain(action.chain)
            const ownerDeferred = owners.get(action.attempt)
            if (ownerDeferred === undefined) return Effect.die(`Missing Session run attempt ${action.attempt}`)
            const ready = Deferred.makeUnsafe<void>()
            const drain = Effect.suspend(() =>
              options.drain(action.key, SessionRunCoordinatorMachine.Demand.mode(action.demand)),
            )
            const fiber = fork(
              (action.successor
                ? Effect.yieldNow.pipe(Effect.andThen(drain))
                : Deferred.await(ready).pipe(Effect.andThen(drain))
              ).pipe(
                Effect.onExit((result) => settle(action.key, action.chain, action.attempt, result)),
                Effect.exit,
                Effect.asVoid,
              ),
            )
            Deferred.doneUnsafe(ownerDeferred, Effect.succeed(fiber))
            if (!action.successor) Deferred.doneUnsafe(ready, Effect.void)
            return Effect.void
          }
          if (action._tag === "Interrupt") {
            const ownerDeferred = owners.get(action.attempt)
            return ownerDeferred === undefined
              ? Effect.void
              : Deferred.await(ownerDeferred).pipe(Effect.flatMap(Fiber.interrupt))
          }
          if (execution._tag !== "Settlement") return Effect.die("Settlement action requires a settlement context")
          if (action._tag === "CompleteWaiter") {
            const deferred = requireWaiter(action.waiter)
            waiters.delete(action.waiter)
            Deferred.doneUnsafe(deferred, execution.exit)
            return Effect.void
          }
          if (action._tag === "CompleteChain") {
            const deferreds = requireChain(action.chain)
            chains.delete(action.chain)
            Deferred.doneUnsafe(deferreds.done, execution.exit)
            Deferred.doneUnsafe(deferreds.settled, Effect.succeed(execution.exit))
            return Effect.void
          }
          if (action._tag === "Report") {
            const onFailure = options.onFailure
            if (execution.exit._tag === "Success") return Effect.die("Failure report requires a failed settlement")
            if (onFailure === undefined) return Effect.void
            const cause = execution.exit.cause
            report(Effect.suspend(() => onFailure(action.key, cause)))
          }
          return Effect.void
        },
        { discard: true },
      ).pipe(Effect.asVoid)

    const settle = (key: Key, chainID: number, attemptID: number, exit: Exit.Exit<A, E>) => {
      return transition({
        _tag: "Settled",
        key,
        chain: chainID,
        attempt: attemptID,
        outcome: exit._tag === "Success" ? "Success" : Cause.hasInterruptsOnly(exit.cause) ? "Interrupted" : "Failure",
      }).pipe(
        Effect.flatMap((result) => execute(result.actions, { _tag: "Settlement", exit })),
        Effect.ensuring(Effect.sync(() => owners.delete(attemptID))),
      )
    }

    const dispatch = (event: SessionRunCoordinatorMachine.Event<Key>) =>
      Effect.uninterruptible(
        transition(event).pipe(Effect.flatMap((result) => execute(result.actions, { _tag: "General" }))),
      )

    const run = (key: Key): Effect.Effect<A, E> =>
      Effect.suspend(() =>
        Effect.uninterruptibleMask((restore) => {
          return transition({ _tag: "Run", key }).pipe(
            Effect.flatMap((result) => {
              return execute(result.actions, { _tag: "General" }).pipe(
                Effect.andThen(
                  result.response._tag === "Await"
                    ? awaitResult(result.response.deferred)
                    : result.response._tag === "Retry"
                      ? Effect.raceFirst(
                          Deferred.await(result.response.deferred).pipe(Effect.as(true)),
                          Deferred.await(shutdown).pipe(Effect.as(false)),
                        ).pipe(Effect.flatMap((settled) => (settled ? run(key) : Effect.interrupt)))
                      : Effect.interrupt,
                ),
                restore,
              )
            }),
          )
        }),
      )

    const wake = (key: Key, seq?: number) => {
      return Effect.uninterruptible(
        Effect.suspend(() => {
          return transition({ _tag: "Wake", key, seq }).pipe(
            Effect.flatMap((result) => execute(result.actions, { _tag: "General" })),
          )
        }),
      )
    }

    const interrupt = (key: Key, seq?: number) => dispatch({ _tag: "Interrupt", key, seq })

    const awaitIdle = (key: Key): Effect.Effect<void, E> =>
      Effect.gen(function* () {
        let failure: Cause.Cause<E> | undefined
        while (true) {
          const observation = yield* transition({ _tag: "Observe", key })
          if (observation.response._tag !== "Observe") break
          const exit = yield* Effect.raceFirst(
            Deferred.await(observation.response.deferred),
            Deferred.await(shutdown).pipe(Effect.as(Exit.void)),
          )
          if (exit._tag === "Failure" && failure === undefined) failure = exit.cause
        }
        if (failure !== undefined) return yield* Effect.failCause(failure)
        return undefined
      })

    yield* Effect.addFinalizer(() =>
      transition({ _tag: "Close" }).pipe(Effect.andThen(Effect.sync(() => Deferred.doneUnsafe(shutdown, Effect.void)))),
    )

    return { run, wake, interrupt, awaitIdle }

    function awaitResult(deferred: Deferred.Deferred<A, E>) {
      return Effect.raceFirst(Deferred.await(deferred), Deferred.await(shutdown).pipe(Effect.andThen(Effect.interrupt)))
    }
  })

export interface Interface extends Coordinator<SessionSchema.ID, void, SessionRunner.RunError> {}

export class Service extends Context.Service<Service, Interface>()("@opencode/v2/SessionRunCoordinator") {}

export const layer = Layer.effect(
  Service,
  SessionRunner.Service.pipe(
    Effect.flatMap((runner) =>
      make<SessionSchema.ID, void, SessionRunner.RunError>({
        drain: (sessionID, mode) => runner.run({ sessionID, force: mode === "run" }),
        onFailure: (sessionID, cause) =>
          Effect.logError("Failed to drain Session").pipe(
            Effect.annotateLogs("sessionID", sessionID),
            Effect.annotateLogs("cause", cause),
          ),
      }),
    ),
    Effect.map(Service.of),
  ),
)
