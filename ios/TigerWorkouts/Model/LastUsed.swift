import Foundation

struct LastUsed: Hashable, Sendable {
    var target: Double?
    var incline: Double?
}

/// Ported from `src/features/runsheet/last-used.ts`.
enum Settings {
    /// What you actually used, most recent first: keyed by step id for the exact step in this
    /// workout, and by exercise key so the same machine carries across workouts. Sessions are read
    /// newest first and the first hit wins, so an older session never overwrites a newer one.
    static func lastUsed(_ results: [SessionResult]) -> [String: LastUsed] {
        var out: [String: LastUsed] = [:]
        for r in results.sorted(by: { $0.startedAt > $1.startedAt }) {
            for s in r.steps {
                // A drop set at the end is not where the next session starts.
                let v = LastUsed(target: ProgressionRules.workingLoad(s), incline: s.incline)
                guard v.target != nil || v.incline != nil else { continue }
                if out["step:\(s.stepId)"] == nil { out["step:\(s.stepId)"] = v }
                if out["ex:\(s.exerciseKey)"] == nil { out["ex:\(s.exerciseKey)"] = v }
            }
        }
        return out
    }

    /// Start a workout on the numbers you finished on. The treadmill speed and incline, and the
    /// weight on the bench, are what you set last time rather than whatever the workout was
    /// written with — the thing you would otherwise dial in again at the start of every block.
    static func withLastUsed(_ r: Runsheet, results: [SessionResult]) -> Runsheet {
        guard !results.isEmpty else { return r }
        let m = lastUsed(results)
        guard !m.isEmpty else { return r }

        func seed(_ s: ExerciseStep) -> ExerciseStep {
            guard let hit = m["step:\(s.id)"] ?? m["ex:\(s.exercise.key)"] else { return s }
            var s = s
            // A relative load (% of a training max) is computed at run time; leave it alone.
            if s.target != nil, let t = hit.target { s.target = t }
            if let i = hit.incline { s.incline = i }
            return s
        }

        var out = r
        out.items = r.items.map { item in
            switch item {
            case .block(var b):
                b.steps = b.steps.map { if case .exercise(let e) = $0 { return .exercise(seed(e)) } else { return $0 } }
                return .block(b)
            case .step(.exercise(let e)):
                return .step(.exercise(seed(e)))
            default:
                return item
            }
        }
        return out
    }
}

/// "last time 57.5 × 8" on a step's row. Ported from `lastSet` / `lastTimeLabel` in
/// `src/features/runsheet/last-used.ts`.
enum LastTime {
    /// The set a row is judged by: the heaviest, then the most reps. Older results have no per-set
    /// rows, so their one load and best rep count stand in.
    static func topSet(_ s: StepResult) -> SetResult? {
        let sets = s.sets?.isEmpty == false ? s.sets! : [SetResult(reps: s.reps?.max(), load: s.target)]
        let best = sets.max { a, b in
            (a.load ?? 0, a.reps ?? 0) < (b.load ?? 0, b.reps ?? 0)
        }
        guard let best, best.load != nil || best.reps != nil else { return nil }
        return best
    }

    /// What this step was done at last time — the same step if it has history, else the same
    /// exercise in any workout. Newest session first.
    static func set(_ results: [SessionResult], for step: ExerciseStep) -> SetResult? {
        let newest = results.sorted { $0.startedAt > $1.startedAt }
        func find(_ match: (StepResult) -> Bool) -> SetResult? {
            for r in newest {
                if let hit = r.steps.first(where: { match($0) && topSet($0) != nil }) { return topSet(hit) }
            }
            return nil
        }
        return find { $0.stepId == step.id && $0.exerciseKey == step.exercise.key }
            ?? find { $0.exerciseKey == step.exercise.key }
    }

    static func label(_ set: SetResult?, for step: ExerciseStep) -> String? {
        guard let set else { return nil }
        switch (set.load, set.reps) {
        case let (load?, reps?): return "last time \(Format.number(load)) × \(Format.number(reps))"
        case let (load?, nil): return step.shortUnit.isEmpty ? "last time \(Format.number(load))" : "last time \(Format.number(load)) \(step.shortUnit)"
        case let (nil, reps?): return "last time \(Format.number(reps)) reps"
        default: return nil
        }
    }

    static func label(_ results: [SessionResult], for step: ExerciseStep) -> String? {
        label(set(results, for: step), for: step)
    }

    /// Every set of this step last time, in order — the same step if it has history, else the same
    /// exercise. For the set grid, where set 2 is shown against last time's set 2. Ported from
    /// `lastSets` in `last-used.ts`.
    static func sets(_ results: [SessionResult], for step: ExerciseStep) -> [SetResult]? {
        let newest = results.sorted { $0.startedAt > $1.startedAt }
        func find(_ match: (StepResult) -> Bool) -> [SetResult]? {
            for r in newest {
                if let hit = r.steps.first(where: { match($0) && $0.sets?.isEmpty == false }) { return hit.sets }
            }
            return nil
        }
        return find { $0.stepId == step.id && $0.exerciseKey == step.exercise.key }
            ?? find { $0.exerciseKey == step.exercise.key }
    }

    /// "last 57.5 × 8" under a set row.
    static func setLabel(_ set: SetResult?) -> String? {
        guard let set else { return nil }
        let parts = [set.load, set.reps].compactMap { $0 }.map(Format.number)
        return parts.isEmpty ? nil : "last " + parts.joined(separator: " × ")
    }
}
