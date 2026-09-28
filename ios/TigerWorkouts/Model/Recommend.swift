import Foundation

/// Recommendations from what the user has already done: the port of
/// `src/features/discover/recommend.ts`, rule for rule. Pure: takes the catalogue, results (newest
/// first) and saved ids, returns ranked picks with a one-line reason. Cold start falls back to a
/// curated mix.
///
/// With history, a workout gets in only if its creator has at least two sessions in history, or it
/// shares at least two exercises with history, or it is saved and not done, or it is the next day
/// of a program in progress. A creator done twice outranks any exercise overlap. Mid-program days
/// of an unstarted program never show. Sorts are stable, as JavaScript's are, so ties keep
/// catalogue order on both platforms.
struct Recommendation: Hashable {
    var runsheet: Runsheet
    var reason: String
    var score: Double
}

enum Recommend {
    /// Sessions a creator needs in history before their other workouts count as "more from them".
    static let creatorSessions = 2
    /// Shared exercises a workout needs to get in on overlap alone.
    static let minOverlap = 2

    private static func author(_ r: Runsheet) -> String { r.source?.author ?? r.creator ?? "" }

    /// Exercise keys in the order they first appear, like a JS Set.
    private static func exerciseKeys(_ r: Runsheet) -> [String] {
        var seen = Set<String>()
        return r.exerciseSteps.map(\.exercise.key).filter { seen.insert($0).inserted }
    }

    private static func stableSorted<T>(_ xs: [T], by before: (T, T) -> Bool) -> [T] {
        xs.enumerated().sorted { a, b in
            if before(a.element, b.element) { return true }
            if before(b.element, a.element) { return false }
            return a.offset < b.offset
        }.map(\.element)
    }

    static func recommend(_ all: [Runsheet], results: [SessionResult], saved: [String] = [], limit: Int = 6) -> [Recommendation] {
        let byId = Dictionary(all.map { ($0.key, $0) }, uniquingKeysWith: { first, _ in first })
        let done = results.compactMap { byId[$0.runsheetId] }
        let doneIds = Set(results.map(\.runsheetId))
        let recent = Set(results.prefix(5).map(\.runsheetId))

        if done.isEmpty {
            func pick(_ pred: (Runsheet) -> Bool, _ reason: String) -> [Recommendation] {
                all.first(where: pred).map { [Recommendation(runsheet: $0, reason: reason, score: 1)] } ?? []
            }
            let picks: [Recommendation] = pick({ ($0.source?.kind ?? "user") == "user" }, "Made for you")
                + pick({ $0.title == "Cindy" }, "A classic 20-minute AMRAP to set a baseline")
                + pick({ $0.program?.name == "Couch to 5K" && $0.program?.order == 1 }, "Start running, three short sessions a week")
                + pick({ $0.source?.kind == "video" && $0.minutes <= 15 }, "A short follow-along to try the player")
                + pick({ ($0.program?.name.hasPrefix("StrongLifts") ?? false) && $0.program?.order == 1 }, "The simplest strength program: three lifts, add weight every session")
                + pick({ $0.title.contains("7-Minute") }, "Seven minutes, no equipment")
            return Array(picks.prefix(limit))
        }

        // signals from history
        var authors: [String: Int] = [:]
        var kinds: [String: Int] = [:]
        var keys: [String: Int] = [:]
        var minutes = 0
        for r in done {
            authors[author(r), default: 0] += 1
            kinds[r.source?.kind ?? "user", default: 0] += 1
            for key in exerciseKeys(r) { keys[key, default: 0] += 1 }
            minutes += r.minutes
        }
        let avgMin = Double(minutes) / Double(done.count)

        // next session of any program in progress; programs with no session yet only ever offer day 1
        var programNext: [Recommendation] = []
        var started = Set<String>()
        var programOrder: [String] = []
        var programs: [String: [Runsheet]] = [:]
        for r in all {
            guard let name = r.program?.name else { continue }
            if programs[name] == nil { programOrder.append(name) }
            programs[name, default: []].append(r)
        }
        for name in programOrder {
            let sorted = stableSorted(programs[name] ?? []) { ($0.program?.order ?? 0) < ($1.program?.order ?? 0) }
            guard let lastDone = results.first(where: { x in sorted.contains { $0.key == x.runsheetId } }) else { continue }
            started.insert(name)
            let i = sorted.firstIndex { $0.key == lastDone.runsheetId } ?? 0
            programNext.append(Recommendation(runsheet: sorted[(i + 1) % sorted.count], reason: "Next in \(name)", score: 100))
        }

        var scored: [Recommendation] = []
        for r in all {
            let rid = r.key
            if recent.contains(rid) || programNext.contains(where: { $0.runsheet.key == rid }) { continue }
            if let p = r.program, !started.contains(p.name), p.order != 1 { continue }
            let a = author(r)
            let sessions = a.isEmpty ? 0 : (authors[a] ?? 0)
            let shared = exerciseKeys(r).filter { keys[$0] != nil }
            let savedNotDone = saved.contains(rid) && !doneIds.contains(rid)
            if sessions < creatorSessions && shared.count < minOverlap && !savedNotDone { continue }
            var s = 0.0
            var reasons: [(Double, String)] = []
            if sessions >= creatorSessions {
                s += Double(10 * sessions)
                reasons.append((Double(10 * sessions), "More from \(a)"))
            }
            if let k = kinds[r.source?.kind ?? "user"] { s += Double(k) }
            if !shared.isEmpty {
                s += Double(shared.count * 2)
                let mostDone = stableSorted(shared) { keys[$0]! > keys[$1]! }[0]
                if let like = done.first(where: { exerciseKeys($0).contains(mostDone) }) {
                    reasons.append((Double(shared.count * 2), "Because you did \(like.title)"))
                }
            }
            if abs(Double(r.minutes) - avgMin) <= 5 {
                s += 2
                reasons.append((1, "About \(r.minutes) min, like your usual"))
            }
            if savedNotDone {
                s += 4
                reasons.append((4, "Saved and not done yet"))
            }
            if doneIds.contains(rid) {
                s += 1
                reasons.append((0.5, "Beat your last score"))
            }
            let best = stableSorted(reasons) { $0.0 > $1.0 }.first?.1
            scored.append(Recommendation(runsheet: r, reason: best ?? "Popular", score: s))
        }
        scored = stableSorted(scored) { $0.score > $1.score }
        // keep the list varied: at most 3 per author
        var perAuthor: [String: Int] = [:]
        var out = programNext
        for rec in scored {
            if out.count >= limit { break }
            let a = author(rec.runsheet)
            if perAuthor[a, default: 0] >= 3 { continue }
            perAuthor[a, default: 0] += 1
            out.append(rec)
        }
        return Array(out.prefix(limit))
    }

    /// Consecutive picks with the same reason share one header, as on the web.
    static func grouped(_ recs: [Recommendation]) -> [(reason: String, picks: [Recommendation])] {
        var out: [(reason: String, picks: [Recommendation])] = []
        for r in recs {
            if let last = out.last, last.reason == r.reason { out[out.count - 1].picks.append(r) } else { out.append((r.reason, [r])) }
        }
        return out
    }
}
