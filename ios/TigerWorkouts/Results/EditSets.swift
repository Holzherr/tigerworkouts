import Foundation

/// Putting a logged session right afterwards: one set's load, reps, time, distance, calories or
/// type. The row's `target` and `reps`, which older readers (next session's loads, the progression
/// rules) still read, are worked out again from the sets exactly as the timer writes them, so every
/// reader sees the edit. Ported from `src/features/results/edit-sets.ts`.
enum EditSets {
    /// `target` is the last working set's load and `reps` every working set's reps, as `toResult`
    /// writes them: a warm-up is not the load worked at, and its reps are not work.
    static func withSets(_ row: StepResult, _ sets: [SetResult]) -> StepResult {
        var out = row
        out.sets = sets
        let work = sets.filter { $0.type != .warmup }
        let reps = work.compactMap(\.reps)
        out.reps = reps.isEmpty ? nil : reps
        out.target = work.last(where: { $0.load != nil })?.load ?? sets.first(where: { $0.load != nil })?.load
        return out
    }

    /// What a step asks for, as the timer judges it: `reps` when every working set is the same
    /// number, `setReps` set by set for a per-set prescription, and `sets` how many working sets it
    /// plans (0 for an AMRAP, whose rounds are a guess). Warm-ups and drop sets are not working sets.
    struct StepPlan: Equatable, Sendable {
        var reps: Double?
        var setReps: [Double]?
        var sets: Int?
    }

    /// A working set, as the progression rules count them: not a warm-up, not a drop set.
    private static func working(_ xs: [SetResult]) -> [SetResult] { xs.filter { $0.type != .warmup && $0.type != .drop } }

    /// Whether a row under a progression rule is a success after an edit, the way the timer decides
    /// it: a working set under the plan's reps is a miss, and so is a working set short of the plan's
    /// count (skipped, or taken off). With a whole plan the answer is worked out afresh, so reps put
    /// back up clear a miss and a set added back clears a skipped one. Without one (a workout gone),
    /// fewer reps than logged is a miss and nothing else changes it.
    static func success(_ row: StepResult, before: [SetResult], after: [SetResult], plan: StepPlan?) -> Bool? {
        guard let was = row.success else { return nil }
        func short(_ xs: [SetResult]) -> Bool {
            working(xs).enumerated().contains { k, x in
                guard let reps = x.reps, let need = plan?.setReps.flatMap({ $0.indices.contains(k) ? $0[k] : nil }) ?? plan?.reps else { return false }
                return reps < need
            }
        }
        if let sets = plan?.sets { return working(after).count >= sets && !short(after) }
        if plan?.reps != nil {
            if short(after) { return false }
            return short(before) ? true : was
        }
        guard before.count == after.count else { return was }
        let fewer = zip(before, after).contains { b, a in
            guard a.type != .warmup, a.type != .drop, let x = a.reps, let y = b.reps else { return false }
            return x < y
        }
        return fewer ? false : was
    }

    /// `success` with the plan's reps alone, as older callers pass it.
    static func success(_ row: StepResult, before: [SetResult], after: [SetResult], plan: Double?) -> Bool? {
        success(row, before: before, after: after, plan: plan.map { StepPlan(reps: $0) })
    }

