import Foundation

/// The logbook: one exercise across every session it was done in, its best set per session over
/// time, and its records. Keyed by exercise key — a step swapped mid-session logs a row per
/// exercise, so the key is what the history follows, not the step. Ported one for one from
/// `src/features/results/logbook.ts`.
enum Logbook {
    /// One session of one exercise: every set of it in that session, in order.
    struct Session: Hashable, Identifiable {
        var resultId: String?
        var runsheetId: String
        var title: String
        var startedAt: String
        var sets: [SetResult]
        /// Highest treadmill incline used in the session.
        var incline: Double?
        /// Per set: did it beat a record standing before it. Never true in the first session.
        var prs: [Bool] = []

        var id: String { resultId ?? "\(runsheetId)@\(startedAt)" }
        var startedDate: Date { ISO8601.date(startedAt) ?? .distantPast }
    }

    /// What the chart and records measure, from what was logged: `strength` load and reps
    /// (estimated 1RM), `load` load only (a weight held, a treadmill speed), `reps` reps only
    /// (bodyweight), `pace` distance with a time (a 500 m row: fastest pace), `distance` distance
    /// alone (most metres), `calories` a calorie count, `time` time alone (a plank: longest),
    /// `rounds` none of these — sets from before times were kept.
    enum Kind: String, Hashable { case strength, load, reps, pace, distance, calories, time, rounds }

    /// The kinds that are about load and reps, which stalls and targets read.
    static func isLift(_ k: Kind) -> Bool { k == .strength || k == .load || k == .reps }
    /// Lower is better on the chart: pace.
    static func lowerIsBetter(_ k: Kind) -> Bool { k == .pace }

    struct Rec: Hashable {
        var value: Double
        /// startedAt of the session that set it.
        var at: String
        /// The set behind it, for "100 × 5". Nil for session volume.
        var set: SetResult?
    }

    struct Records: Hashable {
        var kind: Kind
        var sessions = 0
        var heaviest: Rec?
        var e1rm: Rec?
        var reps: Rec?
        /// Load × reps summed over a session.
        var volume: Rec?
        /// Longest timed set that is not a distance or calorie count: a hold, an interval. Seconds.
        var longest: Rec?
        /// Most metres in a set.
        var distance: Rec?
        /// Most calories in a set.
        var calories: Rec?
        /// Fastest time for each distance done, keyed by whole metres. Lower is better.
        var fastest: [Int: Rec] = [:]
    }

    struct Point: Hashable {
        var at: String
        var value: Double
        var date: Date { ISO8601.date(at) ?? .distantPast }
    }

    struct Logged: Hashable, Identifiable {
        var exerciseKey: String
        var lastAt: String
        var sessions: Int
        var id: String { exerciseKey }
    }

    /// Before 28 Sep 2026 the timer (and the CSV import, for seconds) logged the metres, seconds or
    /// calories of an exercise counted in them as the set's load. Read with the exercise's unit,
    /// such a load is its measure. A set that has the measure already is left as it is, so reading
    /// twice is the same as once. The stored row is not changed.
    static func measured(_ sets: [SetResult], unit: String?) -> [SetResult] {
        guard let f = Measure.of(unit) else { return sets }
        return sets.map { x in
            guard let load = x.load else { return x }
            var y = x
            switch f {
            case .meters: guard x.meters == nil else { return x }; y.meters = load
            case .seconds: guard x.seconds == nil else { return x }; y.seconds = load
            case .calories: guard x.calories == nil else { return x }; y.calories = load
            }
            y.load = nil
            return y
        }
    }

    /// A row's sets. Older results have no per-set rows: their one load and each rep count stand in.
    /// A legacy measure logged as a load reads as the measure (`measured`), with the exercise's unit
    /// from the library unless given.
    static func sets(of s: StepResult, unit: String? = nil) -> [SetResult] {
        let raw: [SetResult]
        if let sets = s.sets, !sets.isEmpty { raw = sets }
        else if let reps = s.reps, !reps.isEmpty { raw = reps.map { SetResult(reps: $0, load: s.target) } }
        else { raw = s.target.map { [SetResult(reps: nil, load: $0)] } ?? [] }
        return measured(raw, unit: unit ?? Library.shared.exercise(s.exerciseKey)?.unit)
    }

