import Foundation

/// The Mine list on home and what each card says. Ported from `src/features/discover/mine.ts`.
enum Home {
    /// Your own workouts and the ones you saved, as one list without repeats. Your own not yet done
    /// come first, newest first (Nick, 18 Oct 2026: a workout just made for you is what to do
    /// next); then the rest by last done or made, whichever is later, newest first. A workout you
    /// have your own copy of shows as the copy only. `skip` leaves out what is already listed above
    /// (what your coach sent).
    static func mine(own: [Runsheet], all: [Runsheet], saved: Set<String>, results: [SessionResult], skip: Set<String> = []) -> [Runsheet] {
        let last = lastDone(results)
        let ownKeys = Set(own.map(\.key))
        let copied = Set((own + all).compactMap(\.copyOf))
        var seen = Set<String>()
        let list = (own + all.filter { saved.contains($0.key) }).filter { r in
            !copied.contains(r.key) && !skip.contains(r.key) && seen.insert(r.key).inserted
        }
        func fresh(_ r: Runsheet) -> Bool { ownKeys.contains(r.key) && lastDone(of: r, in: last) == nil }
        func recent(_ r: Runsheet) -> Date {
            max(lastDone(of: r, in: last) ?? .distantPast, r.createdAt.flatMap(ISO8601.date) ?? .distantPast)
        }
        // Stable, as JavaScript's sort is: ties keep list order.
        return list.enumerated().sorted { a, b in
            let (fa, fb) = (fresh(a.element), fresh(b.element))
            if fa != fb { return fa }
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

    /// "20 min · Medium · last done yesterday"; "20 min" when never done, where the badge says new.
    static func line(minutes: Int, level: String? = nil, lastDone: Date?, now: Date = Date()) -> String {
        (["\(minutes) min", level, lastDone.map { "last done \(daysAgo($0, now: now))" }] as [String?])
            .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
    }

    /// What is in it, by block name: "Swings · Incline press · Sprints · Abs". A loose exercise
    /// counts by its name; warm-up, cool-down, rests and included workouts are left out.
    static func contents(_ r: Runsheet) -> String {
        var names: [String] = []
        for item in r.items where (item.role ?? .main) == .main {
            let name: String
            switch item {
            case .block(let b): name = b.name.trimmingCharacters(in: .whitespaces)
            case .step(.exercise(let e)): name = e.exercise.name
            case .step(.rest), .ref: continue
            }
            if !name.isEmpty, names.last != name { names.append(name) }
        }
        return names.joined(separator: " · ")
    }

    /// The description's first sentence: why this workout, in one line.
    static func why(_ r: Runsheet) -> String? {
        guard let text = r.description?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else { return nil }
        if let end = text.range(of: #"[.!?](?=\s)"#, options: .regularExpression) {
            return String(text[..<end.upperBound])
        }
        return text
    }

    /// Made by a coach (an AI coach signs "AI Coach"), not by you.
    static func madeForYou(_ r: Runsheet) -> Bool {
        (r.creator ?? r.source?.author ?? "").range(of: #"\bcoach\b"#, options: [.regularExpression, .caseInsensitive]) != nil
    }

    /// The badge on a workout of yours not done yet.
    static func badge(_ r: Runsheet) -> String { madeForYou(r) ? "New · made for you" : "New" }

    /// The one card Mine accents as Up next: the first of your own not yet done, else the one done
    /// longest ago, which keeps the rotation even.
    static func upNext(_ list: [Runsheet], own: Set<String>, last: [String: Date]) -> String? {
        if let fresh = list.first(where: { own.contains($0.key) && lastDone(of: $0, in: last) == nil }) { return fresh.key }
        return list.compactMap { r in lastDone(of: r, in: last).map { (r.key, $0) } }.min { $0.1 < $1.1 }?.0
    }

    /// The Up next card first, the rest in their order (Nick, 27 Oct 2026). `upNextFirst` in mine.ts.
    static func upNextFirst<T>(_ list: [T], isNext: (T) -> Bool) -> [T] {
        guard let i = list.firstIndex(where: isNext) else { return list }
        return [list[i]] + list[..<i] + list[(i + 1)...]
    }

    /// What starting a Mine card records: `up_next` for the Up next card, else `mine` or `saved`.
    static func origin(of r: Runsheet, own: Set<String>, next: String?) -> SessionOrigin {
        r.key == next ? .upNext : own.contains(r.key) ? .mine : .saved
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
