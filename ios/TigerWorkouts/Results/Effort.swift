import Foundation

/// One set actually done: long enough to price in calories, loaded enough to count as tonnage.
struct WorkedSet: Hashable, Sendable {
    var name: String
    var group: ExerciseGroup?
    var seconds: Double
    var reps: Double
    var load: Double?
}

struct Effort: Hashable, Sendable {
    /// Seconds of actual work, rest excluded.
    var workSec: Double
    /// Sets completed across the session.
    var sets: Int
    /// kg moved: load × reps, summed. Zero for a session with no weights.
    var tonnage: Double
    var kcal: Int
    /// True when bodyweight is a guess, so the screen can say so.
    var estimatedWeight: Bool
}

struct Streak: Hashable, Sendable {
    /// Consecutive weeks, counting back from this one, with at least one session.
    var weeks: Int
    var thisWeek: Int
    var lastWeek: Int
    var total: Int
}

/// Ported from `src/features/results/effort.ts`.
enum EffortModel {
    /// Rough METs per kind of work. Calories from METs are an estimate and nothing more — without
    /// heart rate they are a function of time and bodyweight, so the number is a scale to beat
    /// rather than a measurement.
    private static let met: [ExerciseGroup: Double] = [
        .treadmill: 11, .run: 10, .walk: 6, .bike: 8, .rower: 8, .swim: 8,
        .kettlebell: 9, .barbell: 6, .dumbbell: 5, .body: 6, .core: 4, .band: 4, .gym: 6,
    ]
    private static let defaultMet: Double = 6
    static let defaultBodyweightKg: Double = 80

    static func effort(_ r: SessionResult, worked: [WorkedSet], bodyweightKg: Double?) -> Effort {
        let kg = bodyweightKg ?? defaultBodyweightKg
        let summed = worked.reduce(0.0) { $0 + $1.seconds }
        let kcal = worked.reduce(0.0) { total, w in
            total + (met[w.group ?? .body] ?? defaultMet) * 3.5 * kg / 200 / 60 * w.seconds
        }
        return Effort(
            workSec: summed > 0 ? summed : (r.durationSec ?? 0),
            sets: worked.count,
            tonnage: worked.reduce(0.0) { $0 + ($1.load ?? 0) * $1.reps },
            kcal: Int(kcal.rounded()),
            estimatedWeight: bodyweightKg == nil
        )
    }

    private static func startOfWeek(_ d: Date, calendar: Calendar = .iso8601Monday) -> Date {
        calendar.dateInterval(of: .weekOfYear, for: d)?.start ?? d
    }

    /// Sessions per week and how many weeks in a row you have trained, counting back from today.
    static func streak(_ results: [SessionResult], today: Date = Date()) -> Streak {
        let cal = Calendar.iso8601Monday
        let thisWeek = startOfWeek(today, calendar: cal)
        var counts: [Date: Int] = [:]
        for r in results {
            counts[startOfWeek(r.startedDate, calendar: cal), default: 0] += 1
        }
        var weeks = 0
        var w = thisWeek
        while let n = counts[w], n > 0 {
            weeks += 1
            guard let prev = cal.date(byAdding: .weekOfYear, value: -1, to: w) else { break }
            w = prev
        }
        let last = cal.date(byAdding: .weekOfYear, value: -1, to: thisWeek).flatMap { counts[$0] } ?? 0
        return Streak(weeks: weeks, thisWeek: counts[thisWeek] ?? 0, lastWeek: last, total: results.count)
    }

    /// The same exercise's load over time, newest last, for "is it going up".
    static func loadTrend(_ results: [SessionResult], exerciseKey: String) -> [(at: Date, load: Double)] {
        results
            .sorted { $0.startedAt < $1.startedAt }
            .compactMap { r in
                guard let s = r.steps.first(where: { $0.exerciseKey == exerciseKey && $0.target != nil }), let load = s.target else { return nil }
                return (r.startedDate, load)
            }
    }

    /// One entry per set actually done, from the logged steps plus the runsheet they came from.
    /// The runsheet supplies how long a set was and how many rounds; the log supplies the load.
    /// Without the runsheet it still works — a set is assumed, with the session's own average length.
    static func workedFrom(_ r: SessionResult, runsheet: Runsheet?, library: Library = .shared) -> [WorkedSet] {
        var found: [String: (step: ExerciseStep, rounds: Int)] = [:]
        for item in runsheet?.items ?? [] {
            if let b = item.asBlock {
                for s in b.steps {
                    if let e = s.asExercise { found[e.id] = (e, max(1, b.repeatCount)) }
                }
            } else if let e = item.asStep?.asExercise {
                found[e.id] = (e, 1)
            }
        }
        let fallback: Double = {
            guard let d = r.durationSec, !r.steps.isEmpty else { return 45 }
            return (d * 0.5 / Double(r.steps.count)).rounded()
        }()

        return r.steps.flatMap { s -> [WorkedSet] in
            let hit = found[s.stepId]
            let name = library.name(s.exerciseKey)
            let group = library.group(s.exerciseKey)
            let secs = hit.map { setSeconds($0.step) } ?? fallback
            let rounds = max(1, s.reps?.count ?? hit?.rounds ?? 1)
            return (0..<rounds).map { n in
                let reps = s.reps?[safe: n] ?? (hit?.step.forMode == .reps ? (hit?.step.forValue ?? 0) : 0)
                return WorkedSet(name: name, group: group, seconds: secs, reps: reps, load: s.target)
            }
        }
    }

    private static func setSeconds(_ s: ExerciseStep) -> Double {
        switch s.forMode {
        case .seconds: s.forValue
        case .minutes: s.forValue * 60
        default: 45
        }
    }
}

extension Calendar {
    /// Weeks start on Monday, the way the web app's streak counts them.
    static let iso8601Monday: Calendar = {
        var c = Calendar(identifier: .iso8601)
        c.firstWeekday = 2
        return c
    }()
}

extension Array {
    subscript(safe i: Int) -> Element? { indices.contains(i) ? self[i] : nil }
}
