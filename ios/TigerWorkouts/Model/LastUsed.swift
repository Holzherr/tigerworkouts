import Foundation

struct LastUsed: Hashable, Sendable {
    var target: Double?
    var incline: Double?
    /// On a step entry: the exercise that step was when it was done. An edit can put another
    /// exercise under an old step id, and that one's load is not this one's.
    var exerciseKey: String?
}

/// A load written on a step, against last session's (Nick, review D4, 15 Nov 2026: "Written loads
/// win"). What is written runs when the step was edited after its last session, and on any step
/// this workout's own history has no session for, so a load from another workout never replaces
/// it. Last time still seeds a step not touched since, and stays the "last time" hint either way.
///
/// When a step's written load last changed is kept on the phone (`storageKey`), by workout and
/// step id: set by an edit on the workout page and by a sync that brings a changed load in from
/// the web or Claude. Nothing is added to the workout itself.
enum Written {
    /// Workout key → step id → when its written load last changed, ISO 8601.
    typealias Edits = [String: [String: String]]

    static let storageKey = "written-loads"

    static func current(_ defaults: UserDefaults = .standard) -> Edits {
        guard let data = defaults.data(forKey: storageKey) else { return [:] }
        return (try? JSONDecoder().decode(Edits.self, from: data)) ?? [:]
    }

    static func store(_ edits: Edits, _ defaults: UserDefaults = .standard) {
        defaults.set(try? JSONEncoder().encode(edits), forKey: storageKey)
    }

    /// `edits` with these steps of a workout marked as written now.
    static func marked(_ edits: Edits, workout: String, steps: [String], at: Date = Date()) -> Edits {
        guard !steps.isEmpty else { return edits }
        var out = edits
        for id in steps { out[workout, default: [:]][id] = ISO8601.string(at) }
        return out
    }

    /// The load a step is written with: its load, its sets' loads, its incline, a relative load.
    private static func load(_ s: ExerciseStep) -> [Double?] {
        [s.target, s.incline, s.targetPct, s.loadFactor] + (s.sets ?? []).map(\.load)
    }

    /// A step with a load or an incline written on it.
    static func hasLoad(_ s: ExerciseStep) -> Bool {
        s.target != nil || s.incline != nil || s.sets?.contains { $0.load != nil } == true
    }

    /// Steps in both copies of a workout whose written load differs, by step id.
    static func changed(from old: Runsheet, to new: Runsheet) -> [String] {
        let was = Dictionary(old.exerciseSteps.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        return new.exerciseSteps.compactMap { s in
            guard let o = was[s.id] else { return nil }
            return o.exercise.key != s.exercise.key || load(o) != load(s) ? s.id : nil
        }
    }

    /// When this step was last done in the workout's own sessions; nil when never.
    static func lastDone(_ results: [SessionResult], step: ExerciseStep, in workout: Runsheet) -> Date? {
        results
            .filter { r in workout.owns(r) && r.steps.contains { $0.stepId == step.id && $0.exerciseKey == step.exercise.key } }
            .map(\.startedDate).max()
    }

    /// True when the step runs as written: last time's load is not put over it.
    static func wins(_ s: ExerciseStep, in workout: Runsheet, results: [SessionResult], edits: Edits) -> Bool {
        guard hasLoad(s) else { return false }
        let edited = edits[workout.key]?[s.id].flatMap(ISO8601.date)
        guard let done = lastDone(results, step: s, in: workout) else {
            // A programme's lift carries from day to day by its rule (day A's squat into day B).
            return edited != nil || !Targets.ruled(workout, s)
        }
        return edited.map { $0 > done } ?? false
    }
}

/// Ported from `src/features/runsheet/last-used.ts`.
enum Settings {
    /// What you actually used, most recent first: keyed by step id for the exact step in this
    /// workout (`step:<id>`, from its own sessions only — step ids are per workout, "s1" is in
    /// hundreds of them — or the original's for an edited copy), and by exercise key so the same
    /// machine carries across workouts (`ex:<key>`, from every session). Sessions are read newest
    /// first and the first hit wins, so an older session never overwrites a newer one. Without a
    /// workout there are no step entries.
    static func lastUsed(_ results: [SessionResult], workout: Runsheet? = nil) -> [String: LastUsed] {
        var out: [String: LastUsed] = [:]
        for r in results.sorted(by: { $0.startedAt > $1.startedAt }) {
            let own = workout?.owns(r) ?? false
            for s in r.steps {
                // A drop set at the end is not where the next session starts.
                let v = LastUsed(target: ProgressionRules.workingLoad(s), incline: s.incline)
                guard v.target != nil || v.incline != nil else { continue }
                if own, out["step:\(s.stepId)"] == nil { out["step:\(s.stepId)"] = LastUsed(target: v.target, incline: v.incline, exerciseKey: s.exerciseKey) }
                if out["ex:\(s.exerciseKey)"] == nil { out["ex:\(s.exerciseKey)"] = v }
            }
        }
        return out
    }