    // A warm-up is logged and shown, but it is never a record, never volume and never a session's best.
    private static func loaded(_ x: SetResult) -> Bool { x.isWorking && (x.load ?? 0) > 0 }
    private static func counted(_ x: SetResult) -> Bool { x.isWorking && (x.reps ?? 0) > 0 }
    private static func distanced(_ x: SetResult) -> Bool { x.isWorking && (x.meters ?? 0) > 0 }
    private static func burned(_ x: SetResult) -> Bool { x.isWorking && (x.calories ?? 0) > 0 }
    private static func timed(_ x: SetResult) -> Bool { x.isWorking && (x.seconds ?? 0) > 0 }
    /// A set whose time is the work: timed, and not a distance or calorie count done against the clock.
    private static func held(_ x: SetResult) -> Bool { timed(x) && !distanced(x) && !burned(x) }

    /// Pace in seconds per `per` metres (500 for a rower, 1000 for a run).
    static func pace(_ x: SetResult, per: Double = 1000) -> Double? {
        guard distanced(x), timed(x) else { return nil }
        return x.seconds! / x.meters! * per
    }

    /// Sets above this many reps say nothing reliable about a one-rep max.
    static let e1rmMaxReps: Double = 10

    /// Estimated one-rep max by Epley: load × (1 + reps / 30), and the load itself for a single.
    /// Epley over a percentage table because it is one line on both platforms and within a few
    /// percent of the tables up to about 10 reps. Past 10 it overstates, so those sets get no
    /// estimate: they still count for most reps and for volume.
    static func e1rm(_ x: SetResult) -> Double? {
        guard loaded(x), counted(x), let load = x.load, let reps = x.reps, reps <= e1rmMaxReps else { return nil }
        return reps == 1 ? load : load * (1 + reps / 30)
    }

    /// Every session the exercise was done in, newest first, with each set's PR flag.
    static func history(_ results: [SessionResult], exerciseKey: String, unit: String? = nil) -> [Session] {
        var out: [Session] = []
        for r in results.sorted(by: { $0.startedAt < $1.startedAt }) {
            let rows = r.steps.filter { $0.exerciseKey == exerciseKey }
            guard !rows.isEmpty else { continue }
            out.append(Session(
                resultId: r.id, runsheetId: r.runsheetId, title: r.displayTitle, startedAt: r.startedAt,
                sets: rows.flatMap { sets(of: $0, unit: unit) }, incline: rows.compactMap(\.incline).max()
            ))
        }
        // Records as they stood before each set, so a PR marks the set that set it, not today's best.
        var before = Records(kind: kind(out))
        for i in out.indices {
            out[i].prs = out[i].sets.map { x in
                let pr = before.sessions > 0 && isRecord(x, before: before)
                before = adding(x, at: out[i].startedAt, to: before)
                return pr
            }
            before = adding(session: out[i], to: before)
        }
        return out.reversed()
    }

    static func kind(_ sessions: [Session]) -> Kind { kind(sets: sessions.flatMap(\.sets)) }

    static func kind(sets all: [SetResult]) -> Kind {
        if all.contains(where: { loaded($0) && counted($0) }) { return .strength }
        if all.contains(where: loaded) { return .load }
        if all.contains(where: counted) { return .reps }
        if all.contains(where: { distanced($0) && timed($0) }) { return .pace }
        if all.contains(where: distanced) { return .distance }
        if all.contains(where: burned) { return .calories }
        if all.contains(where: timed) { return .time }
        return .rounds
    }

    /// Load × reps over the session's sets. Nil when no set has both.
    static func volume(_ sets: [SetResult]) -> Double? {
        let xs = sets.filter { loaded($0) && counted($0) }
        return xs.isEmpty ? nil : xs.reduce(0) { $0 + $1.load! * $1.reps! }
    }

