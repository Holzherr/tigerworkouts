import Foundation

/// What to do instead when the kit is taken.
///
/// Nick, 22 Sep: "weights and benches were busy so instead of bench press I did weight machine."
/// The gym does not care what the plan said, so every exercise carries a short list of things that
/// train the same pattern with different equipment, and a load converted into the new exercise's
/// own terms — a dumbbell press is written per arm and a machine is not, so 20 kg per arm becomes
/// about 45 kg on the machine rather than 20.
enum Alternatives {
    /// The movement an exercise trains. Two exercises swap for each other when these match.
    enum Pattern: String, CaseIterable {
        case horizontalPress, verticalPress, horizontalPull, verticalPull
        case squat, hinge, lunge, carry, core, cardio

        var label: String {
            switch self {
            case .horizontalPress: "pressing away from the chest"
            case .verticalPress: "pressing overhead"
            case .horizontalPull: "rowing"
            case .verticalPull: "pulling down"
            case .squat: "squatting"
            case .hinge: "hinging at the hip"
            case .lunge: "single-leg work"
            case .carry: "carrying"
            case .core: "trunk work"
            case .cardio: "cardio"
            }
        }
    }

    struct Option: Identifiable, Hashable {
        var exercise: LibraryExercise
        /// The same effort in the new exercise's own unit, rounded to what its steppers move by.
        var target: Double?
        /// "Machine, same push" — why this one is here.
        var why: String
        var id: String { exercise.key }
    }

    /// Ordered rules: the first match wins, so "incline chest press" is a press before `press`
    /// catches anything else, and `leg_press` is a squat rather than a press.
    private static let rules: [(pattern: Pattern, needles: [String])] = [
        (.verticalPull, ["pulldown", "pull_up", "pullup", "chin_up", "muscle_up", "lat_pull"]),
        (.horizontalPull, ["row", "face_pull", "rear_delt"]),
        (.squat, ["squat", "leg_press", "leg_ext", "wall_sit", "thruster"]),
        (.lunge, ["lunge", "split", "step_up", "bulgarian", "pistol"]),
        (.hinge, ["deadlift", "swing", "rdl", "good_morning", "hip_thrust", "hip_bridge", "back_raise", "clean", "snatch", "kb_"]),
        (.verticalPress, ["shoulder_press", "overhead_press", "push_press", "ohp", "handstand", "jerk", "landmine_press"]),
        (.horizontalPress, ["bench", "chest_press", "chest_fly", "pushup", "push_up", "floor_press", "dip"]),
        (.carry, ["carry", "march", "drag"]),
        (.core, ["plank", "crunch", "sit_up", "situp", "hollow", "dead_bug", "deadbug", "russian_twist", "leg_raise", "mountain_climber"]),
        (.cardio, ["cardio_", "sprint", "incline_walk", "run", "row", "bike", "ski"]),
    ]

    static func pattern(of exercise: LibraryExercise) -> Pattern? {
        let hay = "\(exercise.key.lowercased()) \(exercise.name.lowercased().replacingOccurrences(of: " ", with: "_"))"
        // Cardio machines first: `cardio_rower` is a rower, not a row.
        if [.rower, .run, .bike, .walk, .treadmill, .swim].contains(exercise.group) { return .cardio }
        for rule in rules where rule.needles.contains(where: { hay.contains($0) }) { return rule.pattern }
        return nil
    }

    /// How a load reads: per arm on dumbbells, one number on a machine or bar, and neither on a
    /// bodyweight move.
    private enum Load { case perArm, total, none }

    private static func load(_ exercise: LibraryExercise) -> Load {
        let unit = exercise.unit.lowercased()
        if unit.contains("per arm") || unit.contains("per side") { return .perArm }
        return unit == "kg" ? .total : .none
    }

    /// Two dumbbells make roughly one machine's number, and a machine's own leverage flatters it by
    /// about a tenth. Guidance, not physics: the first set tells you the truth.
    static func convert(_ target: Double?, from: LibraryExercise, to: LibraryExercise) -> Double? {
        guard let target, target > 0 else { return nil }
        let raw: Double
        switch (load(from), load(to)) {
        case (.perArm, .total): raw = target * 2 * 1.1
        case (.total, .perArm): raw = target / 2 / 1.1
        case (.none, _), (_, .none): return nil
        default: raw = target
        }
        let step = to.step > 0 ? to.step : 1
        return (raw / step).rounded() * step
    }

    /// Alternatives for a step, nearest equipment first: the same pattern, never the same exercise.
    static func options(for step: ExerciseStep, limit: Int = 5) -> [Option] {
        let library = Library.shared
        guard let exercise = library.exercise(step.exercise.key),
              let wanted = pattern(of: exercise) else { return [] }
        let sameGroup = exercise.group
        return library.exercises.values
            .filter { $0.key != exercise.key && pattern(of: $0) == wanted }
            .sorted { a, b in
                // A different machine is the point of the list, so push the same group down.
                if (a.group == sameGroup) != (b.group == sameGroup) { return b.group == sameGroup }
                return a.name < b.name
            }
            .prefix(limit)
            .map { alternative in
                Option(
                    exercise: alternative,
                    target: convert(step.target, from: exercise, to: alternative),
                    why: library.groupLabels[alternative.group.rawValue] ?? alternative.group.rawValue.capitalized
                )
            }
    }
}
