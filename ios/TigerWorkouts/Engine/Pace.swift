import Foundation

/// Racing last time: one signed number on the timer, "Round 4 — 12 s ahead". It compares the
/// session time at the latest round (circuits, AMRAPs) or set (straight sets, loose steps) done now
/// with the session time at the same round or set in the last session of this workout — for a round,
/// the time since its block started, when both sessions kept that. Pure; ported
/// from `src/features/timer/pace.ts`.
enum Pace {
    struct Mark: Hashable, Sendable {
        var key: String
        var label: String
        /// Session time, seconds.
        var at: Double
        /// Seconds since the block started, for a round: the clock a for-time score is on.
        var rel: Double? = nil
    }

    struct Ghost: Hashable, Sendable {
        var label: String
        /// Seconds ahead of last time; negative is behind.
        var delta: Double
        /// "Round 4 — 12 s ahead", "Set 2 — 8 s behind", "Round 1 — on pace".
        var text: String
        /// "12 s ahead": the short form, for the Lock Screen.
        var short: String
    }

    /// Every timed point in a result. A step whose block has round splits is covered by them, so
    /// its sets are not marks of their own. `blockOf` maps a step id to its block id.
    static func marks(_ r: SessionResult, blockOf: (String) -> String? = { _ in nil }) -> [Mark] {
        let split = Set((r.splits ?? []).map(\.blockId))
        var out: [Mark] = []
        for sp in r.splits ?? [] {
            for (i, at) in sp.at.enumerated() { out.append(Mark(key: "round:\(sp.blockId):\(i)", label: "Round \(i + 1)", at: at, rel: sp.from.map { at - $0 })) }
        }
        for st in r.steps {
            if let block = blockOf(st.stepId), split.contains(block) { continue }
            for (i, set) in (st.sets ?? []).enumerated() {
                if let at = set.at { out.append(Mark(key: "set:\(st.stepId):\(st.exerciseKey):\(i)", label: "Set \(i + 1)", at: at)) }
            }
        }
        return out
    }

    /// The newest session of this workout with times kept, other than `excluding`.
    static func lastTimed(_ history: [SessionResult], runsheetId: String, excluding: String? = nil) -> SessionResult? {
        lastTimed(history, runsheetIds: [runsheetId], excluding: excluding)
    }

    /// The same over a workout's lineage: its own sessions and the original's, for an edited copy.
    static func lastTimed(_ history: [SessionResult], runsheetIds: [String], excluding: String? = nil) -> SessionResult? {
        history
            .filter { runsheetIds.contains($0.runsheetId) && (excluding == nil || $0.id != excluding) && $0.activity == nil }
            .sorted { $0.startedAt > $1.startedAt }
            .first { !marks($0).isEmpty }
    }

    private static func span(_ sec: Int) -> String {
        sec < 60 ? "\(sec) s" : "\(sec / 60):\(String(format: "%02d", sec % 60))"
    }

    /// The delta at the latest mark reached now that last time also reached. Nil until the first
    /// such mark, or with no last time.
    static func ghost(_ now: SessionResult, against last: SessionResult?, blockOf: (String) -> String? = { _ in nil }) -> Ghost? {
        guard let last else { return nil }
        let then = Dictionary(marks(last, blockOf: blockOf).map { ($0.key, $0) }, uniquingKeysWith: { a, _ in a })
        // Stable on ties: rounds come first in `marks`, so a round wins over a set done at the same second.
        let reached = marks(now, blockOf: blockOf).enumerated().filter { then[$0.element.key] != nil }
        guard let hit = reached.max(by: { ($0.element.at, -$0.offset) < ($1.element.at, -$1.offset) })?.element,
              let before = then[hit.key] else { return nil }
        // Rounds race on the block's own clock when both sessions kept it, so a longer warm-up or a
        // slower walk to the rack does not read as falling behind.
        let delta: Double
        if let was = before.rel, let rel = hit.rel { delta = (was - rel).rounded() } else { delta = (before.at - hit.at).rounded() }
        let seconds = Int(abs(delta))
        let short = delta == 0 ? "on pace" : "\(span(seconds)) \(delta > 0 ? "ahead" : "behind")"
        return Ghost(label: hit.label, delta: delta, text: "\(hit.label) — \(short)", short: short)
    }

    /// Step id → block id, for `marks`.
    static func blockOf(_ runsheet: Runsheet) -> (String) -> String? {
        var map: [String: String] = [:]
        for b in runsheet.items.compactMap(\.asBlock) { for s in b.steps { map[s.id] = b.id } }
        return { map[$0] }
    }
}
