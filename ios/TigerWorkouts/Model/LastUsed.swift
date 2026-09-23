import Foundation

struct LastUsed: Hashable, Sendable {
    var target: Double?
    var incline: Double?
    /// When the session that used it started.
    var at: String = ""
}

/// Ported from `src/features/runsheet/last-used.ts`.
enum Settings {
    /// What you actually used, most recent first: keyed by workout and step for the exact step
    /// (`step:<workout>:<step>` — catalogue step ids like "s1" repeat across workouts), and by
    /// exercise key so the same machine carries across workouts. Sessions are read newest first
    /// and the first hit wins, so an older session never overwrites a newer one.
    static func lastUsed(_ results: [SessionResult]) -> [String: LastUsed] {
        var out: [String: LastUsed] = [:]
        for r in results.sorted(by: { $0.startedAt > $1.startedAt }) {
            for s in r.steps {
                let v = LastUsed(target: s.target, incline: s.incline, at: r.startedAt)
                guard v.target != nil || v.incline != nil else { continue }
                let exact = "step:\(r.runsheetId):\(s.stepId)"
                if out[exact] == nil { out[exact] = v }
                if out["ex:\(s.exerciseKey)"] == nil { out["ex:\(s.exerciseKey)"] = v }
            }
        }
        return out
    }

    /// Start a workout on your numbers: your saved settings for it, and the treadmill speed,
    /// incline and weight you finished on — rather than whatever the workout was written with.
    ///
    /// Where weight, speed and incline start, most specific first:
    ///   1. this step in a session of this workout done *after* you saved a setting for it
    ///   2. your saved setting for this step
    ///   3. this step in an older session of this workout
    ///   4. the same exercise in any other workout, most recent
    ///   5. the workout as written
    static func withLastUsed(_ r: Runsheet, results: [SessionResult], settings ws: WorkoutSettings? = nil) -> Runsheet {
        let m = results.isEmpty ? [:] : lastUsed(results)
        guard !m.isEmpty || ws?.hasAny == true else { return r }
        let runsheetId = r.key

        func later(_ a: String, _ b: String) -> Bool {
            (ISO8601.date(a) ?? .distantPast) > (ISO8601.date(b) ?? .distantPast)
        }

        func seed(_ s: ExerciseStep) -> ExerciseStep {
            let exact = m["step:\(runsheetId):\(s.id)"]
            let cross = m["ex:\(s.exercise.key)"]
            let set = ws?.steps[s.id]
            func pick(_ f: KeyPath<LastUsed, Double?>, own: Double?, written: Double?) -> Double? {
                if let exact, let e = exact[keyPath: f], own == nil || later(exact.at, set?.at ?? "") { return e }
                if let own { return own }
                if let c = cross?[keyPath: f] { return c }
                return written
            }
            var s = s
            // A relative load (% of a training max) is computed at run time; leave it alone.
            if s.target != nil { s.target = pick(\.target, own: set?.target, written: s.target) }
            s.incline = pick(\.incline, own: set?.incline, written: s.incline)
            return s
        }

        // Reps, rests and rounds come from the settings alone; seed() then settles weight, speed and incline.
        var out = apply(r, ws)
        out.items = out.items.map { item in
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