    /// Start a workout on the numbers you finished on. The treadmill speed and incline, and the
    /// weight on the bench, are what you set last time rather than whatever the workout was
    /// written with — the thing you would otherwise dial in again at the start of every block.
    ///
    /// In a block done for sets, each set starts on its own set last time (`LastTime.sets`), so a
    /// pyramid (100 × 8, 110 × 4, 110 × 4) comes back as it was done rather than as one load. Where
    /// today's target (`targets`, from `Targets.sets` on the same workout) moves sets that were all
    /// one load last time, the working sets start on its load instead, so the "Target" line over
    /// the timer is what the sets are filled with. A step a programme's rules load is left to them.
    ///
    /// A step whose written load wins (`Written.wins`) is left as written.
    static func withLastUsed(_ r: Runsheet, results: [SessionResult], targets: [Targets.SetTarget] = [], written: Written.Edits = Written.current()) -> Runsheet {
        guard !results.isEmpty else { return r }
        let m = lastUsed(results, workout: r)
        guard !m.isEmpty else { return r }

        func seed(_ s: ExerciseStep, rounds: Int?) -> ExerciseStep {
            if Written.wins(s, in: r, results: results, edits: written) { return s }
            let step = m["step:\(s.id)"].flatMap { $0.exerciseKey == s.exercise.key ? $0 : nil }
            guard let hit = step ?? m["ex:\(s.exercise.key)"] else { return s }
            var s = s
            // A relative load (% of a training max) is computed at run time; leave it alone.
            if s.target != nil, let t = hit.target { s.target = t }
            if let i = hit.incline { s.incline = i }
            guard s.target != nil || s.sets?.contains(where: { $0.load != nil }) == true, s.targetPct == nil, s.loadFactor == nil,
                  Measure.of(s.exercise.unit) == nil, !Targets.ruled(r, s),
                  let last = LastTime.lastSession(results, for: s, in: r), !last.isEmpty else { return s }
            let target = targets.first { $0.stepId == s.id && $0.exerciseKey == s.exercise.key }?.load
            let follow = target != nil && Set(last.filter(isWork).map { $0.load ?? -1 }).count <= 1
            if let rounds {
                s.sets = seededSets(s, rounds: rounds, last: last, target: follow ? target : nil)
                if let first = s.sets?.first(where: { isWork($0.type) })?.load ?? s.sets?.first?.load { s.target = first }
            } else if follow, let target {
                s.target = target
            }
            return s
        }

        var out = r
        out.items = r.items.map { item in
            switch item {
            case .block(var b):
                let rounds = b.runMode == .rounds ? max(1, b.repeatCount) : nil
                b.steps = b.steps.map { if case .exercise(let e) = $0 { return .exercise(seed(e, rounds: rounds)) } else { return $0 } }
                return .block(b)
            case .step(.exercise(let e)):
                return .step(.exercise(seed(e, rounds: nil)))
            default:
                return item
            }
        }
        return out
    }

    private static func isWork(_ type: SetType?) -> Bool { type != .warmup && type != .drop }
    private static func isWork(_ set: SetResult) -> Bool { isWork(set.type) }

