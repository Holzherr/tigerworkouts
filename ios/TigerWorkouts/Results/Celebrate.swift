import Foundation

/// What the finish screen leads with: which workout this was in the count, the streak, the records
/// set today and how it compares with the last time the same workout was done. Ported one for one
/// from `src/features/results/celebrate.ts`.
enum Celebrate {
    struct Deltas: Hashable, Sendable {
        var score: Double?
        var durationSec: Double?
        var volume: Double?
    }

    struct Celebration: Hashable, Sendable {
        /// 42 for the 42nd session ever logged, this one included.
        var ordinal: Int
        var streak: Streak
        var prs: [Logbook.SessionPR]
        /// A round faster than any before it in this workout, per block.
        var rounds: [Rounds.PR] = []
        /// Load × reps over the whole session. Nil when nothing was both loaded and counted.
        var volume: Double?
        /// The previous session of the same workout, if there is one.
        var last: SessionResult?
        /// This session minus the last one, per number both have.
        var deltas = Deltas()
    }

    struct DeltaLine: Hashable, Sendable {
        var label: String
        var text: String
        /// True when this is the better direction, false when worse, nil when neither.
        var better: Bool?
    }

    static func same(_ a: SessionResult, _ b: SessionResult) -> Bool {
        if let x = a.id, let y = b.id { return x == y }
        return a.runsheetId == b.runsheetId && a.startedAt == b.startedAt
    }

    /// Load × reps across every exercise in the session.
    static func totalVolume(_ r: SessionResult) -> Double? {
        let vs = r.steps.compactMap { Logbook.volume(Logbook.sets(of: $0)) }
        return vs.isEmpty ? nil : vs.reduce(0, +)
    }

    /// `all` is every session logged, with or without this one in it.
    static func celebrate(_ result: SessionResult, all: [SessionResult], today: Date? = nil) -> Celebration {
        let others = all.filter { !same($0, result) }
        let before = others.filter { $0.startedAt < result.startedAt }
        let last = result.activity != nil ? nil : before
            .filter { $0.runsheetId == result.runsheetId && $0.activity == nil }
            .max { $0.startedAt < $1.startedAt }
        let volume = totalVolume(result)
        let lastVolume = last.flatMap(totalVolume)
        func diff(_ a: Double?, _ b: Double?) -> Double? { a.flatMap { a in b.map { a - $0 } } }
        return Celebration(
            ordinal: before.count + 1,
            streak: EffortModel.streak(others.filter { $0.startedAt <= result.startedAt } + [result], today: today ?? result.startedDate),
            prs: Logbook.sessionPRs(result, all: all),
            rounds: Rounds.prs(result, all: all),
            volume: volume,
            last: last,
            deltas: Deltas(score: diff(result.score, last?.score), durationSec: diff(result.durationSec, last?.durationSec), volume: diff(volume, lastVolume))
        )
    }

    /// `fmtScore` in progression.ts: a score in its type's words.
    static func formatScore(_ type: ScoreType, _ score: Double) -> String {
        switch type {
        case .time: return Format.clock(score)
        case .rounds:
            let extra = Int(((score.truncatingRemainder(dividingBy: 1)) * 1000).rounded())
            return "\(Int(score)) round\(Int(score) == 1 ? "" : "s")" + (extra > 0 ? " + \(extra) reps" : "")
        case .reps: return "\(Format.number(score)) reps"
        case .load: return "\(Format.number(score)) kg"
        case .distance: return "\(Format.number(score)) m"
        case .none: return Format.number(score)
        }
    }

    static func kg(_ n: Double) -> String {
        let a = abs(n)
        return a >= 1000 ? "\(Format.number((a / 100).rounded() / 10)) t" : "\(Int(a.rounded())) kg"
    }

    /// The lines under "vs last time". Time scores are better when lower; every other score and
    /// volume when higher. Duration only says longer or shorter: neither is better by itself.
    static func deltaLines(_ c: Celebration, type: ScoreType) -> [DeltaLine] {
        var out: [DeltaLine] = []
        if let score = c.deltas.score, type != .none {
            if score == 0 {
                out.append(DeltaLine(label: "Score", text: "Same as last time"))
            } else if type == .time {
                out.append(DeltaLine(label: "Score", text: "\(Format.clock(abs(score))) \(score < 0 ? "faster" : "slower")", better: score < 0))
            } else {
                out.append(DeltaLine(label: "Score", text: "\(score > 0 ? "+" : "−")\(formatScore(type, (abs(score) * 1000).rounded() / 1000))", better: score > 0))
            }
        }
        if let v = c.deltas.volume {
            out.append(v == 0
                ? DeltaLine(label: "Volume", text: "Same as last time")
                : DeltaLine(label: "Volume", text: "\(v > 0 ? "+" : "−")\(kg(v))", better: v > 0))
        }
        if let d = c.deltas.durationSec, abs(d) >= 30 {
            let a = abs(d)
            let amount = a < 60 ? "\(Int(a.rounded()))s" : "\(Int((a / 60).rounded())) min"
            out.append(DeltaLine(label: "Time", text: "\(amount) \(d > 0 ? "longer" : "shorter")"))
        }
        return out
    }

    /// "Workout 42".
    static func ordinalLabel(_ n: Int) -> String { "Workout \(n)" }

    /// "3 weeks running · 2 this week", or just "2 this week" before a streak exists.
    static func streakLabel(_ s: Streak) -> String {
        [s.weeks > 1 ? "\(s.weeks) weeks running" : "", "\(s.thisWeek) this week"].filter { !$0.isEmpty }.joined(separator: " · ")
    }

    /// Apple Health's words for the 1–10 workout effort scale.
    static func effortWord(_ rpe: Int) -> String {
        rpe <= 3 ? "Easy" : rpe <= 6 ? "Moderate" : rpe <= 8 ? "Hard" : "All out"
    }
}