    /// The plan a logged row is judged against (see `StepPlan`); nil for a ladder (its rungs scale the
    /// reps), a step no longer in the workout, or no workout. A loose step runs once at its own reps,
    /// as the timer runs it. Ported from `plannedFor` in edit-sets.ts.
    static func plannedFor(_ r: Runsheet?, stepId: String) -> StepPlan? {
        guard let r else { return nil }
        for item in r.items {
            switch item {
            case .step(.exercise(let e)) where e.id == stepId:
                return StepPlan(reps: e.forMode == .reps ? e.forValue : nil, sets: 1)
            case .block(let b):
                guard let e = b.steps.compactMap(\.asExercise).first(where: { $0.id == stepId }) else { continue }
                let reps = e.forMode == .reps ? e.forValue : nil
                switch b.runMode {
                case .ladder: return nil
                case .amrap: return StepPlan(reps: reps, sets: 0)
                default: break
                }
                let times = b.steps.filter { $0.id == stepId }.count
                let rounds = max(1, b.repeatCount)
                guard b.runMode == .rounds, let sets = e.sets, !sets.isEmpty else { return StepPlan(reps: reps, sets: rounds * times) }
                // A per-set plan: the working sets in order, each with its own reps.
                var setReps: [Double] = []
                for ri in 0..<rounds {
                    let type = sets.indices.contains(ri) ? sets[ri].type : nil
                    if type == .warmup || type == .drop { continue }
                    setReps.append(e.plannedSet(ri).reps)
                }
                guard e.forMode == .reps else { return StepPlan(sets: setReps.count * times) }
                let same = !setReps.isEmpty && setReps.allSatisfy { $0 == setReps[0] }
                return same ? StepPlan(reps: setReps[0], sets: setReps.count * times) : StepPlan(setReps: setReps, sets: setReps.count * times)
            default:
                continue
            }
        }
        return nil
    }

    /// The reps a step prescribes for every set; nil for a per-set prescription, a ladder or a step
    /// that is not a set of reps.
    static func plannedReps(_ r: Runsheet?, stepId: String) -> Double? { plannedFor(r, stepId: stepId)?.reps }

    /// Change one set of one row (keyed as `StepResult.id`). A row from before per-set results gets
    /// its sets written out first. `plan` is what the step asks for (`plannedFor`).
    static func edit(_ result: SessionResult, row key: String, index: Int, plan: Double?, unit: String? = nil, _ change: (inout SetResult) -> Void) -> SessionResult {
        edit(result, row: key, index: index, plan: plan.map { StepPlan(reps: $0) }, unit: unit, change)
    }

    static func edit(_ result: SessionResult, row key: String, index: Int, plan: StepPlan? = nil, unit: String? = nil, _ change: (inout SetResult) -> Void) -> SessionResult {
        var r = result
        r.steps = r.steps.map { s in
            guard s.id == key else { return s }
            let before = Logbook.sets(of: s, unit: unit)
            var sets = before
            guard sets.indices.contains(index) else { return s }
            change(&sets[index])
            if sets[index].type == .normal { sets[index].type = nil }
            var out = withSets(s, sets)
            // Reps and type both decide a miss: a set marked a warm-up is one working set fewer.
            if sets[index].reps != before[index].reps || sets[index].type != before[index].type {
                out.success = success(s, before: before, after: sets, plan: plan)
            }
            return out
        }
        return r
    }

    /// One more set on a row: a copy of its last set, as a normal set with no time of day, for the
    /// set that was done but never ticked. A row from before per-set results gets its sets first.
    static func addSet(_ result: SessionResult, row key: String, plan: StepPlan? = nil) -> SessionResult {
        var r = result
        r.steps = r.steps.map { s in
            guard s.id == key else { return s }
            var sets = Logbook.sets(of: s)
            var copy = sets.last ?? SetResult(reps: nil, load: s.target)
            copy.at = nil
            copy.type = nil
            let before = sets
            sets.append(copy)
            return withSuccess(withSets(s, sets), s, before: before, plan: plan)
        }
        return r
    }

    /// Take a set off a row, for one ticked by mistake. The row goes with its last set.
    static func removeSet(_ result: SessionResult, row key: String, index: Int, plan: StepPlan? = nil) -> SessionResult {
        var r = result
        r.steps = r.steps.compactMap { s in
            guard s.id == key else { return s }
            var sets = Logbook.sets(of: s)
            guard sets.indices.contains(index) else { return s }
            let before = sets
            sets.remove(at: index)
            return sets.isEmpty ? nil : withSuccess(withSets(s, sets), s, before: before, plan: plan)
        }
        return r
    }

    /// A row's success after a set was added or taken off: worked out afresh against a whole plan,
    /// else left as it was.
    private static func withSuccess(_ out: StepResult, _ row: StepResult, before: [SetResult], plan: StepPlan?) -> StepResult {
        guard plan?.sets != nil else { return out }
        var out = out
        out.success = success(row, before: before, after: out.sets ?? [], plan: plan)
        return out
    }
}
