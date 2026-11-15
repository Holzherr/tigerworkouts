import Foundation

/// What to do next. `pick` is the rule for the Up next card on Workouts and the widget; `find` is
/// the older one (the following day of the program the last session belonged to, or else that same
/// workout again). Ported from `src/features/discover/next-up.ts`. Nothing without history, so the
/// first run stays the catalogue.
struct NextUp: Hashable {
    var runsheet: Runsheet
    /// "Next in StrongLifts 5×5" or "Your last workout".
    var reason: String
    var lastAt: Date

    static func find(in all: [Runsheet], results: [SessionResult]) -> NextUp? {
        let byId = Dictionary(all.map { ($0.key, $0) }, uniquingKeysWith: { first, _ in first })
        // Your edited copy of a day replaces the day, whether the last session ran the copy or the original.
        let copies = Self.copies(all)
        guard let latest = results.sorted(by: { $0.startedAt > $1.startedAt }).first(where: { byId[$0.runsheetId] != nil }),
              let found = byId[latest.runsheetId] else { return nil }
        let last = copies[root(found)] ?? found
        if let program = last.program?.name, !program.isEmpty {
            let days = programDays(all, program: program, copies: copies)
            if days.count > 1, let i = days.firstIndex(where: { root($0) == root(last) }) {
                return NextUp(runsheet: days[(i + 1) % days.count], reason: "Next in \(program)", lastAt: latest.startedDate)
            }
        }
        return NextUp(runsheet: last, reason: "Your last workout", lastAt: latest.startedDate)
    }

    // MARK: - The Up next card

    /// The one card to do next, and why it was picked. `UpNextPick` in next-up.ts.
    struct Pick: Hashable {
        /// `new`: yours and not done yet. `usual`: the one started most lately. `oldest`: done longest ago.
        enum Why: String { case new, usual, oldest }
        var id: String
        var why: Why
        /// For `usual`: this workout was `count` of the last `of` sessions.
        var count: Int?
        var of: Int?
    }

    /// How far back "started most" counts, and how lately done rules a workout out.
    static let usualDays = 28.0
    static let justDoneHours = 20.0

    /// Up next (Nick, review D2, 15 Nov 2026): a workout of yours not done yet comes first.
    /// Otherwise the workout started most in the last 28 days, at least twice, unless it was done
    /// in the last 20 hours, then the next most started. Done longest ago is only the fallback. A
    /// copy counts its original's sessions. Nil when nothing qualifies. The port of `pickUpNext`
    /// in next-up.ts; the Workouts tab and the home-screen widget both use it.
    static func pick(_ list: [Runsheet], own: Set<String>, results: [SessionResult], now: Date = Date()) -> Pick? {
        let rows = list.map { r -> (r: Runsheet, last: Date?, lately: Int) in
            let at = results.filter(r.owns).map(\.startedDate)
            return (r, at.max(), at.filter { $0 >= now.addingTimeInterval(-usualDays * 86_400) }.count)
        }
        if let fresh = rows.first(where: { own.contains($0.r.key) && $0.last == nil }) { return Pick(id: fresh.r.key, why: .new) }
        let justDone = now.addingTimeInterval(-justDoneHours * 3_600)
        // Most started first; between equals the one done longer ago, which keeps a rotation even.
        let usual = rows.filter { $0.lately >= 2 && ($0.last ?? now) < justDone }
            .min { a, b in a.lately != b.lately ? a.lately > b.lately : (a.last ?? now) < (b.last ?? now) }
        if let usual {
            let lastFive = results.filter { $0.activity == nil }.sorted { $0.startedAt > $1.startedAt }.prefix(5)
            return Pick(id: usual.r.key, why: .usual, count: lastFive.filter(usual.r.owns).count, of: lastFive.count)
        }
        return rows.compactMap { x in x.last.map { (x.r.key, $0) } }.min { $0.1 < $1.1 }.map { Pick(id: $0.0, why: .oldest) }
    }

    /// The label over the Up next card.
    static func badge(_ pick: Pick?) -> String { pick?.why == .usual ? "Up next · your usual" : "Up next" }

    /// "4 of your last 5" for the meta line, where the usual one was at least two of them.
    static func usualLine(_ pick: Pick?) -> String? {
        guard let pick, pick.why == .usual, let count = pick.count, let of = pick.of, count >= 2 else { return nil }
        return "\(count) of your last \(of)"
    }

    /// The workout a copy was made from, or the workout itself.
    static func root(_ r: Runsheet) -> String { r.copyOf ?? r.key }

    /// Your edited copy of each workout, by the id it was copied from. With two copies of one
    /// workout the later in the list wins, as a JavaScript Map keeps it on the web.
    static func copies(_ all: [Runsheet]) -> [String: Runsheet] {
        Dictionary(all.compactMap { r in r.copyOf.map { ($0, r) } }, uniquingKeysWith: { _, last in last })
    }

    /// A program's days in order, one per day: your copy of a day in place of the day, and never
    /// the day twice (the original and its copy, or two copies).
    static func programDays(_ all: [Runsheet], program: String, copies: [String: Runsheet]) -> [Runsheet] {
        var seen = Set<String>()
        let days = all.filter { $0.program?.name == program }.compactMap { r -> Runsheet? in
            guard seen.insert(root(r)).inserted else { return nil }
            return copies[root(r)] ?? r
        }
        // Stable, as JavaScript's sort is: days with the same order keep list order.
        return days.enumerated().sorted { a, b in
            let (x, y) = (a.element.program?.order ?? 0, b.element.program?.order ?? 0)
            return x != y ? x < y : a.offset < b.offset
        }.map(\.element)
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
