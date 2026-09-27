import Foundation

/// Recommendations from what the user has already done. Ported one for one from
/// `src/features/discover/recommend.ts`, the way Runner.swift follows runner.ts: change one, change
/// the other, and port the test. Pure: takes the catalogue, results and saved ids, returns ranked
/// picks with a one-line reason. Cold start falls back to a curated mix.
///
/// With history, a workout gets in only if its creator has at least two sessions in history, or it
/// shares at least two exercises with history, or it is saved and not done, or it is the next day of
/// a program in progress. A creator done twice outranks any exercise overlap, so one sampled
/// benchmark never reopens its whole source. Mid-program days of an unstarted program never show.
struct Recommendation: Hashable {
    var runsheet: Runsheet
    /// "Next in StrongLifts 5×5", "More from Coach A", "Because you did Fran".
    var reason: String
    var score: Double
}

/// Sessions a creator needs in history before their other workouts count as "more from them".
private let creatorSessions = 2
/// Shared exercises a workout needs to get in on overlap alone.
private let minOverlap = 2

/// Exercise keys in order of first appearance, blocks flattened, refs skipped — the TS Set's order.
private func exerciseKeys(_ r: Runsheet) -> [String] {
    var seen: Set<String> = []
    return r.exerciseSteps.map(\.exercise.key).filter { seen.insert($0).inserted }
}
private func author(_ r: Runsheet) -> String { r.source?.author ?? r.creator ?? "" }
private func kind(_ r: Runsheet) -> String { r.source?.kind ?? "user" }

/// `results` in any order; the web hands them in newest first and this sorts to match.
func recommend(all: [Runsheet], results unsorted: [SessionResult], saved: Set<String> = [], limit: Int = 6) -> [Recommendation] {
    let results = unsorted.sorted { $0.startedAt > $1.startedAt }
    let byId = Dictionary(all.map { ($0.key, $0) }, uniquingKeysWith: { first, _ in first })
    let done = results.compactMap { byId[$0.runsheetId] }
    let doneIds = Set(results.map(\.runsheetId))
    let recent = Set(results.prefix(5).map(\.runsheetId))

    if done.isEmpty {
        func pick(_ reason: String, _ pred: (Runsheet) -> Bool) -> [Recommendation] {
            all.first(where: pred).map { [Recommendation(runsheet: $0, reason: reason, score: 1)] } ?? []
        }
        let curated: [[Recommendation]] = [
            pick("Made for you") { kind($0) == "user" },
            pick("A classic 20-minute AMRAP to set a baseline") { $0.title == "Cindy" },
            pick("Start running, three short sessions a week") { $0.program?.name == "Couch to 5K" && $0.program?.order == 1 },
            pick("A short follow-along to try the player") { $0.source?.kind == "video" && $0.minutes <= 15 },
            pick("The simplest strength program: three lifts, add weight every session") { ($0.program?.name.hasPrefix("StrongLifts") ?? false) && $0.program?.order == 1 },
            pick("Seven minutes, no equipment") { $0.title.contains("7-Minute") },
        ]
        return Array(curated.flatMap { $0 }.prefix(limit))
    }

    // signals from history
    var authors: [String: Int] = [:]
    var kinds: [String: Int] = [:]
    var keys: [String: Int] = [:]
    var minutes = 0
    for r in done {
        authors[author(r), default: 0] += 1
        kinds[kind(r), default: 0] += 1
        for key in exerciseKeys(r) { keys[key, default: 0] += 1 }
        minutes += r.minutes
    }
    let avgMin = Double(minutes) / Double(done.count)

    // next session of any program in progress; programs with no session yet only ever offer day 1
    var programNext: [Recommendation] = []
    var started: Set<String> = []
    var programs: [String: [Runsheet]] = [:]
    var programOrder: [String] = [] // first appearance in the catalogue, the TS Map's iteration order
    for r in all {
        guard let p = r.program else { continue }
        if programs[p.name] == nil { programOrder.append(p.name) }
        programs[p.name, default: []].append(r)
    }
    for name in programOrder {
        let sorted = (programs[name] ?? []).sorted { ($0.program?.order ?? 0) < ($1.program?.order ?? 0) }
        guard let lastDone = results.first(where: { x in sorted.contains { $0.key == x.runsheetId } }),
              let i = sorted.firstIndex(where: { $0.key == lastDone.runsheetId }) else { continue }
        started.insert(name)
        programNext.append(Recommendation(runsheet: sorted[(i + 1) % sorted.count], reason: "Next in \(name)", score: 100))
    }

    var scored: [Recommendation] = []
    for r in all {
        let rid = r.key
        if recent.contains(rid) || programNext.contains(where: { $0.runsheet.key == rid }) { continue }
        if let p = r.program, !started.contains(p.name), p.order != 1 { continue }
        let a = author(r)
        let creatorCount = a.isEmpty ? 0 : (authors[a] ?? 0)
        let shared = exerciseKeys(r).filter { keys[$0] != nil }
        let savedNotDone = saved.contains(rid) && !doneIds.contains(rid)
        if creatorCount < creatorSessions && shared.count < minOverlap && !savedNotDone { continue }
        var s = 0.0
        var reasons: [(weight: Double, text: String)] = []
        if creatorCount >= creatorSessions {
            s += Double(10 * creatorCount)
            reasons.append((Double(10 * creatorCount), "More from \(a)"))
        }
        if let n = kinds[kind(r)] { s += Double(n) }
        if !shared.isEmpty {
            s += Double(shared.count * 2)
            // The most-done shared exercise; on a tie the first in the sheet, as the TS stable sort picks.
            if let mostDone = shared.max(by: { (keys[$0] ?? 0) < (keys[$1] ?? 0) }),
               let like = done.first(where: { exerciseKeys($0).contains(mostDone) }) {
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
        // max(by:) keeps the first of equal weights, as the TS stable sort does.
        let best = reasons.max { $0.weight < $1.weight }
        scored.append(Recommendation(runsheet: r, reason: best?.text ?? "Popular", score: s))
    }
    scored.sort { $0.score > $1.score }
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
