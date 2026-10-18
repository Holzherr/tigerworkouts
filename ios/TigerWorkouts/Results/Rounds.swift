import Foundation

/// Round times from the splits the timer keeps: how long each round of a circuit, AMRAP or for-time
/// block took, the fastest and slowest, the same rounds last time, and the fastest round a workout
/// has ever had. Ported one for one from `src/features/results/rounds.ts`.
enum Rounds {
    /// A block whose rounds the timer fixed: rounds or EMOM where every exercise is done for seconds
    /// or minutes. Its round times were always going to match, so they say nothing.
    static func fixedTime(_ b: Block) -> Bool {
        let work = b.steps.compactMap(\.asExercise)
        return ((b.mode ?? .rounds) == .rounds || b.mode == .emom) && !work.isEmpty && work.allSatisfy { $0.forMode == .seconds || $0.forMode == .minutes }
    }

    /// The splits worth a round time: all of them, less the blocks the workout fixed the time of.
    static func measuredSplits(_ result: SessionResult, runsheet: Runsheet?) -> [RoundSplit] {
        (result.splits ?? []).filter { sp in
            guard let b = runsheet?.items.compactMap(\.asBlock).first(where: { $0.id == sp.blockId }) else { return true }
            return !fixedTime(b)
        }
    }

    /// A spread under 5 s or 5% of the fastest is noise: 2:00 against 2:01 is not a fastest round.
    static func realSpread(fastest: Double, slowest: Double) -> Bool {
        slowest - fastest >= max(5, fastest * 0.05)
    }

    /// Seconds each round took: from the block's start (or the round before) to the round's last
    /// tick. Round 1 of a split kept before the block's start was has no time.
    static func times(_ sp: RoundSplit) -> [Double?] {
        sp.at.indices.map { i in
            // From when the round's work began, so the rest before it is not in it; older splits
            // fall back to the block's start or the round before.
            let from = sp.starts.flatMap { $0.indices.contains(i) ? $0[i] : nil } ?? (i == 0 ? sp.from : sp.at[i - 1])
            return from.map { max(0, (sp.at[i] - $0).rounded()) }
        }
    }

    struct Row: Hashable, Sendable {
        var blockId: String
        /// Per round, seconds; nil where it cannot be worked out.
        var times: [Double?]
        /// Index of the fastest and slowest round; nil with fewer than two timed rounds.
        var fastest: Int?
        var slowest: Int?
        /// This round minus the same round last time — negative is faster.
        var vsLast: [Double?]
    }

    /// One row per split block, with the fastest and slowest rounds marked when they are really
    /// apart and, given the last session of the same workout, each round against the same round
    /// then. Given the workout, a block whose round time the timer fixed has no row.
    static func rows(_ result: SessionResult, last: SessionResult? = nil, runsheet: Runsheet? = nil) -> [Row] {
        measuredSplits(result, runsheet: runsheet).map { sp in
            let ts = times(sp)
            let before = last?.splits?.first { $0.blockId == sp.blockId }.map(times) ?? []
            let vs: [Double?] = ts.indices.map { i in
                guard let t = ts[i], before.indices.contains(i), let b = before[i] else { return nil }
                return t - b
            }
            var row = Row(blockId: sp.blockId, times: ts, vsLast: vs)
            let timed = ts.enumerated().compactMap { i, t in t.map { (i: i, t: $0) } }
            if timed.count > 1 {
                // The first of equals, as reduce keeps it in the web app.
                let fast = timed.reduce(timed[0]) { $1.t < $0.t ? $1 : $0 }
                let slow = timed.reduce(timed[0]) { $1.t > $0.t ? $1 : $0 }
                if realSpread(fastest: fast.t, slowest: slow.t) {
                    row.fastest = fast.i
                    row.slowest = slow.i
                }
            }
            return row
        }
    }

    struct AmountRow: Hashable, Sendable {
        var blockId: String
        var stepId: String
        var exerciseKey: String
        var field: StepLog
        /// Per round, what was logged; nil where nothing was.
        var values: [Double?]
        /// Index of the round with the most; nil when no two rounds differ.
        var best: Int?
    }

