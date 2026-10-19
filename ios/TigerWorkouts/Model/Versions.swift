import Foundation

/// What a session ran when it was not the workout as saved: its items, nothing else. Private to
/// the session's owner; never a workout of its own.
struct SessionVersion: Codable, Hashable, Sendable {
    var items: [Item]
}

/// Your versions of a workout (Nick, 19 Oct 2026: "keep one as base - but our model should allow
/// people to make edits and have those workouts saved as variants the user has done - but these
/// are not published"). The port of src/features/runsheet/versions.ts; folding one workout into
/// another (`mergeSessions`) is web-only.
enum Versions {
    /// The same JSON with every `id` and empty value left out and keys in order: two lists that
    /// read the same match.
    static func fingerprint(_ items: [Item]) -> String {
        guard let data = try? JSONEncoder().encode(items),
              let json = try? JSONSerialization.jsonObject(with: data),
              let out = try? JSONSerialization.data(withJSONObject: strip(json), options: [.sortedKeys]) else { return "" }
        return String(decoding: out, as: UTF8.self)
    }

    private static func strip(_ v: Any) -> Any {
        if let a = v as? [Any] { return a.map(strip) }
        if let o = v as? [String: Any] {
            return o.filter { $0.key != "id" && !($0.value is NSNull) }.mapValues(strip)
        }
        return v
    }

