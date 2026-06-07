/** @internal Pure state machine for the process-local Session run coordinator. */
export * as SessionRunCoordinatorMachine from "./run-coordinator-machine"

/** @internal */
export type Mode = "run" | "wake"

/** @internal */
export type Demand = {
  readonly explicit: boolean
  readonly wakeSeq?: number
  readonly unsequencedWake: boolean
}

type NonEmptyDemand = Demand &
  ({ readonly explicit: true } | { readonly wakeSeq: number } | { readonly unsequencedWake: true })

/** @internal */
export const Demand = {
  empty: { explicit: false, unsequencedWake: false } satisfies Demand,
  explicit: { explicit: true, unsequencedWake: false } satisfies NonEmptyDemand,
  wake: (seq?: number): NonEmptyDemand =>
    seq === undefined
      ? { explicit: false, unsequencedWake: true }
      : { explicit: false, wakeSeq: seq, unsequencedWake: false },
  combine: (left: Demand, right: Demand): Demand => ({
    explicit: left.explicit || right.explicit,
    wakeSeq:
      left.wakeSeq === undefined
        ? right.wakeSeq
        : right.wakeSeq === undefined
          ? left.wakeSeq
          : Math.max(left.wakeSeq, right.wakeSeq),
    unsequencedWake: left.unsequencedWake || right.unsequencedWake,
  }),
  afterBoundary: (demand: Demand, boundary?: number): Demand => ({
    explicit: false,
    wakeSeq:
      boundary !== undefined && demand.wakeSeq !== undefined && demand.wakeSeq > boundary ? demand.wakeSeq : undefined,
    unsequencedWake: false,
  }),
  nonEmpty: (demand: Demand): demand is NonEmptyDemand =>
    demand.explicit || demand.wakeSeq !== undefined || demand.unsequencedWake,
  mode: (demand: Demand): Mode => (demand.explicit ? "run" : "wake"),
}

type Running = {
  readonly _tag: "Running"
  readonly chain: number
  readonly attempt: number
  readonly current: NonEmptyDemand
  readonly pending: Demand
  readonly waiter?: number
}

type Stopping = {
  readonly _tag: "Stopping"
  readonly chain: number
  readonly attempt: number
  readonly current: NonEmptyDemand
  readonly pending: Demand
  readonly waiter?: number
  readonly stopBoundary?: number
}

/** @internal */
export type Lane = Running | Stopping

/** @internal */
export type State<Key> = {
  readonly closed: boolean
  readonly nextID: number
  readonly lanes: ReadonlyMap<Key, Lane>
  readonly interruptSeq: ReadonlyMap<Key, number>
}

/** @internal */
export const initial = <Key>(): State<Key> => ({ closed: false, nextID: 1, lanes: new Map(), interruptSeq: new Map() })

/** @internal */
export type Outcome = "Success" | "Failure" | "Interrupted"

/** @internal */
export type Event<Key> =
  | { readonly _tag: "Close" }
  | { readonly _tag: "Run"; readonly key: Key }
  | { readonly _tag: "Wake"; readonly key: Key; readonly seq?: number }
  | { readonly _tag: "Interrupt"; readonly key: Key; readonly seq?: number }
  | { readonly _tag: "Observe"; readonly key: Key }
  | {
      readonly _tag: "Settled"
      readonly key: Key
      readonly chain: number
      readonly attempt: number
      readonly outcome: Outcome
    }

/** @internal */
export type Action<Key> =
  | {
      readonly _tag: "Start"
      readonly key: Key
      readonly chain: number
      readonly attempt: number
      readonly demand: NonEmptyDemand
      readonly successor: boolean
    }
  | { readonly _tag: "Interrupt"; readonly attempt: number }
  | { readonly _tag: "CompleteChain"; readonly chain: number }
  | { readonly _tag: "CompleteWaiter"; readonly waiter: number }
  | { readonly _tag: "Report"; readonly key: Key }

/** @internal */
export type Response =
  | { readonly _tag: "None" }
  | { readonly _tag: "AwaitChain"; readonly chain: number }
  | { readonly _tag: "AwaitWaiter"; readonly waiter: number }
  | { readonly _tag: "RetryAfter"; readonly chain: number }
  | { readonly _tag: "ObserveChain"; readonly chain: number }
  | { readonly _tag: "Idle" }
  | { readonly _tag: "Closed" }

