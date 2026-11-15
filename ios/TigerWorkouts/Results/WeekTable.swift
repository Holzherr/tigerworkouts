import Foundation

/// A workout week by week (Priyanka via Nick, 15 Nov 2026: "Running the same workout ~4 weeks and
/// changing it as you go, you can't see what you did the week before"): one row per exercise and
/// set, one column per session of the workout and the workouts it was duplicated from or into,
/// each cell what was logged, set by set, with the change since the column before. Pure.
enum WeekTable {
    struct Column: Hashable, Identifiable {
        /// The session's row id.
        var id: String
        var startedAt: String
        /// "Wk 3": weeks counted from the week of the first session, Monday to Sunday.
        var week: Int
        /// The newest column: the one highlighted.
        var latest: Bool
        var runsheetId: String
        var label: String { "Wk \(week)" }
    }

    struct Cell: Hashable {
        var set: SetResult
        /// "100 × 8", "500 m in 1:52".
        var text: String
        /// "+5 kg", "+1 rep", "−2.5 kg · +2 reps"; nil when nothing changed or there is nothing before.
        var delta: String?
        /// Heavier, or more reps at the same load (more metres, calories or seconds): true. Lighter, or
        /// fewer reps at the same load: false. Nil when unchanged or not comparable.
        var better: Bool?
    }

    struct Row: Hashable, Identifiable {
        var exerciseKey: String
        var name: String
        /// 0-based working set number.
        var set: Int
        /// One per column, nil where that session has no such set.
        var cells: [Cell?]
        var id: String { "\(exerciseKey)#\(set)" }
    }

    struct Table: Hashable {
        var columns: [Column]
        var rows: [Row]
        var isEmpty: Bool { rows.isEmpty }
    }

    /// The ids whose sessions belong in this workout's table: its own, the original's for an edited
    /// copy (`lineage`), and every workout linked to it by ⋯ Duplicate (`duplicatedFrom`), back to week 1
    /// and on to the newest week.
    static func family(_ r: Runsheet, in workouts: [Runsheet]) -> Set<String> {
        var byKey: [String: Runsheet] = [:]
        for w in workouts { byKey[w.key] = w }
        byKey[r.key] = r
        var ids = Set<String>()
        var queue = [r.key]
        while let key = queue.popLast() {
            guard ids.insert(key).inserted else { continue }
            guard let w = byKey[key] else { continue }
            queue.append(contentsOf: w.lineage.dropFirst())
            if let from = w.duplicatedFrom { queue.append(from) }
            queue.append(contentsOf: workouts.filter { $0.duplicatedFrom == key }.map(\.key))
        }
        return ids
    }

    private static let calendar: Calendar = {
        var c = Calendar(identifier: .iso8601)
        c.timeZone = .current
        return c
    }()

    /// Working sets of one exercise in one session, in order: every row of that exercise (a step
    /// done twice, a swap) one after the other. Warm-ups are not the work, so they are left out.
    static func sets(_ r: SessionResult, exerciseKey: String, unit: String?) -> [SetResult] {
        r.steps.filter { $0.exerciseKey == exerciseKey }
            .flatMap { Logbook.sets(of: $0, unit: unit) }
            .filter { $0.isWorking && !Logbook.label($0).isEmpty }
    }

    /// The change from `a` to `b`, in what the set counts.
    static func delta(from a: SetResult, to b: SetResult, unit: String = "kg") -> (text: String?, better: Bool?) {
        func signed(_ d: Double, _ suffix: String) -> String { "\(d > 0 ? "+" : "−")\(Format.number(abs(d)))\(suffix)" }
        func plural(_ d: Double, _ word: String) -> String { abs(d) == 1 ? " \(word)" : " \(word)s" }
        for (x, y, suffix) in [(a.meters, b.meters, " m"), (a.calories, b.calories, " cal")] where x != nil || y != nil {
            guard let x, let y, x != y else { return (nil, nil) }
            return (signed(y - x, suffix), y > x)
        }
        var parts: [String] = []
        let dl = (b.load ?? 0) - (a.load ?? 0)
        let dr = (b.reps ?? 0) - (a.reps ?? 0)
        let u = unit.isEmpty ? "" : " \(unit)"
        if abs(dl) > 1e-9 { parts.append(signed(dl, u)) }
        if abs(dr) > 1e-9, a.reps != nil, b.reps != nil { parts.append(signed(dr, plural(dr, "rep"))) }
        if parts.isEmpty, let x = a.seconds, let y = b.seconds, abs(y - x) >= 1, a.reps == nil, b.reps == nil {
            return (signed(y - x, " s"), y > x)
        }
        guard !parts.isEmpty else { return (nil, nil) }
        let better: Bool? = abs(dl) > 1e-9 ? dl > 0 : dr > 0
        return (parts.joined(separator: " · "), better)
    }

    /// The table for a workout: columns oldest first, rows in the workout's exercise order (then any
    /// exercise only an older week had), each exercise's sets in order. `name` and `unit` resolve an
    /// exercise key (the library in the app).
    static func table(_ r: Runsheet, results: [SessionResult], workouts: [Runsheet] = [],
                      name: (String) -> String = { Library.shared.name($0) },
                      unit: (String) -> String? = { Library.shared.exercise($0)?.unit }) -> Table {
        let ids = family(r, in: workouts)
        let sessions = results
            .filter { ids.contains($0.runsheetId) && $0.activity == nil && !$0.steps.isEmpty }
            .sorted { $0.startedAt < $1.startedAt }
        guard let first = sessions.first else { return Table(columns: [], rows: []) }
        let start = calendar.dateInterval(of: .weekOfYear, for: first.startedDate)?.start ?? first.startedDate
        let columns = sessions.enumerated().map { i, s in
            let days = calendar.dateComponents([.day], from: start, to: s.startedDate).day ?? 0
            return Column(id: s.rowId, startedAt: s.startedAt, week: max(0, days) / 7 + 1, latest: i == sessions.count - 1, runsheetId: s.runsheetId)
        }

        // The workout's own order first, then exercises only older weeks did, in the order first done.
        var keys: [String] = []
        var names: [String: String] = [:]
        for s in r.exerciseSteps where !keys.contains(s.exercise.key) {
            keys.append(s.exercise.key)
            names[s.exercise.key] = s.exercise.name
        }
        for s in sessions { for x in s.steps where !keys.contains(x.exerciseKey) { keys.append(x.exerciseKey) } }

        var rows: [Row] = []
        for key in keys {
            let u = unit(key)
            let perSession = sessions.map { sets($0, exerciseKey: key, unit: u) }
            let count = perSession.map(\.count).max() ?? 0
            guard count > 0 else { continue }
            let shown = (u ?? "").replacingOccurrences(of: " per arm", with: "").replacingOccurrences(of: " per side", with: "").trimmingCharacters(in: .whitespaces)
            for n in 0..<count {
                var cells: [Cell?] = []
                var before: SetResult?
                for sets in perSession {
                    guard sets.indices.contains(n) else { cells.append(nil); continue }
                    let x = sets[n]
                    let d: (text: String?, better: Bool?) = before.map { delta(from: $0, to: x, unit: Measure.of(shown) == nil ? shown : "") } ?? (nil, nil)
                    cells.append(Cell(set: x, text: Logbook.label(x), delta: d.text, better: d.better))
                    before = x
                }
                rows.append(Row(exerciseKey: key, name: names[key] ?? name(key), set: n, cells: cells))
            }
        }
        return Table(columns: columns, rows: rows)
    }
}
