import Foundation

enum Muscle: String, CaseIterable, Hashable, Sendable {
    case chest, back, shoulders, arms, core, glutes, quads, hamstrings, calves

    var label: String {
        switch self {
        case .chest: "Chest"
        case .back: "Back"
        case .shoulders: "Shoulders"
        case .arms: "Arms"
        case .core: "Core"
        case .glutes: "Glutes"
        case .quads: "Quads"
        case .hamstrings: "Hamstrings"
        case .calves: "Calves"
        }
    }
}

/// Which muscles an exercise works, and how much: 1 = it is mainly this, 0.5 = along for the ride.
typealias MuscleShare = [Muscle: Double]

/// Ported from `src/features/results/muscles.ts`. Name first, equipment second. Keyed on the words
/// that actually appear in exercise names, most specific first, so "incline chest press" is chest
/// and "lateral raise" is shoulders rather than either falling to the generic press or row rule.
enum Muscles {
    /// Exercise names are written plural as often as singular, so every term matches both.
    private static func words(_ terms: String...) -> NSRegularExpression {
        // swiftlint:disable:next force_try - the pattern is built from literals checked by the tests.
        try! NSRegularExpression(pattern: "\\b(?:\(terms.joined(separator: "|")))(?:e?s)?\\b", options: [.caseInsensitive])
    }

    private static let byName: [(NSRegularExpression, MuscleShare)] = [
        (words("swing", "hinge"), [.glutes: 1, .hamstrings: 1, .back: 0.5, .core: 0.5]),
        (words("deadlift", "good ?morning", "rdl"), [.hamstrings: 1, .glutes: 1, .back: 1, .core: 0.5]),
        (words("squat", "lunge", "step[- ]?up", "leg press", "wall sit"), [.quads: 1, .glutes: 1, .core: 0.5]),
        (words("hip thrust", "glute bridge"), [.glutes: 1, .hamstrings: 0.5]),
        (words("calf", "calve", "heel raise"), [.calves: 1]),
        (words("leg curl", "hamstring curl", "nordic"), [.hamstrings: 1]),
        (words("lateral raise", "front raise", "rear delt", "face pull", "upright row"), [.shoulders: 1, .back: 0.5]),
        (words("shoulder press", "overhead press", "ohp", "push press", "handstand"), [.shoulders: 1, .arms: 0.5, .core: 0.5]),
        (words("chest press", "bench", "fly", "flye", "push[- ]?up", "press[- ]?up", "dip"), [.chest: 1, .arms: 0.5, .shoulders: 0.5]),
        (words("row", "pull[- ]?up", "chin[- ]?up", "pulldown", "pullover", "lat raise"), [.back: 1, .arms: 0.5]),
        (words("tricep", "skull ?crusher", "kickback", "pushdown"), [.arms: 1]),
        (words("curl"), [.arms: 1]),
        (words("plank", "crunch", "sit[- ]?up", "hollow", "russian twist", "leg raise", "dead ?bug", "v[- ]?up", "mountain climber"), [.core: 1]),
        (words("burpee", "thruster", "clean", "snatch", "jerk", "wall ball", "man ?maker"), [.quads: 1, .shoulders: 1, .back: 0.5, .core: 0.5, .glutes: 0.5]),
        (words("sprint", "run", "jog", "treadmill"), [.quads: 1, .hamstrings: 1, .calves: 1, .glutes: 0.5]),
        (words("walk", "stair", "step ?mill"), [.glutes: 1, .calves: 1, .quads: 0.5, .hamstrings: 0.5]),
        (words("rower", "row erg", "ski ?erg"), [.back: 1, .quads: 1, .arms: 0.5, .core: 0.5]),
        (words("bike", "cycle", "assault", "echo"), [.quads: 1, .calves: 0.5, .glutes: 0.5]),
        (words("swim"), [.back: 1, .shoulders: 1, .core: 0.5]),
        (words("jump rope", "skip", "box jump", "jumping jack"), [.calves: 1, .quads: 0.5]),
        (words("carry", "farmer"), [.core: 1, .back: 0.5, .arms: 0.5]),
    ]

    private static let byGroup: [ExerciseGroup: MuscleShare] = [
        .treadmill: [.quads: 1, .hamstrings: 1, .calves: 1],
        .run: [.quads: 1, .hamstrings: 1, .calves: 1],
        .walk: [.glutes: 1, .calves: 1],
        .bike: [.quads: 1, .calves: 0.5],
        .rower: [.back: 1, .quads: 1],
        .swim: [.back: 1, .shoulders: 1],
        .core: [.core: 1],
        .kettlebell: [.glutes: 1, .back: 0.5, .core: 0.5],
        .band: [.back: 0.5, .arms: 0.5, .shoulders: 0.5],
    ]

    /// Empty when nothing is recognised — a blank body is honest, a wrong one is not.
    static func forExercise(_ name: String, group: ExerciseGroup? = nil) -> MuscleShare {
        let range = NSRange(name.startIndex..., in: name)
        for (re, share) in byName where re.firstMatch(in: name, options: [], range: range) != nil {
            return share
        }
        return group.flatMap { byGroup[$0] } ?? [:]
    }

    /// The share of a session's working time each muscle took, normalised so the hardest-worked
    /// muscle is 1. That is what shades the body map — relative emphasis, not an absolute claim.
    static func load(_ worked: [WorkedSet]) -> MuscleShare {
        var total: MuscleShare = [:]
        for w in worked {
            for (m, share) in forExercise(w.name, group: w.group) {
                total[m, default: 0] += share * w.seconds
            }
        }
        guard let peak = total.values.max(), peak > 0 else { return [:] }
        return total.mapValues { $0 / peak }
    }
}