    /// A plan for every set of a step: set n's load (and type) from last time's set n, or `target`
    /// on a working set when today's target is followed; past last time's sets, the plan's own
    /// load or the set before's. Reps stay the plan's: the runner fills them (`SessionRunner`).
    static func seededSets(_ s: ExerciseStep, rounds: Int, last: [SetResult], target: Double?) -> [SetPlan] {
        var out: [SetPlan] = []
        for i in 0..<rounds {
            let own = s.sets.flatMap { $0.indices.contains(i) ? $0[i] : nil }
            let then = last.indices.contains(i) ? last[i] : nil
            let planned = s.plannedType(i)
            let type: SetType? = then.map { ($0.type ?? .normal) == .normal ? nil : $0.type } ?? (planned == .normal ? nil : planned)
            var load: Double?
            if let target, isWork(type) {
                load = target
            } else if let then, let l = then.load {
                load = l
            } else {
                load = own?.load ?? out.last?.load ?? s.plannedSet(i).load
            }
            out.append(SetPlan(reps: own?.reps, load: load, type: type))
        }
        return out
    }
}

/// "last time 57.5 × 8" on a step's row. Ported from `lastSet` / `lastTimeLabel` in
/// `src/features/runsheet/last-used.ts`.
enum LastTime {
    /// The set a row is judged by: the heaviest, then the most reps. Older results have no per-set
    /// rows, so their one load and best rep count stand in.
    static func topSet(_ s: StepResult) -> SetResult? {
        let sets = s.sets?.isEmpty == false ? s.sets! : [SetResult(reps: s.reps?.max(), load: s.target)]
        let best = sets.max { a, b in
            (a.load ?? 0, a.reps ?? 0) < (b.load ?? 0, b.reps ?? 0)
        }
        guard let best, best.load != nil || best.reps != nil else { return nil }
        return best
    }

    /// The step of this workout first (its own sessions, or the original's for an edited copy),
    /// then the same exercise in any workout. Without a workout, only the exercise.
    private static func stepThenExercise(_ step: ExerciseStep, _ workout: Runsheet?) -> [(SessionResult, StepResult) -> Bool] {
        let sameExercise: (SessionResult, StepResult) -> Bool = { _, x in x.exerciseKey == step.exercise.key }
        guard let workout else { return [sameExercise] }
        let sameStep: (SessionResult, StepResult) -> Bool = { r, x in
            workout.owns(r) && x.stepId == step.id && x.exerciseKey == step.exercise.key
        }
        return [sameStep, sameExercise]
    }

    /// What this step was done at last time — the same step of this workout if it has history,
    /// else the same exercise in any workout. Newest session first.
    static func set(_ results: [SessionResult], for step: ExerciseStep, in workout: Runsheet? = nil) -> SetResult? {
        let newest = results.sorted { $0.startedAt > $1.startedAt }
        for match in stepThenExercise(step, workout) {
            for r in newest {
                if let hit = r.steps.first(where: { match(r, $0) && topSet($0) != nil }) { return topSet(hit) }
            }
        }
        return nil
    }

    static func label(_ set: SetResult?, for step: ExerciseStep) -> String? {
        guard let set else { return nil }
        switch (set.load, set.reps) {
        case let (load?, reps?): return "last time \(step.loadNumber(load)) × \(Format.number(reps))"
        case let (load?, nil): return "last time \(step.loadText(load))"
        case let (nil, reps?): return "last time \(Format.number(reps)) reps"
        default: return nil
        }
    }

    static func label(_ results: [SessionResult], for step: ExerciseStep, in workout: Runsheet? = nil) -> String? {
        label(set(results, for: step, in: workout), for: step)
    }

    /// Every set of this step last time, in order — the same step of this workout if it has
    /// history, else the same exercise. For the set grid, where set 2 is shown against last time's
    /// set 2. Ported from `lastSets` in `last-used.ts`.
    static func sets(_ results: [SessionResult], for step: ExerciseStep, in workout: Runsheet? = nil) -> [SetResult]? {
        let newest = results.sorted { $0.startedAt > $1.startedAt }
        for match in stepThenExercise(step, workout) {
            for r in newest {
                // A legacy row that logged metres, seconds or calories as the load reads as that
                // measure, so "Use last time" never writes it onto the set as a load (last-used.ts).
                if let hit = r.steps.first(where: { match(r, $0) && $0.sets?.isEmpty == false }) {
                    return Logbook.measured(hit.sets ?? [], unit: step.exercise.unit)
                }
            }
        }
        return nil
    }

    /// "last 57.5 × 8" under a set row; the load in lb when weights show in lb (`unit` as stored).
    static func setLabel(_ set: SetResult?, unit: String = "") -> String? {
        guard let set else { return nil }
        let parts = [set.load.map { Units.number($0, unit: unit) }, set.reps.map(Format.number)].compactMap { $0 }
        return parts.isEmpty ? nil : "last " + parts.joined(separator: " × ")
    }

    // MARK: - Last session, set by set

