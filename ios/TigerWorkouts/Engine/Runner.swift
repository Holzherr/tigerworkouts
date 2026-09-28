import Foundation

/// The timer engine, ported from `src/features/timer/runner.ts`. It expands a runsheet into slots
/// and steps through them. Pure: every transition takes `now` in milliseconds, so it tests without
/// a clock. The view model adds the tick, the haptics, the sound and the saving.

enum SlotKind: String, Codable, Hashable, Sendable { case work, rest }

enum SlotMode: String, Codable, Hashable, Sendable { case loose, rounds, fortime, amrap, emom, ladder }

enum Phase: String, Codable, Hashable, Sendable { case ready, lead, running, paused, done }

struct Slot: Identifiable, Hashable, Sendable, Codable {
    var id: String
    var kind: SlotKind
    var step: Step
    /// Countdown length. nil = user-paced (reps, max, distance), ends on Done.
    var seconds: Double?
    var blockId: String?
    var blockName: String?
    var mode: SlotMode
    var round: Int
    var rounds: Int
    /// emom: the rest fills the minute; `seconds` is computed from the block start on entry.
    var untilBoundary: Bool = false
    var everySec: Double?
    var rung: Double?
    /// amrap/fortime: the cap on the whole block, seconds.
    var capSec: Double?
    /// rounds blocks: what the step prescribes for this set on its own (`step.sets[round]`). Its
    /// reps are already in the step's forValue; its load is read by `effectiveTarget`.
    var plan: SetPlan?
    /// Which top-level item this slot belongs to, 0-based, and how many there are.
    var part: Int
    var parts: Int
    /// The item's role: a warm-up or cool-down is not part of a for-time score.
    var role: ItemRole?

    var exercise: ExerciseStep? { step.asExercise }

    /// "Round 3 of 8". An amrap runs until its cap, so it has no last round to count towards.
    var roundLabel: String? {
        if mode == .amrap { return "Round \(round + 1)" }
        return rounds > 1 ? "Round \(round + 1) of \(rounds)" : nil
    }
}

struct Change: Hashable, Sendable, Codable {
    var atSec: Double
    var target: Double
}

struct Actual: Hashable, Sendable, Codable {
    var target: Double?
    var incline: Double?
    var reps: Double?
    var changes: [Change] = []
    var doneAt: Double?
    /// Session time when it was done, seconds, pauses excluded.
    var at: Double?
    /// The set's type changed on the grid; over the plan's.
    var type: SetType?
    /// Seconds worked on the set, kept when it is done: see `workedSeconds`.
    var seconds: Double?
    /// Distance or calories done, changed from the plan on the timer card or the set grid.
    var meters: Double?
    var calories: Double?
}

struct Clock: Hashable, Sendable {
    /// Seconds left in the countdown, nil for a user-paced slot.
    var left: Double?
    /// Seconds spent in the current slot.
    var spent: Double
}

struct RunState: Hashable, Sendable, Codable {
    var runsheetId: String
    var title: String
    var slots: [Slot]
    var i: Int
    var phase: Phase
    var startedAt: Double
    var endedAt: Double?
    /// When the current slot (or lead-in) started, ms.
    var slotStartedAt: Double
    /// Countdown end, ms; nil for user-paced.
    var endsAt: Double?
    /// Remaining ms captured on pause.
    var remainingMs: Double?
    var pausedMs: Double = 0
    var pausedAt: Double?
    var actuals: [String: Actual] = [:]
    var dropped: [String] = []
    /// ms at which each block's first slot started, for caps and EMOM boundaries. A pause taken
    /// inside a block moves its start later by the pause, so the block's clock excludes it.
    var blockStart: [String: Double] = [:]
    /// Slots completed per block, for AMRAP scoring.
    var blockDone: [String: Int] = [:]
    var leadSec: Double = Runner.leadSec
    /// What a pause interrupted, so resuming goes back to it: the lead-in or a running slot.
    /// Optional, like the two below, so a run saved by an older build still decodes.
    var pausedFrom: Phase?
    /// Session time, seconds, pauses excluded, at which each part (block or loose step) started
    /// and was left. A for-time score is the time spent in the main parts: no lead-in, no gate, no
    /// warm-up.
    var partAt: [Int: Double]?
    var partOut: [Int: Double]?
}

enum Runner {
    static let leadSec: Double = 5

    private static func estimate(_ s: Step) -> Double {
        if let c = s.clockSeconds { return c }
        if case .exercise(let e) = s { return (e.forValue == 0 ? 10 : e.forValue) * 3 }
        return 30
    }

    // MARK: - Expansion

