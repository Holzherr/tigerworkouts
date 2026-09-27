import Foundation

/// What to do next, from what was done last: the following day of the program the last session
/// belonged to, or else that same workout again. Ported from `src/features/discover/next-up.ts`.
/// Nothing without history, so the first run stays the catalogue.
struct NextUp: Hashable {
    var runsheet: Runsheet
    /// "Next in StrongLifts 5×5" or "Your last workout".
    var reason: String
    var lastAt: Date

    static func find(in all: [Runsheet], results: [SessionResult]) -> NextUp? {
        let byId = Dictionary(all.map { ($0.key, $0) }, uniquingKeysWith: { first, _ in first })
        // Your edited copy of a day replaces the day, whether the last session ran the copy or the original.
        let copies = Dictionary(all.compactMap { r in r.copyOf.map { ($0, r) } }, uniquingKeysWith: { first, _ in first })
        guard let latest = results.sorted(by: { $0.startedAt > $1.startedAt }).first(where: { byId[$0.runsheetId] != nil }),
              let last = copies[latest.runsheetId] ?? byId[latest.runsheetId] else { return nil }
        func root(_ r: Runsheet) -> String { r.copyOf ?? r.key }
        if let program = last.program?.name, !program.isEmpty {
            let days = all.filter { $0.program?.name == program && !(copies[$0.key] != nil && $0.copyOf == nil) }
                .sorted { ($0.program?.order ?? 0) < ($1.program?.order ?? 0) }
            if days.count > 1, let i = days.firstIndex(where: { root($0) == root(last) }) {
                return NextUp(runsheet: days[(i + 1) % days.count], reason: "Next in \(program)", lastAt: latest.startedDate)
            }
        }
        return NextUp(runsheet: last, reason: "Your last workout", lastAt: latest.startedDate)
    }

    /// Minutes trained across every logged session: the timer's own duration, or what a quick log said.
    static func totalMinutes(_ results: [SessionResult]) -> Int {
        Int(results.reduce(0.0) { $0 + ($1.durationSec.map { $0 / 60 } ?? $1.activity?.minutes ?? 0) }.rounded())
    }

    /// "45 min", "3 h 20".
    static func format(minutes m: Int) -> String {
        m < 60 ? "\(m) min" : "\(m / 60) h" + (m % 60 == 0 ? "" : " \(m % 60)")
    }

    /// "3 this week · 2 weeks running", or how last week went when this one has nothing yet.
    static func weekLine(_ s: Streak) -> String {
        if s.thisWeek > 0 { return "\(s.thisWeek) this week" + (s.weeks > 1 ? " · \(s.weeks) weeks running" : "") }
        return s.lastWeek > 0 ? "None yet this week · \(s.lastWeek) last week" : "None yet this week"
    }
}