/** @internal */
export type Transition<Key> = {
  readonly state: State<Key>
  readonly actions: ReadonlyArray<Action<Key>>
  readonly response: Response
}

const none: Response = { _tag: "None" }

/** @internal */
export const reduce = <Key>(state: State<Key>, event: Event<Key>): Transition<Key> => {
  if (event._tag === "Close")
    return { state: { ...state, closed: true, lanes: new Map(), interruptSeq: new Map() }, actions: [], response: none }
  if (state.closed) return { state, actions: [], response: event._tag === "Run" ? { _tag: "Closed" } : none }
  if (event._tag === "Run") return run(state, event)
  if (event._tag === "Wake") return wake(state, event)
  if (event._tag === "Interrupt") return interrupt(state, event)
  if (event._tag === "Observe") {
    const lane = state.lanes.get(event.key)
    return {
      state,
      actions: [],
      response: lane === undefined ? { _tag: "Idle" } : { _tag: "ObserveChain", chain: lane.chain },
    }
  }
  return settled(state, event)
}

const run = <Key>(state: State<Key>, event: Extract<Event<Key>, { _tag: "Run" }>): Transition<Key> => {
  const lane = state.lanes.get(event.key)
  if (lane?._tag === "Stopping") return { state, actions: [], response: { _tag: "RetryAfter", chain: lane.chain } }
  if (lane !== undefined && lane.current.explicit)
    return { state, actions: [], response: { _tag: "AwaitChain", chain: lane.chain } }
  if (lane !== undefined) {
    const [allocated, waiter] = lane.waiter === undefined ? allocate(state) : [state, lane.waiter]
    return {
      state: setLane(allocated, event.key, { ...lane, pending: Demand.combine(lane.pending, Demand.explicit), waiter }),
      actions: [],
      response: { _tag: "AwaitWaiter", waiter },
    }
  }
  const [withChain, chain] = allocate(state)
  const [allocated, attempt] = allocate(withChain)
  const next: Lane = {
    _tag: "Running",
    chain,
    attempt,
    current: Demand.explicit,
    pending: Demand.empty,
  }
  return {
    state: setLane(allocated, event.key, next),
    actions: [
      {
        _tag: "Start",
        key: event.key,
        chain: next.chain,
        attempt: next.attempt,
        demand: next.current,
        successor: false,
      },
    ],
    response: { _tag: "AwaitChain", chain: next.chain },
  }
}

const wake = <Key>(state: State<Key>, event: Extract<Event<Key>, { _tag: "Wake" }>): Transition<Key> => {
  const boundary = state.interruptSeq.get(event.key)
  if (boundary !== undefined && (event.seq === undefined || event.seq <= boundary))
    return { state, actions: [], response: none }
  const lane = state.lanes.get(event.key)
  if (lane !== undefined) {
    if (
      lane._tag === "Stopping" &&
      (lane.stopBoundary === undefined || event.seq === undefined || event.seq <= lane.stopBoundary)
    )
      return { state, actions: [], response: none }
    return {
      state: setLane(state, event.key, { ...lane, pending: Demand.combine(lane.pending, Demand.wake(event.seq)) }),
      actions: [],
      response: none,
    }
  }
  const [withChain, chain] = allocate(state)
  const [allocated, attempt] = allocate(withChain)
  const next: Lane = {
    _tag: "Running",
    chain,
    attempt,
    current: Demand.wake(event.seq),
    pending: Demand.empty,
  }
  return {
    state: setLane(allocated, event.key, next),
    actions: [
      {
        _tag: "Start",
        key: event.key,
        chain: next.chain,
        attempt: next.attempt,
        demand: next.current,
        successor: false,
      },
    ],
    response: none,
  }
}