    /// Expand a runsheet into the ordered slot list the timer walks. Dropped step ids are skipped.
    static func expand(_ r: Runsheet, dropped: [String] = []) -> [Slot] {
        var out: [Slot] = []
        let skip = Set(dropped)
        var n = 0
        let parts = r.items.filter { if case .ref = $0 { return false } else { return true } }.count
        var part = -1

        var role: ItemRole?

        func push(_ step: Step, _ make: (inout Slot) -> Void) {
            guard !skip.contains(step.id) else { return }
            var slot = Slot(
                id: "\(step.id)#\(n)", kind: step.asExercise == nil ? .rest : .work, step: step,
                seconds: step.clockSeconds, mode: .loose, round: 0, rounds: 1, part: part, parts: parts, role: role
            )
            n += 1
            make(&slot)
            out.append(slot)
        }

        for item in r.items {
            if case .ref = item { continue }
            part += 1
            role = item.role
            guard let b = item.asBlock else {
                if let s = item.asStep { push(s) { $0.mode = .loose; $0.round = 0; $0.rounds = 1 } }
                continue
            }
            let mode = b.runMode

            func between(_ round: Int, _ rounds: Int) {
                guard let rest = b.restBetweenSec, round < rounds - 1 else { return }
                let step = Step.rest(RestStep(id: "\(b.id):between", seconds: rest))
                out.append(Slot(
                    id: "\(b.id):between#\(n)", kind: .rest, step: step, seconds: rest,
                    blockId: b.id, blockName: b.name, mode: SlotMode(rawValue: mode.rawValue) ?? .rounds,
                    round: round, rounds: rounds, part: part, parts: parts, role: role
                ))
                n += 1
            }

            let slotMode = SlotMode(rawValue: mode.rawValue) ?? .rounds

            if mode == .ladder {
                let rungs = b.ladder ?? [Double(b.repeatCount)]
                for (ri, rung) in rungs.enumerated() {
                    for s in b.rungSteps(rung) {
                        push(s) {
                            $0.blockId = b.id; $0.blockName = b.name; $0.mode = slotMode
                            $0.round = ri; $0.rounds = rungs.count; $0.rung = rung; $0.capSec = b.timeCapSec
                        }
                    }
                    between(ri, rungs.count)
                }
                continue
            }

            if mode == .emom {
                let every = b.everySec ?? 60
                for m in 0..<max(1, b.repeatCount) {
                    for s in b.steps where s.asExercise != nil {
                        push(s) {
                            $0.blockId = b.id; $0.blockName = b.name; $0.mode = slotMode
                            $0.round = m; $0.rounds = b.repeatCount; $0.everySec = every
                        }
                    }
                    let wait = Step.rest(RestStep(id: "\(b.id):wait", seconds: every))
                    out.append(Slot(
                        id: "\(b.id):wait#\(n)", kind: .rest, step: wait, seconds: every,
                        blockId: b.id, blockName: b.name, mode: slotMode, round: m, rounds: b.repeatCount,
                        untilBoundary: true, everySec: every, part: part, parts: parts, role: role
                    ))
                    n += 1
                }
                continue
            }

            let roundLen = b.steps.reduce(0.0) { $0 + estimate($1) }
            // An amrap's rounds are a guess to start from: a capped one grows a round at a time
            // (see `extendAmrap`) and ends on the cap, however fast the rounds go.
            let rounds: Int = mode == .amrap
                ? max(2, Int(((b.timeCapSec ?? 600) / max(15, roundLen)).rounded(.up)))
                : max(1, b.repeatCount)
            let cap = (mode == .amrap || mode == .fortime) ? b.timeCapSec : nil
            for ri in 0..<rounds {
                for s in b.steps {
                    var step = s
                    var plan: SetPlan?
                    // A set with its own reps runs them; its load goes on the slot for effectiveTarget.
                    if mode == .rounds, case .exercise(var e) = s, let sets = e.sets, !sets.isEmpty {
                        if sets.indices.contains(ri), !sets[ri].isEmpty { plan = sets[ri] }
                        e.forValue = e.plannedSet(ri).reps
                        step = .exercise(e)
                    }
                    push(step) {
                        $0.blockId = b.id; $0.blockName = b.name; $0.mode = slotMode
                        $0.round = ri; $0.rounds = rounds; $0.capSec = cap; $0.plan = plan
                    }
                }
                between(ri, rounds)
            }
        }
        return out
    }

    // MARK: - Lifecycle

    static func start(_ r: Runsheet, now: Double, dropped: [String] = []) -> RunState {
        RunState(
            runsheetId: r.id ?? r.title,
            title: r.title,
            slots: expand(r, dropped: dropped),
            i: 0,
            phase: .lead,
            startedAt: now,
            slotStartedAt: now,
            endsAt: now + leadSec * 1000,
            dropped: dropped
        )
    }

    static func current(_ s: RunState) -> Slot? { s.slots.indices.contains(s.i) ? s.slots[s.i] : nil }
    static func next(_ s: RunState) -> Slot? { s.slots.indices.contains(s.i + 1) ? s.slots[s.i + 1] : nil }

    /// Seconds since the session started, excluding pauses.
    static func elapsed(_ s: RunState, now: Double) -> Double {
        let end = s.endedAt ?? ((s.phase == .paused ? s.pausedAt : nil) ?? now)
        return max(0, (end - s.startedAt - s.pausedMs) / 1000)
    }

    static func clock(_ s: RunState, now: Double) -> Clock {
        if s.phase == .ready { return Clock(left: current(s)?.seconds, spent: 0) }
        if s.phase == .paused {
            return Clock(left: s.remainingMs.map { $0 / 1000 }, spent: ((s.pausedAt ?? now) - s.slotStartedAt) / 1000)
        }
        let spent = (now - s.slotStartedAt) / 1000
        return Clock(left: s.endsAt.map { max(0, ($0 - now) / 1000) }, spent: spent)
    }

    /// Seconds the current block has been running, for caps and the fortime / amrap clocks.
    static func blockElapsed(_ s: RunState, now: Double) -> Double {
        guard let id = current(s)?.blockId, let began = s.blockStart[id] else { return 0 }
        let end = s.phase == .paused ? (s.pausedAt ?? now) : now
        return max(0, (end - began) / 1000)
    }

    /// Seconds left on the current block's cap (amrap, capped fortime); nil for an uncapped block.
    static func capLeft(_ s: RunState, now: Double) -> Double? {
        guard let cap = current(s)?.capSec, s.phase != .ready, s.phase != .lead else { return nil }
        return max(0, cap - blockElapsed(s, now: now))
    }

    /// EMOM work: seconds left in the minute (or whatever the interval is) the set belongs to.
    static func minuteLeft(_ s: RunState, now: Double) -> Double? {
        guard let c = current(s), c.mode == .emom, c.kind == .work, let every = c.everySec,
              s.phase == .running || s.phase == .paused else { return nil }
        return max(0, Double(c.round + 1) * every - blockElapsed(s, now: now))
    }

    /// Move to slot i. Entering a new block going forward parks the timer in `ready` until the user
    /// taps Start block, so equipment changes do not eat the countdown. A loose step runs straight on.
    private static func enter(_ given: RunState, _ i: Int, _ now: Double) -> RunState {
        // Moving on from a paused timer takes the pause out first, so it never counts as work.
        var s = given.phase == .paused ? resume(given, now: now) : given
        if s.phase == .running, let cur = current(s), s.slots.indices.contains(i) ? s.slots[i].part != cur.part : true {
            s.partOut = (s.partOut ?? [:]).merging([cur.part: elapsed(s, now: now)]) { _, new in new }
        }
        if i >= s.slots.count {
            s.i = i; s.phase = .done; s.endsAt = nil; s.endedAt = now
            return s
        }
        if i > s.i, let drop = restBeforeDrop(s, i) { return enter(s, drop, now) }
        let slot = s.slots[i]
        // Only a block waits at a gate: a gate before each loose step was a tap for nothing.
        if i > 0, i > s.i, slot.part != s.slots[i - 1].part, slot.blockId != nil {
            s.i = i; s.phase = .ready; s.slotStartedAt = now; s.endsAt = nil; s.remainingMs = nil
            return s
        }
        return activate(s, i, now)
    }

