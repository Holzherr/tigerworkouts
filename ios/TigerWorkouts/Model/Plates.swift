import Foundation

/// The weights you own, and the loads they can make. A port of `src/features/runsheet/plates.ts`:
/// a barbell load is the bar plus a pair of each plate on it; a dumbbell or a kettlebell load is one
/// you have. Suggested loads (targets, a converted swap, a % of a training max) snap to these, so
/// the app never asks for 27.5 kg on a kettlebell.
enum Kit: String, Sendable {
    case barbell, dumbbell, kettlebell
}

/// Plates of one weight, counted singly: a pair loads one on each side.
struct PlateCount: Codable, Hashable, Sendable {
    var kg: Double
    var count: Int
}

/// Settings → My equipment, stored on `user_state.prefs.equipment` as the web writes it. A kit left
/// unset is not a constraint (the exercise's own step rounds it), except kettlebells, which come in
/// 4 kg steps unless you say otherwise.
struct Equipment: Codable, Hashable, Sendable {
    var barKg: Double?
    var plates: [PlateCount]?
    /// kg of each dumbbell you own (one of a pair).
    var dumbbells: [Double]?
    var kettlebells: [Double]?

    var isEmpty: Bool { barKg == nil && (plates ?? []).isEmpty && (dumbbells ?? []).isEmpty && (kettlebells ?? []).isEmpty }
}

enum Plates {
    static let defaultBarKg = 20.0
    /// What a gym has, for the plate calculator before any plates are set.
    static let defaultPlates: [PlateCount] = [25, 20, 15, 10, 5, 2.5, 1.25].map { PlateCount(kg: $0, count: $0 >= 10 ? 8 : 4) }
    /// Plate weights offered in the equipment editor.
    static let plateSizes: [Double] = [25, 20, 15, 10, 5, 2.5, 2, 1.25, 1, 0.5]
    /// 4 to 48 kg in 4 kg steps: the usual run of bells.
    static let defaultKettlebells: [Double] = (1...12).map { Double($0 * 4) }
    static let dumbbellSizes: [Double] = [1, 2, 2.5, 3, 4, 5, 6, 7.5, 8, 10, 12, 12.5, 14, 15, 16, 17.5, 18, 20, 22.5, 25, 27.5, 30, 32.5, 35, 40]
    static let kettlebellSizes: [Double] = [4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 32, 36, 40, 44, 48]

    private static let eps = 1e-6
    private static func r3(_ n: Double) -> Double { (n * 1000).rounded() / 1000 }

    /// Which kit an exercise is loaded with, from its key (`bb_`, `db_`, `kb_`) or its library group.
    static func kit(key: String, group: ExerciseGroup? = nil) -> Kit? {
        let k = key.lowercased()
        if k.hasPrefix("bb_") { return .barbell }
        if k.hasPrefix("kb_") || group == .kettlebell { return .kettlebell }
        if k.hasPrefix("db_") || group == .dumbbell { return .dumbbell }
        return nil
    }

    static func kit(_ ex: ExerciseRef) -> Kit? { kit(key: ex.key, group: Library.shared.exercise(ex.key)?.group) }

    /// Every per-side total a set of plates can make, with the plates that make it (fewest plates,
    /// heaviest first).
    private static func sideCombos(_ plates: [PlateCount]) -> [Double: [Double]] {
        var out: [Double: [Double]] = [0: []]
        for p in plates.sorted(by: { $0.kg > $1.kg }) {
            let pairs = p.count / 2
            guard p.kg > 0, pairs > 0 else { continue }
            for (sum, used) in out {
                for n in 1...pairs {
                    let s = r3(sum + p.kg * Double(n))
                    let next = used + Array(repeating: p.kg, count: n)
                    if let cur = out[s], cur.count <= next.count { continue }
                    out[s] = next
                }
            }
        }
        return out
    }

    /// The loads the kit can make, lightest first; nil when the kit is not a constraint.
    static func loads(_ kit: Kit?, _ eq: Equipment?) -> [Double]? {
        switch kit {
        case .barbell:
            guard let plates = eq?.plates, !plates.isEmpty else { return nil }
            let bar = eq?.barKg ?? defaultBarKg
            return sideCombos(plates).keys.map { r3(bar + 2 * $0) }.sorted()
        case .dumbbell:
            guard let d = eq?.dumbbells, !d.isEmpty else { return nil }
            return Array(Set(d)).sorted()
        case .kettlebell:
            let k = eq?.kettlebells ?? []
            return Array(Set(k.isEmpty ? defaultKettlebells : k)).sorted()
        case nil:
            return nil
        }
    }

    enum Snap { case nearest, up, down }

    /// A load you can make: the nearest (a tie goes lighter), the lightest at or above (`up`), or
    /// the heaviest at or below (`down`). Past either end of what you own it stops at that end. With
    /// no constraint it rounds to the exercise's step (2.5 when it has none).
    static func snap(_ kg: Double, _ ex: ExerciseRef, _ eq: Equipment?, _ how: Snap = .nearest) -> Double {
        guard let loads = loads(kit(ex), eq), let first = loads.first, let last = loads.last else {
            let step = ex.step > 0 ? ex.step : 2.5
            switch how {
            case .up: return r3((kg / step - eps).rounded(.up) * step)
            case .down: return r3((kg / step + eps).rounded(.down) * step)
            case .nearest: return r3((kg / step).rounded() * step)
            }
        }
        switch how {
        case .up: return loads.first(where: { $0 >= kg - eps }) ?? last
        case .down: return loads.last(where: { $0 <= kg + eps }) ?? first
        case .nearest: return loads.reduce(first) { abs($1 - kg) < abs($0 - kg) - eps ? $1 : $0 }
        }
    }

