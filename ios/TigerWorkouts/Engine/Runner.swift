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
            let into = (now - began) / 1000
            let boundary = ((into / every).rounded(.down) + 1) * every
            seconds = max(0, boundary - into)
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
            a.at = elapsed(s, now: now).rounded()
            s.actuals[c.id] = a
            if let id = c.blockId, c.kind == .work { s.blockDone[id, default: 0] += 1 }
        }
        if let c = current(s) { s = extendAmrap(s, c) }
        return enter(s, s.i + 1, now)
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
        if let block = current(s)?.blockId, let began = s.blockStart[block] { s.blockStart[block] = began + gap }
        s.endsAt = s.remainingMs.map { now + $0 }
        s.remainingMs = nil
        return s
    }

    /// Go back one slot, restarting its countdown.
    static func back(_ s: RunState, now: Double) -> RunState {
        s.i > 0 ? enter(s, s.i - 1, now) : s
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

    // MARK: - The set grid

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
        if let block = s.slots[idx].blockId { s.blockDone[block] = max(0, (s.blockDone[block] ?? 0) - 1) }
        return s
    }

    /// Last time's numbers into a set that is not done yet: its load and its reps, either or both.
    static func fillSet(_ s: RunState, now: Double, slotId: String, with set: SetResult) -> RunState {
        var st = s
        if let load = set.load { st = adjustAt(st, now: now, slotId: slotId, target: load) }
        if let reps = set.reps { st = setRepsAt(st, slotId: slotId, reps: reps) }
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
            sl.plan = sl.plan?.reps.map { SetPlan(reps: $0) }
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
                sl.plan = sl.plan?.reps.map { SetPlan(reps: $0) }
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

    static func finish(_ s: RunState, now: Double) -> RunState {
        var s = s
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

        for (idx, slot) in s.slots.enumerated() {
            guard slot.kind == .work, let ex = slot.exercise, let a = s.actuals[slot.id], a.doneAt != nil else { continue }
            // A step swapped mid-session logs one row per exercise, so the rounds done before the
            // swap keep the exercise and load they were done with.
            let key = "\(ex.id)|\(ex.exercise.key)"
            let prev = steps[key]
            if prev == nil { order.append(key) }
            var reps = prev?.reps ?? []
            let done = a.reps ?? (ex.forMode == .reps ? ex.forValue : nil)
            if let done { reps.append(done) }
            let target = effectiveTarget(s, idx)
            steps[key] = StepResult(
                stepId: ex.id,
                exerciseKey: ex.exercise.key,
                target: target,
                incline: effectiveIncline(s, idx),
                reps: reps.isEmpty ? nil : reps,
                success: prev?.success ?? true,
                sets: (prev?.sets ?? []) + [SetResult(reps: done, load: target, at: doneAtSec(s, a))]
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
            if !at.isEmpty { out.append(RoundSplit(blockId: block, at: at)) }
        }
        return out
    }
}