    /// A swap drops the plan's loads (they were for the planned exercise) but keeps its reps and the
    /// set's type.
    static func keptOnSwap(_ plan: SetPlan?) -> SetPlan? {
        guard let plan, plan.reps != nil || plan.type != nil else { return nil }
        return SetPlan(reps: plan.reps, type: plan.type)
    }

    /// The type of the set at slot idx: changed on the grid, else the plan's, else normal.
    static func typeAt(_ s: RunState, _ idx: Int) -> SetType {
        guard s.slots.indices.contains(idx) else { return .normal }
        let sl = s.slots[idx]
        return s.actuals[sl.id]?.type ?? sl.plan?.type ?? .normal
    }

    /// A drop set follows the set before it with no rest (Hevy's rule): when slot i is a rest in a
    /// block and the next set of that block is a drop set, the index of that set; else nil.
    private static func restBeforeDrop(_ s: RunState, _ i: Int) -> Int? {
        let sl = s.slots[i]
        guard sl.kind == .rest, !sl.untilBoundary, let block = sl.blockId, sl.mode == .rounds else { return nil }
        var j = i
        while j < s.slots.count, s.slots[j].kind == .rest, s.slots[j].blockId == block { j += 1 }
        guard j < s.slots.count, s.slots[j].blockId == block, s.slots[j].kind == .work, typeAt(s, j) == .drop else { return nil }
        return j
    }

    /// Mark a set warm-up, normal, drop or to failure, from its row. Any set, done or not: the type
    /// is a label, not a number to lock.
    static func setTypeAt(_ s: RunState, slotId: String, type: SetType) -> RunState {
        guard let idx = s.slots.firstIndex(where: { $0.id == slotId }), s.slots[idx].kind == .work else { return s }
        var s = s
        var a = s.actuals[slotId] ?? Actual()
        a.type = type
        s.actuals[slotId] = a
        return s
    }

    /// Start the block the timer is parked on.
    static func startBlock(_ s: RunState, now: Double) -> RunState {
        s.phase == .ready ? activate(s, s.i, now) : s
    }

    private static func activate(_ s: RunState, _ i: Int, _ now: Double) -> RunState {
        var s = s
        let slot = s.slots[i]
        if s.partAt?[slot.part] == nil { s.partAt = (s.partAt ?? [:]).merging([slot.part: elapsed(s, now: now)]) { _, new in new } }
        if let id = slot.blockId, s.blockStart[id] == nil { s.blockStart[id] = now }

        var seconds = slot.seconds
        if slot.untilBoundary, let id = slot.blockId, let every = slot.everySec, let began = s.blockStart[id] {
            // The wait ends on its own minute's boundary. A minute that overran has none left: the
            // next minute starts at once and catches up, rather than the block quietly growing a minute.
            let into = (now - began) / 1000
            let left = Double(slot.round + 1) * every - into
            if left <= 0 {
                s.i = i
                return enter(s, i + 1, now)
            }
            seconds = left
        }
        // A capped block that has run out: skip its remaining slots.
        if let cap = slot.capSec, let id = slot.blockId, let began = s.blockStart[id] {
            let into = (now - began) / 1000
            if into >= cap {
                var j = i
                while j < s.slots.count, s.slots[j].blockId == id { j += 1 }
                return enter(s, j, now)
            }
        }
        s.i = i
        s.phase = .running
        s.slotStartedAt = now
        s.endsAt = seconds.map { now + $0 * 1000 }
        s.remainingMs = nil
        return s
    }

    /// Advance past the current slot: Done, countdown finished, or skip.
    static func advance(_ given: RunState, now: Double, skipped: Bool = false) -> RunState {
        if given.phase == .done { return given }
        // Done on a paused timer: the pause comes out first, and a paused lead-in is still a lead-in.
        var s = given.phase == .paused ? resume(given, now: now) : given
        if s.phase == .lead { return enter(s, 0, now) }
        if s.phase == .ready {
            let sameParts = s.i + 1 < s.slots.count && s.slots[s.i + 1].part == s.slots[s.i].part
            return activate(s, sameParts ? s.i + 1 : s.i, now)
        }
        if let c = current(s), !skipped {
            var a = s.actuals[c.id] ?? Actual()
            if let worked = workedSeconds(s, c, now) { a.seconds = worked }
            a.doneAt = now
            a.at = elapsed(s, now: now).rounded()
            s.actuals[c.id] = a
            if let id = c.blockId, c.kind == .work { s.blockDone[id, default: 0] += 1 }
        }
        if let c = current(s) { s = extendAmrap(s, c) }
        return enter(s, s.i + 1, now)
    }

    /// The work a set's time says something about: a countdown (a plank, a 40 s interval), a max
    /// effort, a distance or a calorie count. A set of reps is left out — its time is mostly the
    /// rest before the tick — and so is a follow-along video segment.
    static func timesWork(_ sl: Slot) -> Bool {
        guard sl.kind == .work, let e = sl.exercise, e.forMode != .segment else { return false }
        return sl.seconds != nil || e.forMode == .max || e.forMode == .meters || e.forMode == .calories
    }

    /// Seconds spent on the running slot, pauses out: for a countdown, as long as it ran — the
    /// whole interval when it ran out, less when it was ended early. Nil for work whose time says
    /// nothing, and for a set done the moment it began (ticked straight after its rest).
    private static func workedSeconds(_ s: RunState, _ c: Slot, _ now: Double) -> Double? {
        guard timesWork(c), s.phase == .running else { return nil }
        let spent = max(0, (now - s.slotStartedAt) / 1000)
        let sec = (c.seconds.map { min($0, spent) } ?? spent).rounded()
        return sec > 0 ? sec : nil
    }

