import Foundation

/// Today's target, from history: what to aim for in a workout's own terms. Density for timed work
/// (more rounds or reps in the same window, the same work in less time), and increment-aware double
/// progression for sets (reps are banked at the load you own until the next load is no harder).
/// `Intent` scales both. Nothing is stored or enforced; ignoring a target costs nothing. Pure;
/// ported one for one from `src/features/runsheet/targets.ts`.
enum Intent: String, CaseIterable, Identifiable, Sendable {
    case restore, maintain, overreach

    var id: String { rawValue }
    var label: String {
        switch self {
        case .restore: "Restore"
        case .maintain: "Maintain"
        case .overreach: "Overreach"
        }
    }
    var note: String {
        switch self {
        case .restore: "Match last time. For a tired week."
        case .maintain: "A rep or a round more than last time."
        case .overreach: "Two more, and a faster time."
        }
    }

    /// The `@AppStorage` key, and the stored value read with maintain as the default.
    static let storageKey = "intent"
    static func current(_ defaults: UserDefaults = .standard) -> Intent {
        defaults.string(forKey: storageKey).flatMap(Intent.init(rawValue:)) ?? .maintain
    }
}

enum Targets {
    // MARK: - Density

    struct ScoreTarget: Hashable {
        enum Kind: String { case rounds, time, reps }
        var kind: Kind
        /// Rounds or reps to reach, or seconds to finish under.
        var aim: Double
        /// The scores it was read from, oldest first.
        var recent: [Double]
        /// "Aim for 8+ rounds", "Finish in under 11:40".
        var text: String
        /// "Last 3 times: 7, 7, 8 rounds".
        var detail: String
        /// Seconds a round at the aim, when the window or the round count is known.
        var pace: Double?
    }

    /// m:ss, as the web writes it.
    static func clock(_ sec: Double) -> String {
        let m = Int((sec / 60).rounded(.down))
        let s = Int((sec.truncatingRemainder(dividingBy: 60)).rounded())
        return "\(m):\(String(format: "%02d", s))"
    }

    private static func median(_ xs: [Double]) -> Double { xs.sorted()[(xs.count - 1) / 2] }

    /// "7" or "7+5" for 7 rounds and 5 reps.
    private static func rounds(_ score: Double) -> String {
        let whole = score.rounded(.down)
        let reps = Int(((score - whole) * 1000).rounded())
        return reps > 0 ? "\(Int(whole))+\(reps)" : "\(Int(whole))"
    }

    static func mainBlock(_ r: Runsheet) -> Block? {
        r.items.compactMap(\.asBlock).first { ($0.role ?? .main) == .main }
    }

    /// The next score to aim for in a timed workout, from its last three. Nil for a workout not
    /// scored on rounds, time or reps, or with no scored history. A for-time score only counts when
    /// the session ran to the end.
    static func score(_ r: Runsheet, results: [SessionResult], intent: Intent = .maintain) -> ScoreTarget? {
        let type = r.effectiveScore
        guard type == .rounds || type == .time || type == .reps else { return nil }
        let recent = results
            .filter { r.owns($0) && $0.activity == nil && ($0.score ?? 0) > 0 && (type != .time || $0.completed != false) }
            .sorted { $0.startedAt < $1.startedAt }
            .suffix(3)
            .compactMap(\.score)
        guard !recent.isEmpty else { return nil }
        let when = recent.count == 1 ? "Last time" : "Last \(recent.count) times"
        let block = mainBlock(r)
        switch type {
        case .time:
            let best = recent.min()!
            let aim: Double = switch intent {
            case .restore: median(recent)
            case .overreach: best - max(5, ((best * 0.03) / 5).rounded() * 5)
            case .maintain: best
            }
            let n = block?.runMode == .ladder ? (block?.ladder?.count ?? 0) : (block?.repeatCount ?? 0)
            return ScoreTarget(kind: .time, aim: aim, recent: recent, text: "Finish in under \(clock(aim))",
                               detail: "\(when): \(recent.map(clock).joined(separator: ", "))", pace: n > 1 ? aim / Double(n) : nil)
        case .rounds:
            let best = recent.max()!
            let aim: Double = switch intent {
            case .restore: median(recent).rounded(.down)
            case .overreach: best.rounded(.down) + 1
            case .maintain: best.rounded(.up)
            }
            let cap = block?.runMode == .amrap ? block?.timeCapSec : nil
            return ScoreTarget(kind: .rounds, aim: aim, recent: recent, text: "Aim for \(Format.number(aim))+ rounds",
                               detail: "\(when): \(recent.map(rounds).joined(separator: ", ")) rounds",
                               pace: cap.flatMap { $0 > 0 && aim > 0 ? $0 / aim : nil })
        default:
            let best = recent.max()!
            let aim: Double = switch intent {
            case .restore: median(recent)
            case .overreach: best + max(2, (best * 0.05).rounded())
            case .maintain: best + 1
            }
            return ScoreTarget(kind: .reps, aim: aim, recent: recent, text: "Aim for \(Format.number(aim))+ reps",
                               detail: "\(when): \(recent.map(Format.number).joined(separator: ", ")) reps")
        }
    }

