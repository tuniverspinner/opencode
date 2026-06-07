import { describe, expect, test } from "bun:test"
import { SessionRunCoordinatorMachine } from "../src/session/run-coordinator-machine"

const Machine = SessionRunCoordinatorMachine

describe("SessionRunCoordinatorMachine.Demand", () => {
  test("empty is the combine identity", () => {
    const demand = SessionRunCoordinatorMachine.Demand.combine(
      SessionRunCoordinatorMachine.Demand.explicit,
      SessionRunCoordinatorMachine.Demand.wake(3),
    )

    expect(SessionRunCoordinatorMachine.Demand.combine(SessionRunCoordinatorMachine.Demand.empty, demand)).toEqual(
      demand,
    )
    expect(SessionRunCoordinatorMachine.Demand.combine(demand, SessionRunCoordinatorMachine.Demand.empty)).toEqual(
      demand,
    )
  })

  test("combine is associative, commutative, and idempotent", () => {
    const left = Machine.Demand.explicit
    const middle = Machine.Demand.wake()
    const right = Machine.Demand.wake(3)

    expect(Machine.Demand.combine(left, right)).toEqual(Machine.Demand.combine(right, left))
    expect(Machine.Demand.combine(left, left)).toEqual(left)
    expect(Machine.Demand.combine(Machine.Demand.combine(left, middle), right)).toEqual(
      Machine.Demand.combine(left, Machine.Demand.combine(middle, right)),
    )
  })

  test("afterBoundary removes explicit and stale wake components", () => {
    const combined = Machine.Demand.combine(Machine.Demand.explicit, Machine.Demand.wake(3))

    expect(Machine.Demand.afterBoundary(combined, 2)).toEqual(Machine.Demand.wake(3))
    expect(Machine.Demand.nonEmpty(Machine.Demand.afterBoundary(combined, 3))).toBeFalse()
    expect(Machine.Demand.nonEmpty(Machine.Demand.afterBoundary(combined))).toBeFalse()
  })

  test("mode follows only the explicit component", () => {
    expect(Machine.Demand.mode(Machine.Demand.explicit)).toBe("run")
    expect(Machine.Demand.mode(Machine.Demand.wake(1))).toBe("wake")
    expect(Machine.Demand.mode(Machine.Demand.combine(Machine.Demand.explicit, Machine.Demand.wake(1)))).toBe("run")
  })
})