    /// Leaving the last expanded round of a capped amrap before its cap: add one more round (and
    /// the rest before it), copied from the round just run so drops and swaps carry.
    private static func extendAmrap(_ s: RunState, _ c: Slot) -> RunState {
        guard c.mode == .amrap, c.capSec != nil, let block = c.blockId, next(s)?.blockId != block else { return s }
        let round = c.round + 1
        let rounds = max(c.rounds, round + 1)
        let betweenId = "\(block):between"
        func split(_ id: String) -> (base: Substring, serial: Int) {
            guard let hash = id.lastIndex(of: "#") else { return (Substring(id), -1) }
            return (id[..<hash], Int(id[id.index(after: hash)...]) ?? -1)
        }
        var n = s.slots.reduce(-1) { max($0, split($1.id).serial) } + 1
        func copy(_ sl: Slot, round: Int) -> Slot {
            var sl = sl
            sl.id = "\(split(sl.id).base)#\(n)"
            n += 1
            sl.round = round
            sl.rounds = rounds
            return sl
        }
        var added: [Slot] = []
        if let between = s.slots.first(where: { $0.blockId == block && $0.step.id == betweenId }) {
            added.append(copy(between, round: c.round))
        }
        for sl in s.slots where sl.blockId == block && sl.round == c.round && sl.step.id != betweenId {
            added.append(copy(sl, round: round))
        }
        var s = s
        s.slots.insert(contentsOf: added, at: s.i + 1)
        return s
    }

    /// Countdown expiry check; call from the tick.
    static func tick(_ s: RunState, now: Double) -> RunState {
        if s.phase == .lead, let end = s.endsAt, now >= end { return enter(s, 0, now) }
        if s.phase == .running, let end = s.endsAt, now >= end { return advance(s, now: now) }
        if s.phase == .running, let c = current(s), let cap = c.capSec, let id = c.blockId, let began = s.blockStart[id],
           (now - began) / 1000 >= cap {
            var j = s.i
            while j < s.slots.count, s.slots[j].blockId == id { j += 1 }
            return enter(s, j, now)
        }
        return s
    }

    static func pause(_ s: RunState, now: Double) -> RunState {
        guard s.phase == .running || s.phase == .lead else { return s }
        var s = s
        s.pausedFrom = s.phase
        s.phase = .paused
        s.pausedAt = now
        s.remainingMs = s.endsAt.map { max(0, $0 - now) }
        return s
    }

    static func resume(_ s: RunState, now: Double) -> RunState {
        guard s.phase == .paused, let pausedAt = s.pausedAt else { return s }
        var s = s
        let gap = now - pausedAt
        // A run paused before pausedFrom was kept: the lead-in is the only pause before any block starts.
        let wasLead = s.pausedFrom.map { $0 == .lead } ?? (s.i == 0 && s.blockStart.isEmpty && s.remainingMs != nil && s.slotStartedAt == s.startedAt)
        s.phase = wasLead ? .lead : .running
        s.pausedAt = nil
        s.pausedFrom = nil
        s.pausedMs += gap
        s.slotStartedAt += gap
        if let block = current(s)?.blockId, let began = s.blockStart[block] { s.blockStart[block] = began + gap }
        s.endsAt = s.remainingMs.map { now + $0 }
        s.remainingMs = nil
        return s
    }

    /// Go back one slot, restarting its countdown. The step gone back to is no longer done until it
    /// is done again, so an AMRAP round is not counted twice.
    static func back(_ s: RunState, now: Double) -> RunState {
        guard s.i > 0, s.phase != .lead, s.phase != .done else { return s }
        let prev = s.slots[s.i - 1]
        // A capped block whose cap has passed is over: its set is not reopened, since the block
        // would be skipped at once and the next one started without its gate.
        if let cap = prev.capSec, let id = prev.blockId, let began = s.blockStart[id], id != current(s)?.blockId,
           (now - began) / 1000 >= cap { return s }
        var out = enter(prev.kind == .work ? reopenSet(s, slotId: prev.id) : s, s.i - 1, now)
        guard s.slots.indices.contains(s.i), prev.part < s.slots[s.i].part else { return out }
        // Back into the part before: it is open again and the part left has not begun, so a
        // for-time score counts the time since once, in the part gone back to.
        out.partOut = out.partOut?.filter { $0.key < prev.part }
        out.partAt = out.partAt?.filter { $0.key <= prev.part }
        for sl in out.slots where sl.part > prev.part {
            if let id = sl.blockId { out.blockStart[id] = nil }
        }
        return out
    }

    /// Lengthen (or, with a negative `by`, shorten) the rest that is counting down, running or
    /// paused: the timer's −15 s / +15 s and the Lock Screen's +15 s. The slot's length moves with
    /// it, so the ring and the overall progress stay true. A rest shortened past now ends on the
    /// next tick. A work slot, a user-paced step and an EMOM's wait are left alone.
    static func extendRest(_ s: RunState, now: Double, by deltaSec: Double) -> RunState {
        guard let c = current(s), c.kind == .rest, !c.untilBoundary, let seconds = c.seconds else { return s }
        let left: Double
        if s.phase == .running, let end = s.endsAt { left = end - now }
        else if s.phase == .paused, let remaining = s.remainingMs { left = remaining }
        else { return s }
        let nextLeft = max(0, left + deltaSec * 1000)
        var s = s
        s.slots[s.i].seconds = max(0, seconds + (nextLeft - left) / 1000)
        if s.phase == .running { s.endsAt = now + nextLeft } else { s.remainingMs = nextLeft }
        return s
    }

    // MARK: - Adjustments

    /// Change the load or speed of the current work step; logged with the time into the slot.
    static func adjust(_ s: RunState, now: Double, target: Double) -> RunState {
        guard let c = current(s), c.kind == .work else { return s }
        var s = s
        var a = s.actuals[c.id] ?? Actual()
        a.target = target
        a.changes.append(Change(atSec: ((now - s.slotStartedAt) / 1000).rounded(), target: target))
        s.actuals[c.id] = a
        return s
    }

