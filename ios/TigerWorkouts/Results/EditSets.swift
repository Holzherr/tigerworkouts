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

    /// Whether a row under a progression rule is still a success after its reps changed: a working
    /// set under the plan's reps is a miss, and reps put back up to the plan clear a miss the short
    /// set made. Without a plan (a per-set prescription, a workout gone), fewer reps than logged is
    /// a miss.
    static func success(_ row: StepResult, before: [SetResult], after: [SetResult], plan: Double?) -> Bool? {
        guard let was = row.success else { return nil }
        if let plan {
            func short(_ xs: [SetResult]) -> Bool { xs.contains { $0.type != .warmup && ($0.reps.map { $0 < plan } ?? false) } }
            if short(after) { return false }
            return short(before) ? true : was
        }
        let fewer = zip(before, after).contains { b, a in
            guard a.type != .warmup, let x = a.reps, let y = b.reps else { return false }
            return x < y
        }
        return fewer ? false : was
    }

    /// The reps a step prescribes for every set, for `edit`; nil for a per-set prescription, a
    /// ladder (its rungs scale the reps) or a step that is not a set of reps.
    static func plannedReps(_ r: Runsheet?, stepId: String) -> Double? {
        guard let r else { return nil }
        for item in r.items {
            switch item {
            case .step(.exercise(let e)) where e.id == stepId:
                return e.forMode == .reps ? e.forValue : nil
            case .block(let b):
                guard let e = b.steps.compactMap(\.asExercise).first(where: { $0.id == stepId }) else { continue }
                if b.runMode == .ladder || (e.sets ?? []).contains(where: { $0.reps != nil }) { return nil }
                return e.forMode == .reps ? e.forValue : nil
            default:
                continue
            }
        }
        return nil
    }

    /// Change one set of one row (keyed as `StepResult.id`). A row from before per-set results gets
    /// its sets written out first. `plan` is the step's prescribed reps, when it prescribes one
    /// number for every set.
    static func edit(_ result: SessionResult, row key: String, index: Int, plan: Double? = nil, _ change: (inout SetResult) -> Void) -> SessionResult {
        var r = result
        r.steps = r.steps.map { s in
            guard s.id == key else { return s }
            let before = Logbook.sets(of: s)
            var sets = before
            guard sets.indices.contains(index) else { return s }
            change(&sets[index])
            if sets[index].type == .normal { sets[index].type = nil }
            var out = withSets(s, sets)
            if sets[index].reps != before[index].reps { out.success = success(s, before: before, after: sets, plan: plan) }
            return out
        }
        return r
    }
}
