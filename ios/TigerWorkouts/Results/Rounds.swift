import Foundation

/// Round times from the splits the timer keeps: how long each round of a circuit, AMRAP or for-time
/// block took, the fastest and slowest, the same rounds last time, and the fastest round a workout
/// has ever had. Ported one for one from `src/features/results/rounds.ts`.
enum Rounds {
    /// Seconds each round took: from the block's start (or the round before) to the round's last
    /// tick. Round 1 of a split kept before the block's start was has no time.
    static func times(_ sp: RoundSplit) -> [Double?] {
        sp.at.indices.map { i in
            let from = i == 0 ? sp.from : sp.at[i - 1]
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

    /// One row per split block, with the fastest and slowest rounds marked and, given the last
    /// session of the same workout, each round against the same round then.
    static func rows(_ result: SessionResult, last: SessionResult? = nil) -> [Row] {
        (result.splits ?? []).map { sp in
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
                row.fastest = timed.reduce(timed[0]) { $1.t < $0.t ? $1 : $0 }.i
                row.slowest = timed.reduce(timed[0]) { $1.t > $0.t ? $1 : $0 }.i
            }
            return row
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
    static func prs(_ result: SessionResult, all: [SessionResult], lineage: [String]? = nil) -> [PR] {
        guard !(result.splits ?? []).isEmpty else { return [] }
        let ids = Set(lineage ?? [result.runsheetId]).union([result.runsheetId])
        let before = fastest(all.filter { !Celebrate.same($0, result) && ids.contains($0.runsheetId) && $0.startedAt < result.startedAt })
        return fastest([result]).compactMap { mine in
            guard let rec = before.first(where: { $0.blockId == mine.blockId }), mine.seconds < rec.seconds else { return nil }
            return PR(blockId: mine.blockId, round: mine.round, seconds: mine.seconds, at: mine.at, was: rec.seconds)
        }
    }

    /// "−4 s", "+1:06", "same". Negative is faster.
    static func delta(_ d: Double) -> String {
        d == 0 ? "same" : "\(d < 0 ? "−" : "+")\(Logbook.duration(abs(d)))"
    }
}
