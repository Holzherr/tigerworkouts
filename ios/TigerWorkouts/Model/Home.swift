import Foundation

/// The Mine list on home and its one meta line. Ported from `src/features/discover/mine.ts`.
enum Home {
    /// Your own workouts and the ones you saved, as one list without repeats: last done or made,
    /// whichever is later, newest first, so a workout just made sits on top until you do it. A
    /// workout you have your own copy of shows as the copy only. `skip` leaves out what is already
    /// listed above (what your coach sent).
    static func mine(own: [Runsheet], all: [Runsheet], saved: Set<String>, results: [SessionResult], skip: Set<String> = []) -> [Runsheet] {
        let last = lastDone(results)
        let copied = Set((own + all).compactMap(\.copyOf))
        var seen = Set<String>()
        let list = (own + all.filter { saved.contains($0.key) }).filter { r in
            !copied.contains(r.key) && !skip.contains(r.key) && seen.insert(r.key).inserted
        }
        func recent(_ r: Runsheet) -> Date {
            max(lastDone(of: r, in: last) ?? .distantPast, r.createdAt.flatMap(ISO8601.date) ?? .distantPast)
        }
        // Stable, as JavaScript's sort is: ties keep list order.
        return list.enumerated().sorted { a, b in
            let (x, y) = (recent(a.element), recent(b.element))
            return x != y ? x > y : a.offset < b.offset
        }.map(\.element)
    }

    /// The latest session of each workout id.
    static func lastDone(_ results: [SessionResult]) -> [String: Date] {
        results.reduce(into: [:]) { m, r in m[r.runsheetId] = max(m[r.runsheetId] ?? .distantPast, r.startedDate) }
    }

    /// The latest session of this workout or of the one it was copied from.
    static func lastDone(of r: Runsheet, in last: [String: Date]) -> Date? {
        r.lineage.compactMap { last[$0] }.max()
    }

    /// "20 min · last done yesterday", "20 min · new" for your own not yet done, else "20 min".
    static func line(minutes: Int, lastDone: Date?, isNew: Bool, now: Date = Date()) -> String {
        if let lastDone { return "\(minutes) min · last done \(daysAgo(lastDone, now: now))" }
        return isNew ? "\(minutes) min · new" : "\(minutes) min"
    }

    /// "today", "yesterday", "3 days ago", "2 weeks ago": `daysAgo` in rollup.ts.
    static func daysAgo(_ date: Date, now: Date = Date(), calendar: Calendar = .current) -> String {
        let d = calendar.dateComponents([.day], from: calendar.startOfDay(for: date), to: calendar.startOfDay(for: now)).day ?? 0
        if d <= 0 { return "today" }
        if d == 1 { return "yesterday" }
        if d < 14 { return "\(d) days ago" }
        return "\(d / 7) weeks ago"
    }
}