    /// The session's best set in the chart's terms: estimated 1RM, top load, most reps, or rounds.
    /// A strength session whose sets were all above 10 reps has no estimate, so its point falls
    /// back to the top load — a lower number on the same line, rather than a gap.
    static func best(_ sets: [SetResult], kind: Kind, per: Double = 1000) -> Double? {
        switch kind {
        case .strength: return sets.compactMap(e1rm).max() ?? sets.filter(loaded).compactMap(\.load).max()
        case .load: return sets.filter(loaded).compactMap(\.load).max()
        case .reps: return sets.filter(counted).compactMap(\.reps).max()
        case .pace: return sets.compactMap { pace($0, per: per) }.min()
        case .distance: return sets.filter(distanced).compactMap(\.meters).max()
        case .calories: return sets.filter(burned).compactMap(\.calories).max()
        case .time: return sets.filter(held).compactMap(\.seconds).max()
        case .rounds:
            let n = sets.filter(\.isWorking).count
            return n == 0 ? nil : Double(n)
        }
    }

    /// One point per session, oldest first — what the chart draws.
    static func points(_ history: [Session], kind: Kind? = nil, per: Double = 1000) -> [Point] {
        let k = kind ?? self.kind(history)
        return history.sorted { $0.startedAt < $1.startedAt }.compactMap { s in
            best(s.sets, kind: k, per: per).map { Point(at: s.startedAt, value: $0) }
        }
    }

    /// Records only move on a strictly better number, so each keeps the date it was first set.
    private static func better(_ cur: Rec?, _ value: Double?, at: String, set: SetResult? = nil) -> Rec? {
        guard let value, cur.map({ value > $0.value }) ?? true else { return cur }
        return Rec(value: value, at: at, set: set)
    }

    /// A distance as a record key: whole metres.
    static func distKey(_ m: Double) -> Int { Int(m.rounded()) }

    private static func adding(_ x: SetResult, at: String, to r: Records) -> Records {
        var r = r
        r.heaviest = better(r.heaviest, loaded(x) ? x.load : nil, at: at, set: x)
        r.e1rm = better(r.e1rm, e1rm(x), at: at, set: x)
        r.reps = better(r.reps, counted(x) ? x.reps : nil, at: at, set: x)
        r.longest = better(r.longest, held(x) ? x.seconds : nil, at: at, set: x)
        r.distance = better(r.distance, distanced(x) ? x.meters : nil, at: at, set: x)
        r.calories = better(r.calories, burned(x) ? x.calories : nil, at: at, set: x)
        if distanced(x), timed(x), let sec = x.seconds {
            let k = distKey(x.meters!)
            // Lower wins, and a tie keeps the date it was first done.
            if r.fastest[k].map({ sec < $0.value }) ?? true { r.fastest[k] = Rec(value: sec, at: at, set: x) }
        }
        return r
    }

    private static func adding(session s: Session, to r: Records) -> Records {
        var r = r
        r.sessions += 1
        r.volume = better(r.volume, volume(s.sets), at: s.startedAt)
        return r
    }

    /// Heaviest load, best estimated 1RM, most reps in a set and best session volume, each with its date.
    static func records(_ results: [SessionResult], exerciseKey: String, unit: String? = nil) -> Records {
        let history = history(results, exerciseKey: exerciseKey, unit: unit).reversed()
        var r = Records(kind: kind(Array(history)))
        for s in history {
            for x in s.sets { r = adding(x, at: s.startedAt, to: r) }
            r = adding(session: s, to: r)
        }
        return r
    }