    static func adjustIncline(_ s: RunState, incline: Double) -> RunState {
        guard let c = current(s), c.kind == .work else { return s }
        var s = s
        var a = s.actuals[c.id] ?? Actual()
        a.incline = incline
        s.actuals[c.id] = a
        return s
    }

    /// The first slot of `stepId` at or after the cursor.
    private static func firstUpcoming(_ s: RunState, _ stepId: String) -> Int? {
        s.slots.indices.first { $0 >= s.i && s.slots[$0].step.id == stepId && s.slots[$0].kind == .work }
    }

    /// Change a step that has not come round yet, from the overview. The load lands on the step's
    /// first slot from here on, and `effectiveTarget`'s backward scan carries it to every later
    /// round — so setting the bench from the overview at block one holds when block three arrives.
    static func adjustStep(_ s: RunState, stepId: String, target: Double) -> RunState {
        guard let idx = firstUpcoming(s, stepId) else { return s }
        var s = s
        let id = s.slots[idx].id
        var a = s.actuals[id] ?? Actual()
        a.target = target
        a.changes.append(Change(atSec: 0, target: target))
        s.actuals[id] = a
        return s
    }

    static func adjustStepIncline(_ s: RunState, stepId: String, incline: Double) -> RunState {
        guard let idx = firstUpcoming(s, stepId) else { return s }
        var s = s
        let id = s.slots[idx].id
        var a = s.actuals[id] ?? Actual()
        a.incline = incline
        s.actuals[id] = a
        return s
    }

    static func setReps(_ s: RunState, reps: Double) -> RunState {
        guard let c = current(s), c.kind == .work else { return s }
        var s = s
        var a = s.actuals[c.id] ?? Actual()
        a.reps = reps
        s.actuals[c.id] = a
        return s
    }

    /// The metres or calories done on the running distance or calorie step, when not what the plan said.
    static func setAmount(_ s: RunState, value: Double) -> RunState {
        guard let c = current(s) else { return s }
        return setAmountAt(s, slotId: c.id, value: value)
    }

    enum Amount: String, Sendable { case meters, calories }

    /// Which field a step's amount goes in: metres or calories for a step done for either, or for a
    /// rower, ski erg or bike on the clock (the machine counts what you did); nil for other work.
    static func amountField(_ sl: Slot?) -> Amount? {
        guard let sl, sl.kind == .work, let e = sl.exercise else { return nil }
        if e.forMode == .meters { return .meters }
        if e.forMode == .calories { return .calories }
        switch Measure.of(e.exercise.unit) {
        case .meters: return .meters
        case .calories: return .calories
        default: return nil
        }
    }

    /// What a distance or calorie set did: changed on the card or the grid, else the plan's distance
    /// or calories. A timed piece on a machine has no plan for it, so only what was entered.
    static func amountAt(_ s: RunState, _ sl: Slot) -> Double? {
        guard let f = amountField(sl), let e = sl.exercise else { return nil }
        let a = s.actuals[sl.id]
        let set = f == .meters ? a?.meters : a?.calories
        let planned = (f == .meters && e.forMode == .meters) || (f == .calories && e.forMode == .calories)
        return set ?? (planned ? e.forValue : nil)
    }

    // MARK: - The set grid

    /// Metres or calories for one set from its row. A done set is locked like its reps.
    static func setAmountAt(_ s: RunState, slotId: String, value: Double) -> RunState {
        guard let idx = s.slots.firstIndex(where: { $0.id == slotId }), let f = amountField(s.slots[idx]),
              s.actuals[slotId]?.doneAt == nil else { return s }
        var s = s
        var a = s.actuals[slotId] ?? Actual()
        if f == .meters { a.meters = value } else { a.calories = value }
        s.actuals[slotId] = a
        return s
    }

    /// Change the load of one set from its row: the running set as `adjust` does, a set still to
    /// come as if set ahead, a done set only after it has been un-ticked.
    static func adjustAt(_ s: RunState, now: Double, slotId: String, target: Double) -> RunState {
        guard let idx = s.slots.firstIndex(where: { $0.id == slotId }), s.slots[idx].kind == .work,
              s.actuals[slotId]?.doneAt == nil else { return s }
        if idx == s.i { return adjust(s, now: now, target: target) }
        var s = s
        var a = s.actuals[slotId] ?? Actual()
        a.target = target
        a.changes.append(Change(atSec: 0, target: target))
        s.actuals[slotId] = a
        return s
    }

    /// Reps for one set from its row. A done set is locked like its load.
    static func setRepsAt(_ s: RunState, slotId: String, reps: Double) -> RunState {
        guard let idx = s.slots.firstIndex(where: { $0.id == slotId }), s.slots[idx].kind == .work,
              s.actuals[slotId]?.doneAt == nil else { return s }
        var s = s
        var a = s.actuals[slotId] ?? Actual()
        a.reps = reps
        s.actuals[slotId] = a
        return s
    }

    /// The tick on a set row. The running set is Done (advance). The set after a rest ends the rest
    /// early and is done in the same tap — people start before the rest runs out. A set passed
    /// without a tick (skipped, or un-ticked to fix its weight) is logged where it is and the
    /// cursor stays put.
    static func completeSet(_ s: RunState, now: Double, slotId: String) -> RunState {
        guard let idx = s.slots.firstIndex(where: { $0.id == slotId }), s.slots[idx].kind == .work,
              s.actuals[slotId]?.doneAt == nil else { return s }
        let live = s.phase == .running || s.phase == .paused
        if !live, idx >= s.i { return s }
        if idx == s.i { return advance(s, now: now) }
        if idx > s.i, s.slots[s.i..<idx].allSatisfy({ $0.kind == .rest && $0.blockId == s.slots[idx].blockId }) {
            var st = s
            while st.i < idx { st = advance(st, now: now, skipped: true) }
            return st.i == idx ? advance(st, now: now) : st
        }
        guard idx < s.i else { return s }
        var s = s
        var a = s.actuals[slotId] ?? Actual()
        a.doneAt = now
        a.at = elapsed(s, now: now).rounded()
        s.actuals[slotId] = a
        if let block = s.slots[idx].blockId { s.blockDone[block, default: 0] += 1 }
        return s
    }