const interrupt = <Key>(state: State<Key>, event: Extract<Event<Key>, { _tag: "Interrupt" }>): Transition<Key> => {
  const latest = state.interruptSeq.get(event.key)
  const lane = state.lanes.get(event.key)
  if (event.seq !== undefined && latest !== undefined && event.seq <= latest)
    return {
      state,
      actions: lane?._tag === "Stopping" ? [{ _tag: "Interrupt", attempt: lane.attempt }] : [],
      response: none,
    }
  const bounded = event.seq === undefined ? state : setInterruptSeq(state, event.key, event.seq)
  if (lane === undefined) return { state: bounded, actions: [], response: none }
  if (
    !lane.current.explicit &&
    event.seq !== undefined &&
    lane.current.wakeSeq !== undefined &&
    lane.current.wakeSeq > event.seq
  )
    return { state: bounded, actions: [], response: none }
  const pending = Demand.combine(
    Demand.afterBoundary(lane.current, event.seq),
    Demand.afterBoundary(lane.pending, event.seq),
  )
  return {
    state: setLane(bounded, event.key, {
      _tag: "Stopping",
      chain: lane.chain,
      attempt: lane.attempt,
      current: lane.current,
      pending,
      waiter: lane.waiter,
      stopBoundary: lane._tag === "Stopping" ? maxSeq(lane.stopBoundary, event.seq) : event.seq,
    }),
    actions: [{ _tag: "Interrupt", attempt: lane.attempt }],
    response: none,
  }
}

const settled = <Key>(state: State<Key>, event: Extract<Event<Key>, { _tag: "Settled" }>): Transition<Key> => {
  const lane = state.lanes.get(event.key)
  if (lane?.chain !== event.chain || lane.attempt !== event.attempt) return { state, actions: [], response: none }
  const completesWaiter = lane.current.explicit || (lane._tag === "Stopping" && !lane.current.explicit)
  const waiterActions: ReadonlyArray<Action<Key>> =
    completesWaiter && lane.waiter !== undefined ? [{ _tag: "CompleteWaiter", waiter: lane.waiter }] : []
  const waiter = completesWaiter ? undefined : lane.waiter
  if (event.outcome === "Success" && lane._tag === "Running" && Demand.nonEmpty(lane.pending)) {
    const [allocated, attempt] = allocate(state)
    const next = { ...lane, attempt, current: lane.pending, pending: Demand.empty, waiter }
    return {
      state: setLane(allocated, event.key, next),
      actions: [
        ...waiterActions,
        {
          _tag: "Start",
          key: event.key,
          chain: next.chain,
          attempt: next.attempt,
          demand: next.current,
          successor: true,
        },
      ],
      response: none,
    }
  }
  const report: ReadonlyArray<Action<Key>> =
    event.outcome !== "Success" &&
    !(lane._tag === "Stopping" && event.outcome === "Interrupted") &&
    !lane.current.explicit
      ? [{ _tag: "Report", key: event.key }]
      : []
  if (!Demand.nonEmpty(lane.pending))
    return {
      state: deleteLane(state, event.key),
      actions: [...waiterActions, { _tag: "CompleteChain", chain: lane.chain }, ...report],
      response: none,
    }
  const [withChain, chain] = allocate(state)
  const [allocated, attempt] = allocate(withChain)
  const next: Lane = {
    _tag: "Running",
    chain,
    attempt,
    current: lane.pending,
    pending: Demand.empty,
    waiter,
  }
  return {
    state: setLane(allocated, event.key, next),
    actions: [
      ...waiterActions,
      {
        _tag: "Start",
        key: event.key,
        chain: next.chain,
        attempt: next.attempt,
        demand: next.current,
        successor: true,
      },
      { _tag: "CompleteChain", chain: lane.chain },
      ...report,
    ],
    response: none,
  }
}

const maxSeq = (left?: number, right?: number) =>
  left === undefined ? right : right === undefined ? left : Math.max(left, right)

const allocate = <Key>(state: State<Key>): readonly [State<Key>, number] => [
  { ...state, nextID: state.nextID + 1 },
  state.nextID,
]

const setLane = <Key>(state: State<Key>, key: Key, lane: Lane): State<Key> => {
  const lanes = new Map(state.lanes)
  lanes.set(key, lane)
  return { ...state, lanes }
}

const deleteLane = <Key>(state: State<Key>, key: Key): State<Key> => {
  const lanes = new Map(state.lanes)
  lanes.delete(key)
  return { ...state, lanes }
}

const setInterruptSeq = <Key>(state: State<Key>, key: Key, seq: number): State<Key> => {
  const interruptSeq = new Map(state.interruptSeq)
  interruptSeq.set(key, seq)
  return { ...state, interruptSeq }
}
