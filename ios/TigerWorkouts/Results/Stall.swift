import Foundation

/// Stalls: an exercise (or a scored workout) whose best has not moved for a while, and two concrete
/// ways out. History, not intelligence: the best set per session, the last session that set a
/// record, and how many sessions and weeks have passed since without beating it. Shown in place —
/// the logbook page, one line on the Up next card — and a dismissed one stays dismissed. Pure;
/// ported one for one from `src/features/results/stall.ts`.
enum Stall {
    /// The record session and at least three after it that did not beat it…
    static let sessions = 4
    /// …spread over at least three weeks…
    static let days: Double = 21
    /// …and the newest of them recent enough to matter.
    static let freshDays: Double = 28

    private static let day: TimeInterval = 86_400

    struct Plateau: Hashable {
        /// startedAt of the session that set the standing best.
        var since: String
        /// Sessions from that one to the newest, both counted.
        var sessions: Int
        var weeks: Int
        /// Index into the points of the session that set it.
        var index: Int
    }

    struct Point: Hashable { var at: String; var value: Double }

    /// Where a series stopped improving. Points are oldest first; a tie does not count as progress.
    static func plateau(_ points: [Point], now: Date, lowerIsBetter: Bool = false) -> Plateau? {
        guard points.count >= sessions else { return nil }
        var k = 0
        var best = points[0].value
        for (i, p) in points.enumerated() where i > 0 && (lowerIsBetter ? p.value < best : p.value > best) {
            best = p.value
            k = i
        }
        let count = points.count - k
        let first = ISO8601.date(points[k].at) ?? .distantPast
        let last = ISO8601.date(points[points.count - 1].at) ?? .distantPast
        guard count >= sessions, last.timeIntervalSince(first) >= days * day, now.timeIntervalSince(last) <= freshDays * day else { return nil }
        return Plateau(since: points[k].at, sessions: count, weeks: Int((now.timeIntervalSince(first) / (7 * day)).rounded(.down)), index: k)
    }

    struct Option: Hashable, Identifiable {
        /// "Drop to 20 kg and build to 12 reps".
        var title: String
        var detail: String
        /// Set when the option is another exercise, so the page can link it.
        var exerciseKey: String?
        var id: String { title }
    }

    struct Found: Hashable, Identifiable {
        /// Stable while the same best stands: what a dismissal is keyed on.
        var id: String
        var exerciseKey: String?
        var runsheetId: String?
        /// "24 kg × 8", "8 rounds", "11:40".
        var best: String
        var sessions: Int
        var weeks: Int
        /// "At 24 kg × 8 for 5 weeks".
        var line: String
        var options: [Option]
    }

    struct Swap: Hashable {
        var key: String
        var name: String
        var target: Double?
        var unit: String?
    }

    /// Uncapped Epley, so reps banked past 10 still read as progress.
    private static func strength(_ x: SetResult) -> Double? {
        guard let load = x.load, load > 0, let reps = x.reps, reps > 0 else { return nil }
        return reps == 1 ? load : load * (1 + reps / 30)
    }

    private static func weeksText(_ w: Int) -> String { w == 1 ? "a week" : "\(w) weeks" }