    /// Un-tick a done set so its weight and reps can be put right. It is not logged until ticked again.
    static func reopenSet(_ s: RunState, slotId: String) -> RunState {
        guard let idx = s.slots.firstIndex(where: { $0.id == slotId }), s.actuals[slotId]?.doneAt != nil else { return s }
        var s = s
        s.actuals[slotId]?.doneAt = nil
        s.actuals[slotId]?.at = nil
        s.actuals[slotId]?.seconds = nil
        if let block = s.slots[idx].blockId { s.blockDone[block] = max(0, (s.blockDone[block] ?? 0) - 1) }
        return s
    }

    /// Last time's numbers into a set that is not done yet: its load and its reps, either or both.
    static func fillSet(_ s: RunState, now: Double, slotId: String, with set: SetResult) -> RunState {
        var st = s
        if let load = set.load { st = adjustAt(st, now: now, slotId: slotId, target: load) }
        if let reps = set.reps { st = setRepsAt(st, slotId: slotId, reps: reps) }
        if let amount = set.meters ?? set.calories { st = setAmountAt(st, slotId: slotId, value: amount) }
        return st
    }

    /// A set whose reps the plan leaves open — a range (8–12), a max, or reps-plus — in a block that
    /// is one exercise done for sets.
    private static func openReps(_ s: RunState, _ sl: Slot) -> Bool {
        guard sl.kind == .work, let e = sl.exercise, sl.plan?.reps == nil, let block = sl.blockId else { return false }
        guard e.forMax != nil || e.forMode == .max || e.forMode == .amrap else { return false }
        return s.slots.allSatisfy { $0.blockId != block || $0.kind != .work || $0.step.id == sl.step.id }
    }

    /// Fill the reps of every open set still to come from last time's matching set (`last` gets the
    /// step and the set's round), so the grid starts on what was done rather than on the bottom of
    /// the range. A set with reps already set is left alone.
    static func prefillReps(_ s: RunState, last: (ExerciseStep, Int) -> Double?) -> RunState {
        var s = s
        for sl in s.slots where openReps(s, sl) {
            guard let e = sl.exercise else { continue }
            let a = s.actuals[sl.id]
            if a?.doneAt != nil || a?.reps != nil { continue }
            guard let reps = last(e, sl.round) else { continue }
            var next = a ?? Actual()
            next.reps = reps
            s.actuals[sl.id] = next
        }
        return s
    }

    /// Drop a step for the rest of the session: remove every remaining slot of it.
    static func drop(_ s: RunState, now: Double, stepId: String) -> RunState {
        let c = current(s)
        // Read the cursor before mutating: `s.i` inside a closure that is assigning `s.slots` is a
        // simultaneous access to the same value, which traps under exclusivity checking.
        let cursor = s.i
        var s = s
        s.slots = s.slots.enumerated().filter { idx, sl in idx < cursor || sl.step.id != stepId }.map(\.element)
        s.dropped.append(stepId)
        return c?.step.id == stepId ? enter(s, s.i, now) : s
    }

    /// Swap the exercise of a step for another, from the current slot to the end of the session.
    /// The machine Nick planned for is taken, so the session carries on with what is free — rounds
    /// already done keep the exercise they were done with.
    static func swap(_ s: RunState, now: Double, stepId: String, to: ExerciseRef, target: Double?) -> RunState {
        let c = current(s)
        let cursor = s.i
        var s = s
        s.slots = s.slots.enumerated().map { idx, sl in
            guard idx >= cursor, sl.step.id == stepId, case .exercise(var e) = sl.step else { return sl }
            e.exercise = to
            e.target = target
            var sl = sl
            sl.step = .exercise(e)
            // The plan's loads were for the planned exercise; the swap's target stands in for them.
            sl.plan = Runner.keptOnSwap(sl.plan)
            return sl
        }
        return c?.step.id == stepId ? enter(s, s.i, now) : s
    }

    /// Re-plan the session around an edited runsheet (specs/unified-editing.md). What is done or
    /// running stays exactly as it is, actuals included — the running block's later rounds too;
    /// every item after it is rebuilt from the edited sheet in the sheet's order, so the next
    /// block's rounds, rest, durations and order can change mid-session. Parked at a block gate,
    /// the parked block counts as still to come. Drops, swaps and loads set ahead carry into the
    /// rebuilt slots; an item already passed is never run again, wherever the edit moved it.
    /// How many slots an edit keeps as they are: everything done, and the running part to its end.
    static func keptCount(_ s: RunState) -> Int {
        if s.phase == .done { return s.slots.count }
        if s.phase == .ready { return s.i }
        if s.phase != .lead, let cur = current(s) {
            return s.slots.firstIndex { $0.part > cur.part } ?? s.slots.count
        }
        return 0
    }

    /// The top-level items an edit mid-session may not touch: done, or running now.
    static func passedItems(_ s: RunState) -> Set<String> {
        Set(s.slots.prefix(keptCount(s)).map { $0.blockId ?? $0.step.id })
    }