    /// What each round of a fixed-time block logged, for the steps set to log reps, metres or
    /// calories: "Rower sprints: R1 142 m · R2 138 m · R3 145 m". A round is a working set of the
    /// step, in order. Any difference earns "best" — the amount is what varied.
    static func amountRows(_ result: SessionResult, runsheet: Runsheet?) -> [AmountRow] {
        guard let runsheet else { return [] }
        var out: [AmountRow] = []
        for b in runsheet.items.compactMap(\.asBlock) where fixedTime(b) {
            for st in b.steps.compactMap(\.asExercise) {
                guard let field = st.log else { continue }
                let sets = result.steps.filter { $0.stepId == st.id }.flatMap { $0.sets ?? [] }.filter { $0.type != .warmup }
                let values: [Double?] = sets.map { x in
                    switch field {
                    case .reps: x.reps
                    case .meters: x.meters
                    case .calories: x.calories
                    }
                }
                let given = values.enumerated().compactMap { i, v in v.map { (i: i, v: $0) } }
                guard given.count > 1 else { continue }
                var row = AmountRow(blockId: b.id, stepId: st.id, exerciseKey: st.exercise.key, field: field, values: values)
                // The first of equals, as reduce keeps it in the web app.
                let top = given.reduce(given[0]) { $1.v > $0.v ? $1 : $0 }
                if given.contains(where: { $0.v != top.v }) { row.best = top.i }
                out.append(row)
            }
        }
        return out
    }

    /// "142 m", "15 cal", "12 reps".
    static func amount(_ v: Double, _ field: StepLog) -> String {
        switch field {
        case .meters: "\(Format.number(v)) m"
        case .calories: "\(Format.number(v)) cal"
        case .reps: "\(Format.number(v)) \(v == 1 ? "rep" : "reps")"
        }
    }

    struct Fastest: Hashable, Sendable {
        var blockId: String
        /// 0-based round.
        var round: Int
        var seconds: Double
        /// startedAt of the session it was done in.
        var at: String
    }

    /// The fastest round of each block across these sessions (ties keep the first).
    static func fastest(_ results: [SessionResult]) -> [Fastest] {
        var best: [String: Fastest] = [:]
        var order: [String] = []
        for r in results.sorted(by: { $0.startedAt < $1.startedAt }) {
            for sp in r.splits ?? [] {
                for (round, t) in times(sp).enumerated() {
                    guard let t, t > 0 else { continue }
                    if let cur = best[sp.blockId], t >= cur.seconds { continue }
                    if best[sp.blockId] == nil { order.append(sp.blockId) }
                    best[sp.blockId] = Fastest(blockId: sp.blockId, round: round, seconds: t, at: r.startedAt)
                }
            }
        }
        return order.compactMap { best[$0] }
    }

    /// A round of this session faster than any of the same block before it, in the same workout.
    /// Only a standing record can be beaten, so the first time is not one. `was` is the record beaten.
    struct PR: Hashable, Sendable {
        var blockId: String
        var round: Int
        var seconds: Double
        var at: String
        var was: Double
    }

    /// `lineage` is the ids the workout's sessions are logged under (`Runsheet.lineage`): an edited
    /// copy races the rounds of the workout it was copied from, whose block ids it keeps.
    static func prs(_ result: SessionResult, all: [SessionResult], lineage: [String]? = nil, runsheet: Runsheet? = nil) -> [PR] {
        guard !(result.splits ?? []).isEmpty else { return [] }
        // A block whose round time the timer fixed has no fastest round to beat.
        let measured = Set(measuredSplits(result, runsheet: runsheet).map(\.blockId))
        let ids = Set(lineage ?? [result.runsheetId]).union([result.runsheetId])
        let before = fastest(all.filter { !Celebrate.same($0, result) && ids.contains($0.runsheetId) && $0.startedAt < result.startedAt })
        return fastest([result]).compactMap { mine in
            guard measured.contains(mine.blockId), let rec = before.first(where: { $0.blockId == mine.blockId }), mine.seconds < rec.seconds else { return nil }
            return PR(blockId: mine.blockId, round: mine.round, seconds: mine.seconds, at: mine.at, was: rec.seconds)
        }
    }

    /// "−4 s", "+1:06", "same". Negative is faster.
    static func delta(_ d: Double) -> String {
        d == 0 ? "same" : "\(d < 0 ? "−" : "+")\(Logbook.duration(abs(d)))"
    }
}