    /// The run's items with the loads the app filled in itself put back to the workout's own: a
    /// step whose load and incline are what the app started it on (last time's, a programme's next
    /// step, a % of a training max worked out) reads as the base has it. A load somebody set stays.
    static func unseeded(_ items: [Item], auto: Runsheet, base: Runsheet) -> [Item] {
        let was = Dictionary(auto.exerciseSteps.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        let own = Dictionary(base.exerciseSteps.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        func step(_ s: Step) -> Step {
            guard case .exercise(var e) = s, let a = was[e.id], let b = own[e.id],
                  a.exercise.key == e.exercise.key, e.target == a.target, e.incline == a.incline else { return s }
            e.target = b.target
            e.incline = b.incline
            e.targetPct = b.targetPct
            e.loadFactor = b.loadFactor
            return .exercise(e)
        }
        return items.map { item in
            switch item {
            case .block(var b):
                b.steps = b.steps.map(step)
                return .block(b)
            case .step(let s): return .step(step(s))
            case .ref: return item
            }
        }
    }

    /// A shared section (ref) the run inlined, put back as the ref: its steps carry `<ref id>:` ids
    /// (`Relative.resolveRefs`), and the ref goes where the first of them is. A version keeps the
    /// link, so Make base does not freeze somebody's warm-up into the workout.
    static func foldRefs(_ items: [Item], base: Runsheet) -> [Item] {
        let refs = base.items.compactMap { item -> RefItem? in
            if case .ref(let r) = item { return r }
            return nil
        }
        guard !refs.isEmpty else { return items }
        var seen = Set<String>()
        return items.compactMap { item in
            guard let ref = refs.first(where: { item.id.hasPrefix("\($0.id):") }) else { return item }
            guard seen.insert(ref.id).inserted else { return nil }
            return .ref(ref)
        }
    }

    /// What a session ran, when it was not the workout: `run` is the sheet the timer ended on,
    /// `auto` the same workout as the app would have started it untouched (refs inlined, loads
    /// filled in), `base` the workout as saved. Nil when only the app's own fill-ins differ.
    static func of(run: Runsheet, auto: Runsheet, base: Runsheet) -> SessionVersion? {
        let items = unseeded(foldRefs(run.items, base: base), auto: auto, base: base)
        return fingerprint(items) == fingerprint(unseeded(foldRefs(auto.items, base: base), auto: auto, base: base)) ? nil : SessionVersion(items: items)
    }

    /// What the workout page planned for the session it starts: the version it runs ("Just this
    /// time", a version run again), nil for the workout as it is. RootView takes it at Start.
    struct StartPlan: Equatable, Sendable {
        var key: String
        var version: SessionVersion?
    }

    /// The version a finished session keeps (iOS only). Run as started, it is what the page planned:
    /// never worked out from loads the app filled in, which move between the page opening and Start.
    /// Changed mid-session, or resumed (no plan), the run is compared with the plan as started, and a
    /// run that comes out as the workout itself has none.
    static func ofSession(run: Runsheet, started: Runsheet, auto: Runsheet, planned: SessionVersion?, base: Runsheet, resumed: Bool) -> SessionVersion? {
        if !resumed && run == started { return planned }
        var plan = base
        if let planned { plan.items = planned.items }
        guard let v = of(run: run, auto: auto, base: plan) else { return planned }
        return fingerprint(v.items) == fingerprint(base.items) ? nil : v
    }

    /// One version on the workout page: the newest session that ran it stands for it.
    struct Row: Identifiable, Hashable {
        var key: String
        var items: [Item]
        /// "Swings first · + Romanian deadlift" — what is different from the base.
        var changes: String
        var sessions: Int
        var lastDone: String
        var sessionId: String?
        var id: String { key }
    }

    /// The versions of `base` its sessions ran, newest first; one that matches the base now is not one.
    static func rows(_ results: [SessionResult], base: Runsheet, limit: Int = 6) -> [Row] {
        let now = fingerprint(base.items)
        var rows: [Row] = []
        for r in results.sorted(by: { $0.startedAt > $1.startedAt }) {
            guard r.runsheetId == base.key, let items = r.version?.items, !items.isEmpty else { continue }
            let key = fingerprint(items)
            guard key != now else { continue }
            if let i = rows.firstIndex(where: { $0.key == key }) {
                rows[i].sessions += 1
            } else {
                rows.append(Row(key: key, items: items, changes: changes(from: base.items, to: items), sessions: 1, lastDone: r.startedAt, sessionId: r.id))
            }
        }
        return Array(rows.prefix(limit))
    }

    /// What a version does differently, in at most three short parts.
    static func changes(from base: [Item], to version: [Item]) -> String {
        let a = Runsheet(title: "", items: base).exerciseSteps
        let b = Runsheet(title: "", items: version).exerciseSteps
        /// Keys in first-seen order with their counts, so the parts read in list order.
        func count(_ xs: [ExerciseStep]) -> [(key: String, n: Int)] {
            var out: [(key: String, n: Int)] = []
            for s in xs {
                if let i = out.firstIndex(where: { $0.key == s.exercise.key }) { out[i].n += 1 } else { out.append((s.exercise.key, 1)) }
            }
            return out
        }
        let ca = count(a)
        let cb = count(b)
        let na = Dictionary(ca.map { ($0.key, $0.n) }, uniquingKeysWith: +)
        let nb = Dictionary(cb.map { ($0.key, $0.n) }, uniquingKeysWith: +)
        var name: [String: String] = [:]
        for s in a + b { name[s.exercise.key] = s.exercise.name }
        var parts: [String] = []
        let orderA = a.filter { nb[$0.exercise.key] != nil }.map(\.exercise.key)
        let orderB = b.filter { na[$0.exercise.key] != nil }.map(\.exercise.key)
        if let firstA = orderA.first, let firstB = orderB.first, firstA != firstB {
            parts.append("\(name[firstB] ?? firstB) first")
        } else if orderA != orderB {
            parts.append("New order")
        }
        for (k, n) in cb where n > (na[k] ?? 0) { parts.append("+ \(name[k] ?? k)") }
        for (k, n) in ca where n > (nb[k] ?? 0) { parts.append("− \(name[k] ?? k)") }
        if parts.isEmpty { parts.append("Other sets, reps or loads") }
        return parts.count > 3 ? parts.prefix(3).joined(separator: " · ") + " · …" : parts.joined(separator: " · ")
    }
}