    /// An exercise's stall and its two options: build back from lighter (or, for bodyweight, more
    /// sets of fewer reps), and swap to `swap` for three weeks — or, with no swap, heavier for fewer.
    static func exercise(_ results: [SessionResult], exercise: ExerciseRef, now: Date, swap: Swap? = nil) -> Found? {
        let history = Array(Logbook.history(results, exerciseKey: exercise.key).reversed())
        let kind = Logbook.kind(history)
        guard kind != .rounds else { return nil }
        func pick(_ sets: [SetResult]) -> (value: Double, set: SetResult)? {
            var out: (value: Double, set: SetResult)?
            for x in sets {
                let v: Double? = switch kind {
                case .strength: strength(x)
                case .load: x.load
                default: x.reps
                }
                if let v, v > 0, out == nil || v > out!.value { out = (v, x) }
            }
            return out
        }
        let bests = history.compactMap { s in pick(s.sets).map { (at: s.startedAt, best: $0) } }
        guard let p = plateau(bests.map { Point(at: $0.at, value: $0.best.value) }, now: now) else { return nil }
        // Bodyweight reps that never vary are a prescribed count in a circuit (Cindy's 10 push-ups a
        // round), not a max effort that stopped moving.
        let window = history.filter { $0.startedAt >= p.since }.flatMap(\.sets).map(\.reps)
        if kind == .reps, window.allSatisfy({ $0 == window.first ?? nil }) { return nil }
        let set = bests[p.index].best.set
        let unit = exercise.unit.replacingOccurrences(of: " per arm", with: "").replacingOccurrences(of: " per side", with: "").trimmingCharacters(in: .whitespaces)
        let u = unit.isEmpty ? "" : " \(unit)"
        let step = exercise.step > 0 ? exercise.step : 2.5
        let n = Format.number
        let best: String = switch kind {
        case .strength: "\(n(set.load ?? 0))\(u) × \(n(set.reps ?? 0))"
        case .load: "\(n(set.load ?? 0))\(u)"
        default: "\(n(set.reps ?? 0)) reps"
        }
        let back = "Then come back to \(exercise.name)."
        let swapOption: Option? = swap.map { s in
            let start = s.target.map { "Start around \(n($0))\(s.unit.map { " \($0)" } ?? ""). " } ?? ""
            return Option(title: "Swap to \(s.name) for three weeks", detail: "\(start)\(back)", exerciseKey: s.key)
        }
        var options: [Option]
        if kind == .reps {
            let r = set.reps ?? 0
            options = [
                Option(title: "Do 5 sets of \(n(max(1, (r * 0.6).rounded(.up)))) for three weeks", detail: "More sets, fewer reps each, then test a max set again."),
                swapOption ?? Option(title: "Add a 3 s pause at the bottom for three weeks", detail: "Same reps, slower. Then test a max set again."),
            ]
        } else {
            let load = set.load ?? 0
            let lower = max(step, min(load - step, ((load * 0.9) / step).rounded(.down) * step))
            let lighter = (lower * 100).rounded() / 100
            let heavier = ((load + step) * 100).rounded() / 100
            if kind == .strength {
                let r = set.reps ?? 0
                options = [
                    Option(title: "Drop to \(n(lighter))\(u) and build to \(n(r + 4)) reps", detail: "A rep a session, then back to \(n(load))\(u)."),
                    swapOption ?? Option(title: "Go heavier for three weeks: \(n(heavier))\(u) × \(n(max(3, r - 3)))", detail: "Fewer reps at the next load up, then back to \(n(r))."),
                ]
            } else {
                options = [
                    Option(title: "Drop to \(n(lighter))\(u) and add a set", detail: "Build the sets back, then return to \(n(load))\(u)."),
                    swapOption ?? Option(title: "Hold \(n(load))\(u) and add a round each week", detail: "Three weeks of more work at the same number."),
                ]
            }
        }
        return Found(id: "x:\(exercise.key)@\(p.since)", exerciseKey: exercise.key, runsheetId: nil, best: best,
                     sessions: p.sessions, weeks: p.weeks, line: "At \(best) for \(weeksText(p.weeks))", options: options)
    }

