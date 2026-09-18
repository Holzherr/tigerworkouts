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
    /// Which top-level item this slot belongs to, 0-based, and how many there are.
    var part: Int
    var parts: Int

    var exercise: ExerciseStep? { step.asExercise }
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
    /// ms at which each block's first slot started, for caps and EMOM boundaries.
    var blockStart: [String: Double] = [:]
    /// Slots completed per block, for AMRAP scoring.
    var blockDone: [String: Int] = [:]
    var leadSec: Double = Runner.leadSec
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

        func push(_ step: Step, _ make: (inout Slot) -> Void) {
            guard !skip.contains(step.id) else { return }
            var slot = Slot(
                id: "\(step.id)#\(n)", kind: step.asExercise == nil ? .rest : .work, step: step,
                seconds: step.clockSeconds, mode: .loose, round: 0, rounds: 1, part: part, parts: parts
            )
            n += 1
            make(&slot)
            out.append(slot)
        }

        for item in r.items {
            if case .ref = item { continue }
            part += 1
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
                    round: round, rounds: rounds, part: part, parts: parts
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
                        untilBoundary: true, everySec: every, part: part, parts: parts
                    ))
                    n += 1
                }
                continue
            }

            let roundLen = b.steps.reduce(0.0) { $0 + estimate($1) }
            let rounds: Int = mode == .amrap
                ? max(1, Int(((b.timeCapSec ?? 600) / max(15, roundLen)).rounded(.up))) + 2
                : max(1, b.repeatCount)
            let cap = (mode == .amrap || mode == .fortime) ? b.timeCapSec : nil
            for ri in 0..<rounds {
                for s in b.steps {
                    push(s) {
                        $0.blockId = b.id; $0.blockName = b.name; $0.mode = slotMode
                        $0.round = ri; $0.rounds = rounds; $0.capSec = cap
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
        return max(0, (end - began - s.pausedMs) / 1000)
    }

    /// Move to slot i. Entering a new part going forward parks the timer in `ready` until the user
    /// taps Start block, so equipment changes do not eat the countdown.
    private static func enter(_ s: RunState, _ i: Int, _ now: Double) -> RunState {
        var s = s
        if i >= s.slots.count {
            s.i = i; s.phase = .done; s.endsAt = nil; s.endedAt = now
            return s
        }
        let slot = s.slots[i]
        if i > 0, i > s.i, slot.part != s.slots[i - 1].part {
            s.i = i; s.phase = .ready; s.slotStartedAt = now; s.endsAt = nil; s.remainingMs = nil
            return s
        }
        return activate(s, i, now)
    }

    /// Start the block the timer is parked on.
    static func startBlock(_ s: RunState, now: Double) -> RunState {
        s.phase == .ready ? activate(s, s.i, now) : s
    }

    private static func activate(_ s: RunState, _ i: Int, _ now: Double) -> RunState {
        var s = s
        let slot = s.slots[i]
        if let id = slot.blockId, s.blockStart[id] == nil { s.blockStart[id] = now }

        var seconds = slot.seconds
        if slot.untilBoundary, let id = slot.blockId, let every = slot.everySec, let began = s.blockStart[id] {
            let into = (now - began - s.pausedMs) / 1000
            let boundary = ((into / every).rounded(.down) + 1) * every
            seconds = max(0, boundary - into)
        }
        // A capped block that has run out: skip its remaining slots.
        if let cap = slot.capSec, let id = slot.blockId, let began = s.blockStart[id] {
            let into = (now - began - s.pausedMs) / 1000
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
    static func advance(_ s: RunState, now: Double, skipped: Bool = false) -> RunState {
        if s.phase == .done { return s }
        if s.phase == .lead { return enter(s, 0, now) }
        if s.phase == .ready {
            let sameParts = s.i + 1 < s.slots.count && s.slots[s.i + 1].part == s.slots[s.i].part
            return activate(s, sameParts ? s.i + 1 : s.i, now)
        }
        var s = s
        if let c = current(s), !skipped {
            var a = s.actuals[c.id] ?? Actual()
            a.doneAt = now
            s.actuals[c.id] = a
            if let id = c.blockId, c.kind == .work { s.blockDone[id, default: 0] += 1 }
        }
        return enter(s, s.i + 1, now)
    }

    /// Countdown expiry check; call from the tick.
    static func tick(_ s: RunState, now: Double) -> RunState {
        if s.phase == .lead, let end = s.endsAt, now >= end { return enter(s, 0, now) }
        if s.phase == .running, let end = s.endsAt, now >= end { return advance(s, now: now) }
        if s.phase == .running, let c = current(s), let cap = c.capSec, let id = c.blockId, let began = s.blockStart[id],
           (now - began - s.pausedMs) / 1000 >= cap {
            var j = s.i
            while j < s.slots.count, s.slots[j].blockId == id { j += 1 }
            return enter(s, j, now)
        }
        return s
    }

    static func pause(_ s: RunState, now: Double) -> RunState {
        guard s.phase == .running || s.phase == .lead else { return s }
        var s = s
        s.phase = .paused
        s.pausedAt = now
        s.remainingMs = s.endsAt.map { max(0, $0 - now) }
        return s
    }

    static func resume(_ s: RunState, now: Double) -> RunState {
        guard s.phase == .paused, let pausedAt = s.pausedAt else { return s }
        var s = s
        let gap = now - pausedAt
        let wasLead = s.i == 0 && s.blockStart.isEmpty && s.remainingMs != nil && s.slotStartedAt == s.startedAt
        s.phase = wasLead ? .lead : .running
        s.pausedAt = nil
        s.pausedMs += gap
        s.slotStartedAt += gap
        s.endsAt = s.remainingMs.map { now + $0 }
        s.remainingMs = nil
        return s
    }

    /// Go back one slot, restarting its countdown.
    static func back(_ s: RunState, now: Double) -> RunState {
        s.i > 0 ? enter(s, s.i - 1, now) : s
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

    static func finish(_ s: RunState, now: Double) -> RunState {
        var s = s
        s.phase = .done
        s.endedAt = now
        s.endsAt = nil
        return s
    }

    // MARK: - Effective values

    /// The load in force at slot `idx`: the latest adjustment made on any earlier round of the
    /// same step, else the plan.
    static func effectiveTarget(_ s: RunState, _ idx: Int) -> Double? {
        guard s.slots.indices.contains(idx) else { return nil }
        let slot = s.slots[idx]
        var j = idx
        while j >= 0 {
            let sl = s.slots[j]
            if sl.step.id == slot.step.id, let t = s.actuals[sl.id]?.target { return t }
            j -= 1
        }
        return slot.exercise?.target
    }

    static func effectiveIncline(_ s: RunState, _ idx: Int) -> Double? {
        guard s.slots.indices.contains(idx) else { return nil }
        let slot = s.slots[idx]
        var j = idx
        while j >= 0 {
            let sl = s.slots[j]
            if sl.step.id == slot.step.id, let t = s.actuals[sl.id]?.incline { return t }
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

        for (idx, slot) in s.slots.enumerated() {
            guard slot.kind == .work, let ex = slot.exercise, let a = s.actuals[slot.id], a.doneAt != nil else { continue }
            let key = ex.id
            let prev = steps[key]
            if prev == nil { order.append(key) }
            var reps = prev?.reps ?? []
            if let r = a.reps {
                reps.append(r)
            } else if ex.forMode == .reps {
                reps.append(ex.forValue)
            }
            steps[key] = StepResult(
                stepId: key,
                exerciseKey: ex.exercise.key,
                target: effectiveTarget(s, idx),
                incline: effectiveIncline(s, idx),
                reps: reps.isEmpty ? nil : reps,
                success: prev?.success ?? true
            )
        }

        var score: Double?
        switch type {
        case .time:
            score = durationSec
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

        return SessionResult(
            runsheetId: s.runsheetId,
            title: r.title,
            startedAt: ISO8601.string(Date(timeIntervalSince1970: s.startedAt / 1000)),
            endedAt: ISO8601.string(Date(timeIntervalSince1970: (s.endedAt ?? now) / 1000)),
            durationSec: durationSec,
            completed: s.phase == .done && s.i >= s.slots.count,
            score: score,
            steps: order.compactMap { steps[$0] }
        )
    }
}