    static func replan(_ s: RunState, _ r: Runsheet, now: Double) -> RunState {
        if s.phase == .done { return s }
        let keep = keptCount(s)
        let kept = Array(s.slots.prefix(keep))
        let old = Array(s.slots.dropFirst(keep))
        func itemOf(_ sl: Slot) -> String { sl.blockId ?? sl.step.id }
        let passed = Set(kept.map(itemOf))
        // What the old tail knew that the sheet does not: swapped exercises and loads set ahead.
        var was: [String: ExerciseStep] = [:]
        var ahead: [String: Actual] = [:]
        for sl in old {
            if let e = sl.exercise, was[e.id] == nil { was[e.id] = e }
            if let a = s.actuals[sl.id], a.doneAt == nil, ahead[sl.step.id] == nil { ahead[sl.step.id] = a }
        }
        func split(_ id: String) -> (base: Substring, serial: Int) {
            guard let hash = id.lastIndex(of: "#") else { return (Substring(id), -1) }
            return (id[..<hash], Int(id[id.index(after: hash)...]) ?? -1)
        }
        var n = kept.reduce(-1) { max($0, split($1.id).serial) } + 1
        let base = (kept.last?.part ?? -1) + 1
        var partOf: [Int: Int] = [:]
        var actuals = s.actuals
        for sl in old { actuals[sl.id] = nil }
        var tail: [Slot] = []
        for var sl in expand(r, dropped: s.dropped) {
            if passed.contains(itemOf(sl)) { continue }
            if partOf[sl.part] == nil { partOf[sl.part] = base + partOf.count }
            sl.id = "\(split(sl.id).base)#\(n)"
            n += 1
            if case .exercise(var e) = sl.step, let w = was[e.id], w.exercise.key != e.exercise.key {
                e.exercise = w.exercise
                e.target = w.target
                sl.step = .exercise(e)
                sl.plan = Runner.keptOnSwap(sl.plan)
            }
            if let a = ahead[sl.step.id], !tail.contains(where: { $0.step.id == sl.step.id }) { actuals[sl.id] = a }
            sl.part = partOf[sl.part] ?? base
            tail.append(sl)
        }
        let parts = base + partOf.count
        var s = s
        s.slots = (kept + tail).map { slot in
            var slot = slot
            slot.parts = parts
            return slot
        }
        s.actuals = actuals
        return s.phase == .ready && tail.isEmpty ? enter(s, s.i, now) : s
    }

    static func finish(_ given: RunState, now: Double) -> RunState {
        // Finished while paused: the pause is not workout time.
        var s = given.phase == .paused ? resume(given, now: now) : given
        if s.phase == .running, let cur = current(s), s.partOut?[cur.part] == nil {
            s.partOut = (s.partOut ?? [:]).merging([cur.part: elapsed(s, now: now)]) { _, new in new }
        }
        s.phase = .done
        s.endedAt = now
        s.endsAt = nil
        return s
    }

    // MARK: - Effective values

    /// The load in force at slot `idx`: walking back through the rounds of the same step with the
    /// same exercise, the first adjustment or prescribed set load met, else the step's target. So an
    /// adjustment carries to later rounds until a round that prescribes its own load (a pyramid's
    /// next step), and that round's load carries on in turn. A swap starts afresh from its target.
    static func effectiveTarget(_ s: RunState, _ idx: Int) -> Double? {
        guard s.slots.indices.contains(idx) else { return nil }
        let slot = s.slots[idx]
        var j = idx
        while j >= 0 {
            let sl = s.slots[j]
            if sameWork(sl, slot), let t = s.actuals[sl.id]?.target ?? sl.plan?.load { return t }
            j -= 1
        }
        return slot.exercise?.target
    }

    private static func sameWork(_ a: Slot, _ b: Slot) -> Bool {
        a.step.id == b.step.id && a.exercise?.exercise.key == b.exercise?.exercise.key
    }

    static func effectiveIncline(_ s: RunState, _ idx: Int) -> Double? {
        guard s.slots.indices.contains(idx) else { return nil }
        let slot = s.slots[idx]
        var j = idx
        while j >= 0 {
            let sl = s.slots[j]
            if sameWork(sl, slot), let t = s.actuals[sl.id]?.incline { return t }
            j -= 1
        }
        return slot.exercise?.incline
    }

    static func targetOf(_ s: RunState, _ slot: Slot) -> Double? {
        guard let idx = s.slots.firstIndex(where: { $0.id == slot.id }) else { return nil }
        return effectiveTarget(s, idx)
    }

    /// What a step will be lifted at when it next comes round, for the overview.
    static func plannedTarget(_ s: RunState, stepId: String) -> Double? {
        guard let idx = s.slots.indices.first(where: { $0 >= s.i && s.slots[$0].step.id == stepId }) else { return nil }
        return effectiveTarget(s, idx)
    }

    static func plannedIncline(_ s: RunState, stepId: String) -> Double? {
        guard let idx = s.slots.indices.first(where: { $0 >= s.i && s.slots[$0].step.id == stepId }) else { return nil }
        return effectiveIncline(s, idx)
    }

    static func slotEstimate(_ slot: Slot) -> Double { slot.seconds ?? estimate(slot.step) }

    /// Fraction of the whole session done, weighted by slot length.
    static func overall(_ s: RunState, now: Double) -> Double {
        let total = s.slots.reduce(0.0) { $0 + slotEstimate($1) }
        guard total > 0 else { return s.phase == .done ? 1 : 0 }
        if s.phase == .done { return 1 }
        var done = s.slots.prefix(s.i).reduce(0.0) { $0 + slotEstimate($1) }
        if let c = current(s), s.phase == .running || s.phase == .paused {
            let cl = clock(s, now: now)
            let est = slotEstimate(c)
            if let left = cl.left, let secs = c.seconds, secs > 0 {
                done += est * (1 - left / secs)
            } else {
                done += min(est, cl.spent)
            }
        }
        return min(1, done / total)
    }

    // MARK: - Result