    /// The same, with the swap taken from the alternatives data: the first option for this exercise
    /// that takes a load at its standing best, else the first option.
    static func exercise(_ results: [SessionResult], key: String, now: Date = Date()) -> Found? {
        let ref = Library.shared.exercise(key)?.ref ?? .placeholder(key: key)
        guard let plain = exercise(results, exercise: ref, now: now) else { return nil }
        let bestLoad = Logbook.history(results, exerciseKey: key).flatMap(\.sets).compactMap(\.load).max()
        let step = ExerciseStep(id: "stall", exercise: ref, target: bestLoad, forMode: .reps, forValue: 8)
        // One that carries the load over first: a bench stall is better met by a machine than a dip.
        let options = Alternatives.options(for: step, limit: 20)
        guard let alt = options.first(where: { $0.target != nil }) ?? options.first else { return plain }
        let unit = alt.exercise.unit.replacingOccurrences(of: " per arm", with: "").replacingOccurrences(of: " per side", with: "").trimmingCharacters(in: .whitespaces)
        return exercise(results, exercise: ref, now: now, swap: Swap(key: alt.exercise.key, name: alt.exercise.name, target: alt.target, unit: unit.isEmpty ? nil : unit))
    }

    /// A scored workout's stall: rounds or reps that stopped going up, a time that stopped coming down.
    static func workout(_ r: Runsheet, results: [SessionResult], now: Date = Date()) -> Found? {
        let type = r.effectiveScore
        guard type == .rounds || type == .time || type == .reps else { return nil }
        let pts = results
            .filter { $0.runsheetId == r.key && $0.activity == nil && ($0.score ?? 0) > 0 && (type != .time || $0.completed != false) }
            .sorted { $0.startedAt < $1.startedAt }
            .map { Point(at: $0.startedAt, value: $0.score ?? 0) }
        guard let p = plateau(pts, now: now, lowerIsBetter: type == .time) else { return nil }
        let value = pts[p.index].value
        let block = Targets.mainBlock(r)
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_GB")
        f.dateFormat = "d MMM"
        let park = Option(title: "Park it for three weeks, retest on \(f.string(from: now.addingTimeInterval(21 * day)))", detail: "Something else in its slot; come back fresh.")
        let clock = Targets.clock
        var best: String
        var pace: Option
        switch type {
        case .time:
            best = clock(value)
            let n = block?.runMode == .ladder ? (block?.ladder?.count ?? 0) : (block?.repeatCount ?? 0)
            pace = n > 1
                ? Option(title: "Even pace: \(clock((value - 5) / Double(n))) a round", detail: "Hold it from the first round, no faster, to finish under \(clock(value)).")
                : Option(title: "Scale the load and chase the time", detail: "A step lighter for three weeks, then back to it.")
        case .rounds:
            let whole = value.rounded(.down)
            best = "\(Int(whole)) rounds"
            if block?.runMode == .amrap, let cap = block?.timeCapSec, cap > 0 {
                pace = Option(title: "Even pace: \(clock(cap / (whole + 1))) a round", detail: "Hold it from the first round, no faster, for \(Int(whole) + 1).")
            } else {
                pace = Option(title: "Scale the load and chase the rounds", detail: "A step lighter for three weeks, then back to it.")
            }
        default:
            best = "\(Format.number(value)) reps"
            pace = Option(title: "Break it into sets from the start", detail: "Stop two reps short of failure every set, rest 10 s.")
        }
        return Found(id: "w:\(r.key)@\(p.since)", exerciseKey: nil, runsheetId: r.key, best: best, sessions: p.sessions,
                     weeks: p.weeks, line: "At \(best) for \(weeksText(p.weeks))", options: [pace, park])
    }
}

/// Dismissed stalls, by id, on this phone. A dismissed stall comes back only as a new stall — a new
/// best that then stands still again.
enum StallDismissals {
    static let key = "stallsDismissed"
    static func all(_ defaults: UserDefaults = .standard) -> Set<String> { Set(defaults.stringArray(forKey: key) ?? []) }
    static func contains(_ id: String, _ defaults: UserDefaults = .standard) -> Bool { all(defaults).contains(id) }
    static func dismiss(_ id: String, _ defaults: UserDefaults = .standard) {
        defaults.set(Array(all(defaults).union([id])).sorted(), forKey: key)
    }
}
