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
            // A cap of 0 is no cap, as in the runner and on the web.
            if runMode == .fortime, let cap = timeCapSec, cap > 0 { return min(est, cap) }
            return est
        }
    }

    /// "×8", "AMRAP 20:00", "EMOM 10", "5 rounds for time", "21-15-9"
    var modeLabel: String {
        switch runMode {
        // A block with no time set reads AMRAP, not AMRAP 0:00; 90 s reads 1:30, as on the web.
        case .amrap: (timeCapSec ?? 0) > 0 ? "AMRAP \(Format.clock(timeCapSec ?? 0))" : "AMRAP"
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
        if let cap = timeCapSec, cap > 0 { return min(est, cap) }
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

    /// Whether the step carries a setting you dial in: a weight, or a machine's speed. An exercise
    /// whose unit is the measure of the work (a rower in metres, a plank in seconds, a bike in
    /// calories) or a bodyweight move has nothing to adjust — showing a stepper for it offered
    /// "Distance (m)" on a rowing machine. `hasLoad` in model.ts.
    var hasSetting: Bool {
        if Measure.of(exercise.unit) != nil { return false }
        if target != nil { return true }
        let u = shortUnit.lowercased()
        return u.hasPrefix("kg") || u.hasPrefix("lb") || u == "kph" || u == "mph"
    }

    /// What the setting is called: speed on a treadmill, load on a bar.
    var settingLabel: String {
        switch shortUnit.lowercased() {
        case "kph", "mph": "Speed"
        default: "Load"
        }
    }

    /// Asks for the reps done: done to a count (reps, reps-plus, max), or set to log them.
    var countsReps: Bool { forMode == .reps || forMode == .amrap || forMode == .max || log.contains(.reps) }

    /// The amounts the step records: first the one it is done for (the plan, changed if it went
    /// otherwise), then those its `log` asks for, metres before calories. Never from the exercise
    /// alone: a rower on the clock asks for metres only when the step says so. `amountsOf` in model.ts.
    var amountLogs: [StepLog] {
        let own: [StepLog] = forMode == .meters ? [.meters] : forMode == .calories ? [.calories] : []
        return own + [StepLog.meters, .calories].filter { !own.contains($0) && log.contains($0) }
    }
    /// The first of `amountLogs`: the one the step is done for, when it is.
    var amountLog: StepLog? { amountLogs.first }

    /// The target records it already: reps for a step done to a count, metres or calories for one
    /// done for either. A video segment records nothing.
    func targetRecords(_ c: StepLog) -> Bool {
        if forMode == .segment { return true }
        switch c {
        case .reps: return [.reps, .amrap, .max].contains(forMode)
        case .meters: return forMode == .meters
        case .calories: return forMode == .calories
        }
    }

    /// The measures the editor offers to log: what the exercise can log, less what the target records.
    var logChoices: [StepLog] { exercise.logs.filter { !targetRecords($0) } }

    /// What the step logs beyond its count, a column each: reps on a timed set, metres and calories
    /// on a timed row. Whatever is set is asked for, even one the exercise would not offer.
    var extraLogs: [StepLog] { log.filter { !targetRecords($0) } }

    /// The set grid's column for the per-set count; nil for modes with nothing to count per set.
    var countLabel: String? {
        switch forMode {
        case .reps, .amrap: "Reps"
        case .seconds: "Sec"
        case .minutes: "Min"
        case .meters: "m"
        case .calories: "Cal"
        case .max, .segment: nil
        }
    }

    /// The set grid shows a load column: an absolute weight or speed, or a % TM / × BW load once
    /// `Relative.resolve` has worked it out into `target`.
    var hasSetLoad: Bool { hasSetting && (target != nil || (loadFactor == nil && targetPct == nil)) }

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
        if seconds < 60 { return "\(max(0, Int(seconds.rounded())))s" }
        let m = Int((seconds / 60).rounded())
        return m < 60 ? "\(m) min" : String(format: "%dh %02d", m / 60, m % 60)
    }
}

extension ExerciseRef {
    /// What the exercise can log, from its unit: a machine or a run (metres, calories or speed) the
    /// metres and calories it counts; a hold (seconds) nothing beyond its time; a lift or a bodyweight
    /// move the reps. `exerciseLogs` in model.ts.
    var logs: [StepLog] {
        switch Measure.of(unit) {
        case .seconds: []
        case .meters, .calories: [.meters, .calories]
        case nil: unit == "kph" ? [.meters, .calories] : [.reps]
        }
    }
}