    /// Build the result to log. Score follows the runsheet's score type: time = session elapsed,
    /// rounds = AMRAP rounds + reps / 1000.
    static func toResult(_ s: RunState, _ r: Runsheet, now: Double) -> SessionResult {
        let type = r.effectiveScore
        let durationSec = elapsed(s, now: now).rounded()
        var steps: [String: StepResult] = [:]
        var order: [String] = []
        // Success feeds the progression rules, so only a step under a rule has one: an unrelated
        // workout doing the same lift must not break its fail streak.
        func ruled(_ slot: Slot) -> Bool {
            (r.items.compactMap(\.asBlock).first { $0.id == slot.blockId }?.progression ?? r.progression) != nil
        }

        for (idx, slot) in s.slots.enumerated() {
            guard slot.kind == .work, let ex = slot.exercise, let a = s.actuals[slot.id], a.doneAt != nil else { continue }
            // A step swapped mid-session logs one row per exercise, so the rounds done before the
            // swap keep the exercise and load they were done with.
            let key = "\(ex.id)|\(ex.exercise.key)"
            let prev = steps[key]
            if prev == nil { order.append(key) }
            var reps = prev?.reps ?? []
            let done = a.reps ?? (ex.forMode == .reps ? ex.forValue : nil)
            let type = typeAt(s, idx)
            // `target` and `reps` are for readers from before per-set rows: a warm-up is not the
            // load worked at and its reps are not work, so they stay out of both.
            let warm = type == .warmup
            if let done, !warm { reps.append(done) }
            // An exercise counted in metres, seconds or calories has no load: its unit is the measure.
            let target = Measure.of(ex.exercise.unit) != nil ? nil : effectiveTarget(s, idx)
            let f = amountField(slot)
            let amount = amountAt(s, slot)
            var set = SetResult(reps: done, load: target, at: doneAtSec(s, a), type: type == .normal ? nil : type)
            set.seconds = a.seconds
            if f == .meters { set.meters = amount } else if f == .calories { set.calories = amount }
            // A working set short of its prescribed reps is a miss.
            let short = !warm && ex.forMode == .reps && (done.map { $0 < ex.forValue } ?? false)
            steps[key] = StepResult(
                stepId: ex.id,
                exerciseKey: ex.exercise.key,
                target: warm ? (prev?.target ?? target) : target,
                incline: effectiveIncline(s, idx),
                reps: reps.isEmpty ? nil : reps,
                success: ruled(slot) ? (prev?.success ?? true) && !short : nil,
                sets: (prev?.sets ?? []) + [set]
            )
        }

        // A set of the step left undone (skipped, never reached) is a missed session for the
        // progression rules, not a success. An AMRAP's rounds are a guess, so its undone ones say nothing.
        for (idx, slot) in s.slots.enumerated() {
            guard slot.kind == .work, let ex = slot.exercise, slot.mode != .amrap, s.actuals[slot.id]?.doneAt == nil,
                  typeAt(s, idx) != .warmup else { continue }
            if steps["\(ex.id)|\(ex.exercise.key)"]?.success != nil { steps["\(ex.id)|\(ex.exercise.key)"]?.success = false }
        }

        var score: Double?
        switch type {
        case .time:
            score = timeScore(s, now: now) ?? durationSec
        case .rounds:
            if let amrap = r.items.compactMap(\.asBlock).first(where: { $0.mode == .amrap }) {
                let done = s.blockDone[amrap.id] ?? 0
                let per = max(1, amrap.steps.filter { $0.asExercise != nil }.count)
                let rounds = done / per
                let extraSlots = done - rounds * per
                let extraReps = amrap.steps.compactMap(\.asExercise).prefix(extraSlots)
                    .reduce(0.0) { $0 + ($1.forMode == .reps ? $1.forValue : 0) }
                score = Double(rounds) + min(999, extraReps) / 1000
            }
        case .reps:
            score = order.compactMap { steps[$0] }.reduce(0.0) { $0 + ($1.reps?.reduce(0, +) ?? 0) }
        default:
            score = nil
        }

        var result = SessionResult(
            runsheetId: s.runsheetId,
            title: r.title,
            startedAt: ISO8601.string(Date(timeIntervalSince1970: s.startedAt / 1000)),
            endedAt: ISO8601.string(Date(timeIntervalSince1970: (s.endedAt ?? now) / 1000)),
            durationSec: durationSec,
            completed: s.phase == .done && s.i >= s.slots.count,
            score: score,
            steps: order.compactMap { steps[$0] }
        )
        let split = splits(s)
        result.splits = split.isEmpty ? nil : split
        return result
    }

    /// Seconds spent in the main parts — blocks and loose steps that are not a warm-up or cool-down —
    /// each from its start to when it was left: the lead-in and the time parked at a Start block
    /// gate fall between parts, and pauses are out of the session clock already. Nil when no main
    /// part has started.
    private static func timeScore(_ s: RunState, now: Double) -> Double? {
        let end = elapsed(s, now: now)
        var total: Double?
        for (part, at) in s.partAt ?? [:] {
            let role = s.slots.first { $0.part == part }?.role ?? .main
            guard role == .main else { continue }
            total = (total ?? 0) + max(0, (s.partOut?[part] ?? end) - at)
        }
        return total?.rounded()
    }

    /// Session time a slot was done at. A run saved before `at` was kept falls back to its clock
    /// time less every pause, which is right unless the pause came after it.
    private static func doneAtSec(_ s: RunState, _ a: Actual?) -> Double? {
        guard let a, let doneAt = a.doneAt else { return nil }
        return a.at ?? max(0, ((doneAt - s.startedAt - s.pausedMs) / 1000).rounded())
    }

    /// When each round of a circuit or AMRAP finished: the latest tick in the round. A block of one
    /// exercise done for sets is left out — its set times are on the sets. A round counts once it
    /// is closed (its last exercise done, or a later round begun); the first round that is not
    /// ends the list, so an AMRAP's half round at the cap is not a split.
    static func splits(_ s: RunState) -> [RoundSplit] {
        var blocks: [String] = []
        var rounds: [String: [Int: [Slot]]] = [:]
        for sl in s.slots where sl.kind == .work {
            guard let block = sl.blockId else { continue }
            if rounds[block] == nil { blocks.append(block) }
            rounds[block, default: [:]][sl.round, default: []].append(sl)
        }
        var out: [RoundSplit] = []
        for block in blocks {
            guard let byRound = rounds[block] else { continue }
            let all = byRound.values.flatMap { $0 }
            let circuit = all.contains { $0.mode == .amrap || $0.mode == .fortime } || byRound.values.contains { $0.count > 1 }
            guard circuit else { continue }
            let order = byRound.keys.sorted()
            var at: [Double] = []
            for (k, r) in order.enumerated() {
                let round = byRound[r] ?? []
                let times = round.compactMap { doneAtSec(s, s.actuals[$0.id]) }
                let later = order.dropFirst(k + 1).contains { byRound[$0]?.contains { s.actuals[$0.id]?.doneAt != nil } == true }
                let closed = round.last.map { s.actuals[$0.id]?.doneAt != nil } == true || later
                guard let latest = times.max(), closed else { break }
                at.append(latest)
            }
            let from = all.first.flatMap { s.partAt?[$0.part] }?.rounded()
            if !at.isEmpty { out.append(RoundSplit(blockId: block, at: at, from: from)) }
        }
        return out
    }
}
