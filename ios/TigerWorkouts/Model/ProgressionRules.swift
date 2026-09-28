import Foundation

/// A program's load rules applied to the next session: +`onSuccessKg` after a clean session, the
/// same weight after a miss, the deload after `failAfter` misses in a row (and again after as many
/// more). The web's result sheet
/// shows these as "next time"; this is where they take effect, on both apps. The port of
/// `workingLoad`, `failStreak`, the load half of `nextLoads` and `progressed` in progression.ts.
enum ProgressionRules {
    /// The load a step was worked at. `target` is the last working set's load, so a drop set at the
    /// end (100 then 60) would make 60 the next start; the last set that was not a drop stands in
    /// then. A `target` edited after the session matches no set and is kept.
    static func workingLoad(_ s: StepResult) -> Double? {
        let sets = s.sets ?? []
        guard let target = s.target, sets.contains(where: { $0.type == .drop && $0.load == target }) else { return s.target }
        return sets.last(where: { $0.type != .drop && $0.type != .warmup && $0.load != nil })?.load ?? target
    }

    /// Consecutive failed sessions of one exercise, newest first.
    static func failStreak(_ history: [SessionResult], exerciseKey: String) -> Int {
        var n = 0
        for h in history.sorted(by: { $0.startedAt > $1.startedAt }) {
            guard let r = h.steps.first(where: { $0.exerciseKey == exerciseKey }), let ok = r.success else { continue }
            if ok { break }
            n += 1
        }
        return n
    }

    /// What the rule makes of the last session of this exercise; nil when it says nothing.
    static func nextLoad(_ step: ExerciseStep, rule: Progression, last: StepResult, history: [SessionResult], kit: Equipment?) -> Double? {
        guard let ok = last.success, let from = workingLoad(last) else { return nil }
        if ok, let add = rule.onSuccessKg {
            let up = Plates.snap(from + add, step.exercise, kit, .up)
            return up > from ? up : (Plates.nextUp(from, step.exercise, kit) ?? from)
        }
        if !ok, let pct = rule.deloadPct, let after = rule.failAfter, after > 0 {
            // A deload falls on every `failAfter`-th miss of the streak: the session after one
            // starts at the lighter weight, and its misses count towards the next.
            let streak = failStreak(history, exerciseKey: step.exercise.key)
            return streak > 0 && streak % after == 0
                ? Plates.snap(from * (1 - pct / 100), step.exercise, kit)
                : from
        }
        return nil
    }

    /// One "Next time" line from a program's rules: the load now and what the rule makes of it.
    /// A training-max bump moves the TM, not a load (`tmBump`).
    struct NextLoad: Hashable, Identifiable {
        var exerciseKey: String
        var name: String
        var from: Double?
        var to: Double?
        var reason: String
        var tmBump = false
        var id: String { exerciseKey }
    }

    /// The finish screen's lines for ruled exercises, the port of `nextLoads` in progression.ts:
    /// +`onSuccessKg` after Made it, the same weight after Missed, the deload on every
    /// `failAfter`-th miss, and a training max bumped by an AMRAP set that reached `amrapBumpAt`.
    /// `history` may hold `last` already; it is matched by id, not counted twice.
    static func nextLoads(_ r: Runsheet, last: SessionResult, history: [SessionResult], maxes: [String: Double] = [:], kit: Equipment? = nil) -> [NextLoad] {
        var out: [NextLoad] = []
        var seen = Set<String>()
        let blocks = r.items.compactMap(\.asBlock)
        for s in r.exerciseSteps {
            let key = s.exercise.key
            guard seen.insert(key).inserted else { continue }
            guard let rule = blocks.first(where: { $0.steps.contains { $0.id == s.id } })?.progression ?? r.progression else { continue }
            guard let res = last.steps.first(where: { $0.stepId == s.id || $0.exerciseKey == key }) else { continue }
            let from = workingLoad(res) ?? Relative.target(s, maxes: maxes, bodyweightKg: nil, kit: kit)
            if s.forMode == .amrap, let at = rule.amrapBumpAt, let bump = rule.tmBumpKg, bump != 0,
               let reps = res.reps?.last, reps >= Double(at) {
                let tm = maxes[key]
                out.append(NextLoad(exerciseKey: key, name: s.exercise.name, from: tm, to: tm.map { $0 + bump },
                                    reason: "\(Format.number(reps)) reps on the \(Format.number(s.forValue))+ set: training max +\(Format.number(bump)) kg", tmBump: true))
                continue
            }
            guard let ok = res.success, let from else { continue }
            if ok, let add = rule.onSuccessKg, add != 0 {
                let up = Plates.snap(from + add, s.exercise, kit, .up)
                let to = up > from ? up : (Plates.nextUp(from, s.exercise, kit) ?? from)
                let reason = to == from
                    ? "all sets done: already the heaviest you own"
                    : "all sets done: +\(Format.number(add)) kg" + (abs(to - from - add) > 1e-6 ? ", \(Format.number(to)) kg is the next you can load" : "")
                out.append(NextLoad(exerciseKey: key, name: s.exercise.name, from: from, to: to, reason: reason))
            } else if !ok, let pct = rule.deloadPct, pct != 0, let after = rule.failAfter, after > 0 {
                let streak = failStreak([last] + history.filter { !Celebrate.same($0, last) }, exerciseKey: key)
                let since = streak % after
                if streak > 0 && since == 0 {
                    out.append(NextLoad(exerciseKey: key, name: s.exercise.name, from: from, to: Plates.snap(from * (1 - pct / 100), s.exercise, kit),
                                        reason: "\(after) failed sessions: deload \(Format.number(pct))%"))
                } else {
                    out.append(NextLoad(exerciseKey: key, name: s.exercise.name, from: from, to: from, reason: "missed reps (\(since)/\(after)): repeat the weight"))
                }
            }
        }
        return out
    }

    /// The workout loaded as its rules say, from the latest session that did each ruled exercise
    /// (in any workout, so day A's squat carries into day B). Loads from a training max or
    /// bodyweight are left to those.
    static func progressed(_ r: Runsheet, results: [SessionResult], kit: Equipment?) -> Runsheet {
        guard !results.isEmpty else { return r }
        let newest = results.sorted { $0.startedAt > $1.startedAt }
        var memo: [String: Double?] = [:]
        func load(_ e: ExerciseStep, rule: Progression?) -> ExerciseStep {
            guard let rule, e.target != nil, e.targetPct == nil, e.loadFactor == nil else { return e }
            let key = e.exercise.key
            if memo[key] == nil {
                memo[key] = newest.lazy
                    .compactMap { h in h.steps.first { $0.exerciseKey == key && $0.success != nil } }
                    .first
                    .flatMap { nextLoad(e, rule: rule, last: $0, history: newest, kit: kit) }
            }
            guard let to = memo[key] ?? nil else { return e }
            var e = e
            e.target = to
            return e
        }
        var out = r
        out.items = r.items.map { item in
            switch item {
            case .block(var b):
                let rule = b.progression ?? r.progression
                b.steps = b.steps.map { if case .exercise(let e) = $0 { return .exercise(load(e, rule: rule)) } else { return $0 } }
                return .block(b)
            case .step(.exercise(let e)):
                return .step(.exercise(load(e, rule: r.progression)))
            default:
                return item
            }
        }
        return out
    }
}