    // MARK: - Load × reps

    /// The reps at `load` that equal `reps` at the next load up, by Epley — where banking stops. At
    /// least one more than `reps`, at most double.
    static func bankTop(load: Double, step: Double, reps: Double) -> Double {
        let even = 30 * (((load + step) / load) * (1 + reps / 30) - 1)
        return min(max(reps + 1, (even - 1e-9).rounded(.up)), reps * 2)
    }

    struct SetTarget: Hashable {
        var stepId: String
        var exerciseKey: String
        var name: String
        /// Load for today, in the exercise unit; nil for bodyweight.
        var load: Double?
        /// Reps per set, in order.
        var reps: [Double]
        /// True when today is the step up to the next load.
        var jump: Bool
        /// "24 kg × 10, 10, 9", "28 kg × 8", "12 reps".
        var text: String
        var reason: String
    }

    private static func repsText(_ reps: [Double]) -> String {
        reps.allSatisfy { $0 == reps[0] } ? Format.number(reps[0]) : reps.map(Format.number).joined(separator: ", ")
    }

    /// A per-set plan whose working sets differ (a pyramid, ramping sets). Warm-ups before
    /// straight sets do not make one.
    private static func pyramid(_ s: ExerciseStep) -> Bool {
        let work = (s.sets ?? []).indices.filter { s.sets![$0].type != .warmup }.map { s.plannedSet($0) }
        guard let first = work.first else { return false }
        return work.contains { $0.reps != first.reps || $0.load != first.load }
    }

    /// Today's sets for one step, from its sets last time (`LastTime.sets`). Only steps counted in
    /// reps whose load is theirs to change: no pyramid, no relative load, nothing on a speed. Last
    /// time's warm-ups and drop sets are not the work, so they are left out. The next load up is
    /// the next one `kit` can make (a 24 kg bell goes to 28, not 26.5).
    static func set(_ s: ExerciseStep, last all: [SetResult]?, intent: Intent = .maintain, kit: Equipment? = nil) -> SetTarget? {
        let last = all?.filter { $0.type != .warmup && $0.type != .drop }
        guard let last, !last.isEmpty, !pyramid(s), s.targetPct == nil, s.loadFactor == nil else { return nil }
        guard [.reps, .amrap, .max].contains(s.forMode) else { return nil }
        let unit = s.shortUnit
        guard unit != "kph" else { return nil }
        let top = last.map { $0.load ?? 0 }.max() ?? 0
        let add: Double = switch intent { case .restore: 0; case .overreach: 2; case .maintain: 1 }
        func make(load: Double?, reps: [Double], jump: Bool, text: String, reason: String) -> SetTarget {
            SetTarget(stepId: s.id, exerciseKey: s.exercise.key, name: s.exercise.name, load: load, reps: reps, jump: jump, text: text, reason: reason)
        }
        if top <= 0 || unit.isEmpty {
            let done = last.compactMap(\.reps).filter { $0 > 0 }
            guard !done.isEmpty else { return nil }
            let reps = done.map { $0 + add }
            let reason = add == 0 ? "what you did last time" : "\(add == 1 ? "a rep" : "\(Format.number(add)) reps") more a set than last time"
            return make(load: nil, reps: reps, jump: false, text: "\(repsText(reps)) reps", reason: reason)
        }
        guard s.forMode == .reps else { return nil }
        let working = last.filter { $0.load == top && ($0.reps ?? 0) > 0 }.compactMap(\.reps)
        guard !working.isEmpty else { return nil }
        let up = Plates.nextUp(top, s.exercise, kit)
        let bottom = s.forValue
        let ceiling = s.forMax ?? (up.map { bankTop(load: top, step: $0 - top, reps: bottom) } ?? bottom * 2)
        let next = up.map { ($0 * 100).rounded() / 100 } ?? top
        let u = unit.isEmpty ? "" : " \(unit)"
        if up != nil && intent != .restore && working.allSatisfy({ $0 >= ceiling }) {
            let reps = working.map { _ in bottom }
            return make(load: next, reps: reps, jump: true, text: "\(Format.number(next))\(u) × \(repsText(reps))",
                        reason: "\(Format.number(ceiling)) reps at \(Format.number(top))\(u) on every set: up to \(Format.number(next))\(u)")
        }
        // A rep or two more a set, never past the ceiling, never fewer than was done.
        let reps = working.map { max($0, min(ceiling, $0 + add)) }
        return make(load: top, reps: reps, jump: false, text: "\(Format.number(top))\(u) × \(repsText(reps))",
                    reason: add == 0 ? "what you did last time" : up == nil ? "bank reps: \(Format.number(top))\(u) is the heaviest you own" : "bank reps: \(Format.number(next))\(u) once every set reaches \(Format.number(ceiling))")
    }

