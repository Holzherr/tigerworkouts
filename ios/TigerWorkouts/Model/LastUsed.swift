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
                let v = LastUsed(target: s.target, incline: s.incline)
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
