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

    /// Change one set of one row (keyed as `StepResult.id`). A row from before per-set results gets
    /// its sets written out first.
    static func edit(_ result: SessionResult, row key: String, index: Int, _ change: (inout SetResult) -> Void) -> SessionResult {
        var r = result
        r.steps = r.steps.map { s in
            guard s.id == key else { return s }
            var sets = Logbook.sets(of: s)
            guard sets.indices.contains(index) else { return s }
            change(&sets[index])
            if sets[index].type == .normal { sets[index].type = nil }
            return withSets(s, sets)
        }
        return r
    }
}
