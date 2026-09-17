import Foundation

/// Timing and labels, ported from the same section of `model.ts`. Pure functions on the model so
/// the engine, the cards and the stats all agree on how long a thing takes.

extension Step {
    /// Seconds a step takes on the timer. Reps have no clock; assume 3s per rep for estimates.
    var estimatedSeconds: Double {
        switch self {
        case .rest(let r): return r.seconds
        case .exercise(let s):
            switch s.forMode {
            case .seconds: return s.forValue
            case .minutes: return s.forValue * 60
            case .meters: return s.forValue * 0.3 // ~2 min per 400 m
            case .calories: return s.forValue * 4
            case .max: return 60
            case .segment:
                let len = max(0, (s.endSeconds ?? s.startSeconds ?? 0) - (s.startSeconds ?? 0))
                return len == 0 ? 60 : len
            case .reps, .amrap: return s.forValue * 3 * ((s.perSide ?? false) ? 2 : 1)
            }
        }
    }

    /// The countdown length, or nil when the step is user-paced and ends on Done.
    var clockSeconds: Double? {
        switch self {
        case .rest(let r): return r.seconds
        case .exercise(let s):
            switch s.forMode {
            case .seconds: return s.forValue
            case .minutes: return s.forValue * 60
            case .segment:
                guard let end = s.endSeconds, let start = s.startSeconds else { return nil }
                return end - start
            default: return nil
            }
        }
    }
}

extension Block {
    /// A ladder block's steps for one rung: reps replaced by the rung value, rests untouched.
    func rungSteps(_ rung: Double) -> [Step] {
        steps.map { st in
            guard case .exercise(var e) = st, e.forMode == .reps, !(e.ladderFixed ?? false) else { return st }
            e.forValue = (rung * (e.ladderFactor ?? 1)).rounded()
            return .exercise(e)
        }
    }

    var roundSeconds: Double { steps.reduce(0) { $0 + $1.estimatedSeconds } }

    var estimatedSeconds: Double {
        let between = (restBetweenSec ?? 0) * Double(max(0, repeatCount - 1))
        switch runMode {
        case .amrap:
            return (timeCapSec ?? roundSeconds * Double(repeatCount)) + (restBetweenSec != nil ? between : 0)
        case .emom:
            return (everySec ?? 60) * Double(repeatCount)
        case .ladder:
            let rungs = ladder ?? []
            let work = rungs.reduce(0.0) { $0 + rungSteps($1).reduce(0) { $0 + $1.estimatedSeconds } }
            return work + (restBetweenSec ?? 0) * Double(max(0, rungs.count - 1))
        case .rounds, .fortime:
            let est = roundSeconds * Double(repeatCount) + between
            if runMode == .fortime, let cap = timeCapSec { return min(est, cap) }
            return est
        }
    }

    /// "×8", "AMRAP 20:00", "EMOM 10", "5 rounds for time", "21-15-9"
    var modeLabel: String {
        switch runMode {
        case .amrap: "AMRAP \(Int(((timeCapSec ?? 0) / 60).rounded())):00"
        case .emom: "EMOM \(repeatCount)"
        case .fortime: "\(repeatCount) round\(repeatCount == 1 ? "" : "s") for time"
        case .ladder: (ladder ?? []).map { Format.number($0) }.joined(separator: "-")
        case .rounds: "×\(repeatCount)"
        }
    }
}

extension Item {
    var estimatedSeconds: Double {
        switch self {
        case .block(let b): b.estimatedSeconds
        case .step(let s): s.estimatedSeconds
        case .ref: 0
        }
    }
}

extension Runsheet {
    var estimatedSeconds: Double {
        let est = items.reduce(0) { $0 + $1.estimatedSeconds }
        if let cap = timeCapSec { return min(est, cap) }
        return est
    }

    var minutes: Int { Int((estimatedSeconds / 60).rounded()) }

    /// Every exercise step in the sheet, blocks flattened.
    var exerciseSteps: [ExerciseStep] {
        items.flatMap { item -> [ExerciseStep] in
            switch item {
            case .block(let b): b.steps.compactMap(\.asExercise)
            case .step(let s): [s.asExercise].compactMap { $0 }
            case .ref: []
            }
        }
    }

    /// The score a runsheet is judged on: explicit, else from its main block's mode.
    var effectiveScore: ScoreType {
        if let score { return score }
        let mainBlocks = items.compactMap(\.asBlock).filter { ($0.role ?? .main) == .main }
        guard let b = mainBlocks.first else { return .none }
        if let s = b.score { return s }
        switch b.runMode {
        case .fortime, .ladder: return .time
        case .amrap: return .rounds
        default:
            let openEnded = b.steps.contains { step in
                guard let e = step.asExercise else { return false }
                return e.forMode == .max || e.forMode == .amrap
            }
            return openEnded ? .reps : .none
        }
    }
}

extension ExerciseStep {
    /// "30s", "12 reps each side", "max", "400 m"
    var forLabel: String {
        let n = forMax.map { "\(Format.number(forValue))–\(Format.number($0))" } ?? Format.number(forValue)
        let base: String
        switch forMode {
        case .max: base = "max"
        case .amrap: base = "\(Format.number(forValue))+ reps"
        case .segment: base = startSeconds.map { "from \(Format.clock($0))" } ?? "follow along"
        case .seconds: base = "\(n)s"
        case .minutes: base = "\(n) min"
        case .meters: base = "\(n) m"
        case .calories: base = "\(n) cal"
        case .reps: base = "\(n) reps"
        }
        return (perSide ?? false) ? "\(base) each side" : base
    }

    /// "43 kg", "1.5× BW", "65% TM", or empty for bodyweight.
    var loadLabel: String {
        if let f = loadFactor { return "\(Format.number(f))× BW" }
        if let p = targetPct { return "\(Format.number(p))% TM" }
        guard let t = target else { return "" }
        let unit = exercise.unit.replacingOccurrences(of: " per arm", with: "").replacingOccurrences(of: " per side", with: "")
        return unit.isEmpty ? Format.number(t) : "\(Format.number(t)) \(unit)"
    }

    var shortUnit: String {
        exercise.unit
            .replacingOccurrences(of: " per arm", with: "")
            .replacingOccurrences(of: " per side", with: "")
            .trimmingCharacters(in: .whitespaces)
    }
}

enum Format {
    /// 43 not 43.0, 14.5 not 14.500000.
    static func number(_ v: Double) -> String {
        v == v.rounded() ? String(Int(v)) : String(format: "%.1f", v)
    }

    /// 0:30, 10:00, 1:02:30
    static func clock(_ seconds: Double) -> String {
        let s = max(0, Int(seconds.rounded()))
        let h = s / 3600, m = (s % 3600) / 60, sec = s % 60
        return h > 0 ? String(format: "%d:%02d:%02d", h, m, sec) : String(format: "%d:%02d", m, sec)
    }

    /// "24 min", "1h 05"
    static func duration(_ seconds: Double) -> String {
        let m = Int((seconds / 60).rounded())
        return m < 60 ? "\(m) min" : String(format: "%dh %02d", m / 60, m % 60)
    }
}