    /// Does this set beat a record standing before it. A loaded set: a heavier load or a better
    /// estimated 1RM — more reps at a light weight is not a PR. An unloaded (bodyweight) set: more
    /// reps. Only an existing record can be beaten, so the first time is not a PR, nor is a tie.
    /// A distance: a faster time over the same distance, or further than ever. Calories: more. A
    /// hold or an interval: longer.
    static func isRecord(_ x: SetResult, before: Records) -> Bool {
        if loaded(x) {
            if let h = before.heaviest, x.load! > h.value { return true }
            if let e = e1rm(x), let b = before.e1rm, e > b.value { return true }
            return false
        }
        if counted(x) { return before.reps.map { x.reps! > $0.value } ?? false }
        if distanced(x) {
            if timed(x), let f = before.fastest[distKey(x.meters!)], x.seconds! < f.value { return true }
            return before.distance.map { x.meters! > $0.value } ?? false
        }
        if burned(x) { return before.calories.map { x.calories! > $0.value } ?? false }
        return held(x) && (before.longest.map { x.seconds! > $0.value } ?? false)
    }

    /// Everything ever logged, most recently done first.
    static func logged(_ results: [SessionResult]) -> [Logged] {
        var m: [String: Logged] = [:]
        for r in results {
            for key in Set(r.steps.map(\.exerciseKey)) {
                if var cur = m[key] {
                    cur.sessions += 1
                    if r.startedAt > cur.lastAt { cur.lastAt = r.startedAt }
                    m[key] = cur
                } else {
                    m[key] = Logged(exerciseKey: key, lastAt: r.startedAt, sessions: 1)
                }
            }
        }
        return m.values.sorted { ($0.lastAt, $1.exerciseKey) > ($1.lastAt, $0.exerciseKey) }
    }

    /// A time worked: "45 s" under a minute, "1:05" from one.
    static func duration(_ sec: Double) -> String {
        let t = Int(sec.rounded())
        return t < 60 ? "\(t) s" : String(format: "%d:%02d", t / 60, t % 60)
    }

    /// "100 × 5", "14.5 kph", "12 reps", "500 m in 1:41", "20 cal", "1:00", or "" for a round with
    /// nothing counted. A load or reps with a time adds it: "24 kg · 40 s".
    static func label(_ x: SetResult, unit: String = "") -> String {
        let time = (x.seconds ?? 0) > 0 ? duration(x.seconds!) : ""
        if let m = x.meters { return "\(Format.number(m)) m" + (time.isEmpty ? "" : " in \(time)") }
        if let c = x.calories { return "\(Format.number(c)) cal" + (time.isEmpty ? "" : " in \(time)") }
        let base: String
        switch (x.load, x.reps) {
        case let (load?, reps?): base = "\(Format.number(load)) × \(Format.number(reps))"
        case let (load?, nil): base = unit.isEmpty ? Format.number(load) : "\(Format.number(load)) \(unit)"
        case let (nil, reps?): base = "\(Format.number(reps)) reps"
        default: base = ""
        }
        if base.isEmpty { return time }
        return time.isEmpty ? base : "\(base) · \(time)"
    }
}

extension Logbook {
    /// A record set in one session: the exercise and its best set that beat the record standing before it.
    struct SessionPR: Hashable, Sendable {
        var exerciseKey: String
        var set: SetResult
    }

    /// Records this session set, one per exercise: of the sets flagged as a PR by `history` (against
    /// everything logged before it), the best one. Sessions after this one are ignored, so an old
    /// session keeps the PRs it set at the time. `all` may or may not already hold `result`.
    static func sessionPRs(_ result: SessionResult, all: [SessionResult]) -> [SessionPR] {
        let upTo = all.filter { !Celebrate.same($0, result) && $0.startedAt <= result.startedAt } + [result]
        var seen = Set<String>()
        var out: [SessionPR] = []
        for key in result.steps.map(\.exerciseKey) where seen.insert(key).inserted {
            guard let mine = history(upTo, exerciseKey: key).first(where: { $0.startedAt == result.startedAt && $0.runsheetId == result.runsheetId }) else { continue }
            let prs = zip(mine.sets, mine.prs).filter(\.1).map(\.0)
            let score = { (x: SetResult) in e1rm(x) ?? x.load ?? x.reps ?? x.meters ?? x.calories ?? x.seconds ?? 0 }
            guard var best = prs.first else { continue }
            for x in prs.dropFirst() where score(x) > score(best) { best = x }
            out.append(SessionPR(exerciseKey: key, set: best))
        }
        return out
    }
}