describe("SessionRunCoordinatorMachine.reduce", () => {
  test("ignores a stale attempt from the active chain", () => {
    const active = combinedActive(3)
    const result = Machine.reduce(active, {
      _tag: "Settled",
      key: "session",
      chain: 1,
      attempt: 2,
      outcome: "Success",
    })

    expect(result.state).toBe(active)
    expect(result.actions).toEqual([])
    expect(result.response).toEqual({ _tag: "None" })
  })

  test("ignores duplicate and foreign settlements", () => {
    const active = combinedActive(3)
    const foreign = Machine.reduce(active, {
      _tag: "Settled",
      key: "session",
      chain: 99,
      attempt: 100,
      outcome: "Failure",
    })
    const idle = Machine.reduce(Machine.initial<string>(), {
      _tag: "Settled",
      key: "session",
      chain: 1,
      attempt: 2,
      outcome: "Success",
    })

    expect(foreign).toEqual({ state: active, actions: [], response: { _tag: "None" } })
    expect(idle.actions).toEqual([])
    expect(idle.state).toEqual(Machine.initial<string>())
  })

  test("completes the superseded chain when creating its successor", () => {
    const interrupted = Machine.reduce(combinedActive(3), { _tag: "Interrupt", key: "session", seq: 2 })
    const settled = Machine.reduce(interrupted.state, {
      _tag: "Settled",
      key: "session",
      chain: 1,
      attempt: 4,
      outcome: "Interrupted",
    })

    expect(settled.actions).toContainEqual({ _tag: "CompleteChain", chain: 1 })
    expect(settled.state.lanes.get("session")?.chain).not.toBe(1)
  })

  test("returns caller observation separately from executable actions", () => {
    const result = Machine.reduce(Machine.initial<string>(), {
      _tag: "Run",
      key: "session",
    })

    expect(result.response).toEqual({ _tag: "AwaitChain", chain: 1 })
    expect(result.actions).toEqual([
      {
        _tag: "Start",
        key: "session",
        chain: 1,
        attempt: 2,
        demand: Machine.Demand.explicit,
        successor: false,
      },
    ])
    expect(result.state.nextID).toBe(3)
  })

  test("allocates only identities selected by each transition", () => {
    const woken = Machine.reduce(Machine.initial<string>(), { _tag: "Wake", key: "session", seq: 1 })
    expect(woken.state.nextID).toBe(3)

    const coalesced = Machine.reduce(woken.state, { _tag: "Wake", key: "session", seq: 2 })
    expect(coalesced.state.nextID).toBe(3)

    const explicit = Machine.reduce(coalesced.state, { _tag: "Run", key: "session" })
    expect(explicit.state.nextID).toBe(4)

    const joined = Machine.reduce(explicit.state, { _tag: "Run", key: "session" })
    expect(joined.state.nextID).toBe(4)

    const continued = Machine.reduce(joined.state, {
      _tag: "Settled",
      key: "session",
      chain: 1,
      attempt: 2,
      outcome: "Success",
    })
    expect(continued.state.nextID).toBe(5)
    expect(continued.state.lanes.get("session")?.attempt).toBe(4)
  })

  test("interrupting an active combined demand preserves its newer wake as an advisory successor", () => {
    const active = combinedActive(3)
    const interrupted = Machine.reduce(active, { _tag: "Interrupt", key: "session", seq: 2 })

    expect(interrupted.actions).toEqual([{ _tag: "Interrupt", attempt: 4 }])
    expect(interrupted.state.lanes.get("session")?.pending).toEqual(Machine.Demand.wake(3))

    const settled = Machine.reduce(interrupted.state, {
      _tag: "Settled",
      key: "session",
      chain: 1,
      attempt: 4,
      outcome: "Interrupted",
    })
    expect(settled.state.lanes.get("session")?.current).toEqual(Machine.Demand.wake(3))
    expect(settled.actions).toContainEqual({
      _tag: "Start",
      key: "session",
      chain: 5,
      attempt: 6,
      demand: Machine.Demand.wake(3),
      successor: true,
    })
  })

  test("interrupting an active combined demand suppresses its wake at the boundary", () => {
    const active = combinedActive(2)
    const interrupted = Machine.reduce(active, { _tag: "Interrupt", key: "session", seq: 2 })
    const pending = interrupted.state.lanes.get("session")?.pending

    expect(pending).toBeDefined()
    if (pending === undefined) throw new Error("Missing stopping lane")
    expect(Machine.Demand.nonEmpty(pending)).toBeFalse()

    const settled = Machine.reduce(interrupted.state, {
      _tag: "Settled",
      key: "session",
      chain: 1,
      attempt: 4,
      outcome: "Interrupted",
    })
    expect(settled.state.lanes.has("session")).toBeFalse()
    expect(settled.actions.some((action) => action._tag === "Start")).toBeFalse()
  })
})

function combinedActive(seq: number) {
  const woken = Machine.reduce(Machine.initial<string>(), {
    _tag: "Wake",
    key: "session",
    seq: 1,
  })
  const explicit = Machine.reduce(woken.state, {
    _tag: "Run",
    key: "session",
  })
  const pending = Machine.reduce(explicit.state, {
    _tag: "Wake",
    key: "session",
    seq,
  })
  const active = Machine.reduce(pending.state, {
    _tag: "Settled",
    key: "session",
    chain: 1,
    attempt: 2,
    outcome: "Success",
  })
  return active.state
}