    /// A programme's own progression rule covers this step: the runsheet's, or its block's.
    static func ruled(_ r: Runsheet, _ s: ExerciseStep) -> Bool {
        r.progression != nil || r.items.compactMap(\.asBlock).contains { $0.progression != nil && $0.steps.contains { $0.id == s.id } }
    }

    /// A target per step, first step of each exercise only, skipping warm-ups and steps a
    /// programme's own progression rules already move.
    static func sets(_ r: Runsheet, results: [SessionResult], intent: Intent = .maintain, kit: Equipment? = nil) -> [SetTarget] {
        var seen = Set<String>()
        var out: [SetTarget] = []
        for s in r.exerciseSteps {
            if seen.contains(s.exercise.key) || (s.role ?? .main) != .main || ruled(r, s) { continue }
            seen.insert(s.exercise.key)
            if let t = set(s, last: LastTime.sets(results, for: s), intent: intent, kit: kit) { out.append(t) }
        }
        return out
    }

    struct Today: Hashable {
        var text: String
        var detail: String
        var score: ScoreTarget?
        var sets: [SetTarget]
    }

    /// The one line for the Up next card and the top of the workout page.
    static func today(_ r: Runsheet, results: [SessionResult], intent: Intent = .maintain, kit: Equipment? = nil) -> Today? {
        if let score = score(r, results: results, intent: intent) {
            return Today(text: score.text, detail: score.detail, score: score, sets: [])
        }
        let all = sets(r, results: results, intent: intent, kit: kit)
        guard let first = all.first else { return nil }
        let more = all.count > 1 ? " · \(all.count - 1) more on the workout page" : ""
        return Today(text: "\(first.name) \(first.text)", detail: "\(first.reason)\(more)", score: nil, sets: all)
    }

    /// The target for where the timer is: the score's pace for a round of the main block, or the
    /// set's load × reps for a straight set.
    /// A warm-up or a drop set has no target; `set` counts the working sets before this one, so a
    /// warm-up first does not shift the reps.
    static func timer(_ t: Today?, blockId: String?, stepId: String?, round: Int, runsheet r: Runsheet, type: SetType = .normal, set setNo: Int? = nil) -> String? {
        guard let t else { return nil }
        if let score = t.score, let main = mainBlock(r), blockId == main.id {
            let pace = score.pace.map { " · \(clock($0)) a round" } ?? ""
            return score.kind == .time ? "Target \(clock(score.aim))\(pace)" : "Target \(Format.number(score.aim))+\(pace)"
        }
        guard let set = t.sets.first(where: { $0.stepId == stepId }), type != .warmup, type != .drop else { return nil }
        let reps = set.reps[min(setNo ?? round, set.reps.count - 1)]
        if let load = set.load { return "Target \(Format.number(load)) × \(Format.number(reps))" }
        return "Target \(Format.number(reps)) reps"
    }

    struct NextTimeLine: Hashable, Identifiable {
        var key: String
        var name: String
        var text: String
        var reason: String
        var id: String { key }
    }

    /// The finish screen's "Next time", read as if the session just done were the newest: the score
    /// to aim for, then a line per exercise not already moved by a programme's rules (`covered`).
    static func nextTime(_ r: Runsheet, done: SessionResult, history: [SessionResult], intent: Intent = .maintain, covered: [String] = [], kit: Equipment? = nil) -> [NextTimeLine] {
        var now = done
        if now.runsheetId.isEmpty { now.runsheetId = r.key }
        let all = history.filter { $0 != done && ($0.id == nil || $0.id != done.id) } + [now]
        if let score = score(r, results: all, intent: intent) {
            return [NextTimeLine(key: "score", name: r.title, text: score.text, reason: score.detail)]
        }
        return sets(r, results: all, intent: intent, kit: kit)
            .filter { !covered.contains($0.exerciseKey) }
            .map { NextTimeLine(key: $0.exerciseKey, name: $0.name, text: $0.text, reason: $0.reason) }
    }
}