    /// The next load up from `kg` you can make; nil when `kg` is already the heaviest you own.
    static func nextUp(_ kg: Double, _ ex: ExerciseRef, _ eq: Equipment?) -> Double? {
        guard let loads = loads(kit(ex), eq), !loads.isEmpty else { return r3(kg + (ex.step > 0 ? ex.step : 2.5)) }
        return loads.first(where: { $0 > kg + eps })
    }

    struct Load: Hashable {
        var bar: Double
        /// Plates on each side, heaviest first.
        var perSide: [Double]
        /// What the bar weighs loaded like this: the load asked for, or the closest the plates make.
        var total: Double
        var exact: Bool
    }

    /// The plates for a barbell load, per side. Closest possible (a tie goes lighter) when it cannot
    /// be made exactly.
    static func plates(for kg: Double, _ eq: Equipment?) -> Load {
        let bar = eq?.barKg ?? defaultBarKg
        let combos = sideCombos((eq?.plates ?? []).isEmpty ? defaultPlates : eq!.plates!)
        let want = (kg - bar) / 2
        var best = 0.0
        for s in combos.keys.sorted() where abs(s - want) < abs(best - want) - eps { best = s }
        let total = r3(bar + 2 * best)
        return Load(bar: bar, perSide: combos[best] ?? [], total: total, exact: abs(total - kg) < eps)
    }

    /// 1.25 not 1.2: plate weights need two places.
    static func num(_ n: Double) -> String {
        n == n.rounded() ? String(Int(n)) : String((n * 100).rounded() / 100)
    }

    /// "20 kg bar + 2×20 + 2.5 per side", "20 kg bar, no plates".
    static func text(_ p: Load) -> String {
        if p.perSide.isEmpty { return "\(num(p.bar)) kg bar, no plates" }
        var groups: [(kg: Double, n: Int)] = []
        for kg in p.perSide {
            if let i = groups.firstIndex(where: { $0.kg == kg }) { groups[i].n += 1 } else { groups.append((kg, 1)) }
        }
        return "\(num(p.bar)) kg bar + " + groups.map { $0.n > 1 ? "\($0.n)×\(num($0.kg))" : num($0.kg) }.joined(separator: " + ") + " per side"
    }
}

/// Training maxes and relative loads, the port of `resolveTarget` / `resolveLoads` in
/// progression.ts.
enum Relative {
    /// The kg a step means for this user: absolute target, % of TM, or × bodyweight — a relative
    /// load snapped to the nearest one the kit you own can make.
    static func target(_ s: ExerciseStep, maxes: [String: Double], bodyweightKg: Double?, kit: Equipment?) -> Double? {
        if let pct = s.targetPct {
            guard let tm = maxes[s.exercise.key] else { return nil }
            return Plates.snap(pct / 100 * tm, s.exercise, kit)
        }
        if let f = s.loadFactor {
            guard let bw = bodyweightKg else { return nil }
            return Plates.snap(f * bw, s.exercise, kit)
        }
        return s.target
    }

    /// The runsheet with every relative load worked out into `target`, so the timer shows and logs
    /// a weight for a 65% TM set. `targetPct` and `loadFactor` stay for the labels.
    static func resolve(_ r: Runsheet, maxes: [String: Double], bodyweightKg: Double?, kit: Equipment?) -> Runsheet {
        func step(_ s: Step) -> Step {
            guard case .exercise(var e) = s, e.targetPct != nil || e.loadFactor != nil,
                  let t = target(e, maxes: maxes, bodyweightKg: bodyweightKg, kit: kit) else { return s }
            e.target = t
            return .exercise(e)
        }
        var r = r
        r.items = r.items.map { item in
            switch item {
            case .step(let s): return .step(step(s))
            case .block(var b):
                b.steps = b.steps.map(step)
                return .block(b)
            case .ref: return item
            }
        }
        return r
    }

    /// Inline every ref item using `lookup`; unknown refs are dropped, and refs nest at most three
    /// deep. Items inherit the ref's role and get an id prefixed with the ref's. The port of
    /// `resolveRefs` in model.ts.
    static func resolveRefs(_ r: Runsheet, lookup: (String) -> Runsheet?, depth: Int = 0) -> Runsheet {
        var r = r
        r.items = r.items.flatMap { item -> [Item] in
            guard case .ref(let ref) = item else { return [item] }
            guard depth < 3, let target = lookup(ref.runsheetId) else { return [] }
            return resolveRefs(target, lookup: lookup, depth: depth + 1).items.map { x in
                switch x {
                case .ref: return x
                case .step(.exercise(var e)):
                    e.role = ref.role ?? e.role
                    e.id = "\(ref.id):\(e.id)"
                    return .step(.exercise(e))
                case .step(.rest(var rest)):
                    rest.role = ref.role ?? rest.role
                    rest.id = "\(ref.id):\(rest.id)"
                    return .step(.rest(rest))
                case .block(var b):
                    b.role = ref.role ?? b.role
                    b.id = "\(ref.id):\(b.id)"
                    return .block(b)
                }
            }
        }
        return r
    }
}

extension Equipment {
    /// Mirrored into UserDefaults by the store, so the engine and the sheets read it the way they
    /// read the suggestions intent.
    static let storageKey = "equipment"

    static func current(_ defaults: UserDefaults = .standard) -> Equipment? {
        defaults.data(forKey: storageKey).flatMap { try? JSONDecoder().decode(Equipment.self, from: $0) }
    }

    static func store(_ e: Equipment?, _ defaults: UserDefaults = .standard) {
        if let e, let data = try? JSONEncoder().encode(e) { defaults.set(data, forKey: storageKey) } else { defaults.removeObject(forKey: storageKey) }
    }
}