    /// "last time" everywhere (Priyanka, 14 Nov 2026): the last session's logged sets of this step,
    /// in order — the same step of this workout first, else the same exercise in any workout. Not
    /// the heaviest set (`topSet`), not one load for the whole step. A row from before sets were
    /// kept stands in with its reps at its one load.
    static func lastSession(_ results: [SessionResult], for step: ExerciseStep, in workout: Runsheet? = nil) -> [SetResult]? {
        let newest = results.sorted { $0.startedAt > $1.startedAt }
        for match in stepThenExercise(step, workout) {
            for r in newest {
                for row in r.steps where match(r, row) {
                    let sets = row.sets?.isEmpty == false
                        ? row.sets!
                        : (row.reps ?? []).map { SetResult(reps: $0, load: row.target) }
                    let logged = Logbook.measured(sets, unit: step.exercise.unit).filter { $0.load != nil || $0.reps != nil }
                    if !logged.isEmpty { return logged }
                }
            }
        }
        return nil
    }

    /// "100 × 8, 110 × 4", "100 × 8 (×3)" for three the same in a row, "12, 12, 10 reps" without a
    /// load, "10 kph" without reps. A run of sets with one number each reads "24 kg × 7 sets",
    /// the unit beside its number ("24 (×7) kg" read as a typo, review D8). At most `limit`
    /// groups, then "+N more".
    static func compact(_ sets: [SetResult], unit stored: String = "", limit: Int = 4) -> String? {
        // A weight shows in lb when weights do (U11); `stored` is the exercise's unit.
        let unit = Units.unit(stored)
        func load(_ v: Double) -> String { Units.number(v, unit: stored) }
        var groups: [(set: SetResult, count: Int)] = []
        for s in sets {
            if let last = groups.last, last.set.load == s.load, last.set.reps == s.reps {
                groups[groups.count - 1].count += 1
            } else {
                groups.append((s, 1))
            }
        }
        guard !groups.isEmpty else { return nil }
        let loads = sets.contains { $0.load != nil }
        let reps = sets.contains { $0.reps != nil }
        // One number a set and a run of them: each group carries its own unit.
        let spelled = loads != reps && groups.contains { $0.count > 1 }
        let own = !loads ? " reps" : unit.isEmpty ? "" : " \(unit)"
        func one(_ g: (set: SetResult, count: Int)) -> String {
            let times = g.count > 1 ? " (×\(g.count))" : ""
            switch (g.set.load, g.set.reps) {
            case let (kg?, reps?): return "\(load(kg)) × \(Format.number(reps))\(times)"
            case let (kg?, nil) where spelled:
                return "\(load(kg))\(own)" + (g.count > 1 ? " × \(g.count) sets" : "")
            case let (nil, value?) where spelled:
                return "\(Format.number(value))\(own)" + (g.count > 1 ? " × \(g.count) sets" : "")
            case let (kg?, nil): return "\(load(kg))\(times)"
            case let (nil, reps?): return loads ? "\(Format.number(reps)) reps\(times)" : "\(Format.number(reps))\(times)"
            default: return ""
            }
        }
        let shown = groups.prefix(limit).map(one).filter { !$0.isEmpty }
        var text = shown.joined(separator: ", ")
        if !spelled {
            if !loads && reps { text += " reps" }
            if loads && !reps && !unit.isEmpty { text += " \(unit)" }
        }
        let rest = groups.dropFirst(limit).reduce(0) { $0 + $1.count }
        if rest > 0 { text += " +\(rest) more" }
        return text.isEmpty ? nil : text
    }

    /// "last time 100 × 8, 110 × 4" under a step's name on the workout page.
    static func lastSessionLabel(_ results: [SessionResult], for step: ExerciseStep, in workout: Runsheet? = nil) -> String? {
        lastSession(results, for: step, in: workout)
            .flatMap { compact($0, unit: step.shortUnit) }
            .map { "last time " + $0 }
    }
}

/// The player's half of last time: one round's set from the same `lastSession` the workout page
/// and the exercise sheet show, so every screen reads the same sets.
extension LastTime {
    /// Last time's set for one round of a step: set n against set n, the last set past the end.
    static func set(_ results: [SessionResult], for step: ExerciseStep, round: Int, in workout: Runsheet? = nil) -> SetResult? {
        guard let all = lastSession(results, for: step, in: workout), !all.isEmpty else { return nil }
        return all[min(max(0, round), all.count - 1)]
    }
}
