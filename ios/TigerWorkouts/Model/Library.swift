import Foundation

enum ExerciseGroup: String, Codable, Sendable, CaseIterable {
    case kettlebell, dumbbell, treadmill, walk, barbell, body, core, band, rower, bike, run, swim, gym
}

/// An exercise as the shared library knows it: the ref the timer shows, plus the equipment group
/// the calorie and muscle models key off.
struct LibraryExercise: Codable, Hashable, Sendable, Identifiable {
    var key: String
    var name: String
    var unit: String = ""
    var step: Double = 1
    var group: ExerciseGroup = .body
    var cue: String = ""
    var icon: String?
    var clip: String?
    var poster: String?

    var id: String { key }

    init(key: String, name: String, unit: String = "", step: Double = 1, group: ExerciseGroup = .body, cue: String = "") {
        self.key = key
        self.name = name
        self.unit = unit
        self.step = step
        self.group = group
        self.cue = cue
    }

    /// One you made, the way the web picker makes it (`customKey` in csv.ts): a `u_<name>_<tag>`
    /// key, the tag the start of your account id so two people adding "Sled push" never write to
    /// one row (exercise keys are global in Supabase), a random tag before sign-in; and a step that
    /// suits the unit (half a kph, 2.5 kg, one rep). Keys made before 28 Sep 2026 have no tag and
    /// still read.
    static func custom(name: String, unit: String, group: ExerciseGroup, owner: String? = nil) -> LibraryExercise {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let slug = trimmed.lowercased()
            .replacingOccurrences(of: "[^a-z0-9]+", with: "_", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: "_"))
        let source = owner ?? UUID().uuidString
        let tag = String(source.lowercased().filter { $0.isLetter || $0.isNumber }.prefix(8))
        return LibraryExercise(key: "u_\(slug)_\(tag)", name: trimmed, unit: unit, step: defaultStep(unit: unit), group: group)
    }

    static func defaultStep(unit: String) -> Double { unit == "kph" ? 0.5 : unit.isEmpty ? 1 : 2.5 }

    /// The units the new-exercise form offers, as the web's picker has them; "" is bodyweight.
    static let customUnits: [(value: String, label: String)] = [("kg", "kg"), ("kg per arm", "kg per arm"), ("kph", "kph"), ("", "bodyweight")]

    var isCustom: Bool { key.hasPrefix("u_") }

    var ref: ExerciseRef {
        ExerciseRef(key: key, name: name, unit: unit, step: step, clip: clip, poster: poster, icon: icon, cue: cue.isEmpty ? nil : cue)
    }

    init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        key = try c.decodeIfPresent(String.self, forKey: .key) ?? ""
        name = try c.decodeIfPresent(String.self, forKey: .name) ?? key
        unit = try c.decodeIfPresent(String.self, forKey: .unit) ?? ""
        step = try c.decodeIfPresent(Double.self, forKey: .step) ?? 1
        group = (try? c.decodeIfPresent(ExerciseGroup.self, forKey: .group)) ?? .body
        cue = try c.decodeIfPresent(String.self, forKey: .cue) ?? ""
        icon = try c.decodeIfPresent(String.self, forKey: .icon)
        clip = try c.decodeIfPresent(String.self, forKey: .clip)
        poster = try c.decodeIfPresent(String.self, forKey: .poster)
    }
}

struct ImportedWorkout: Decodable, Identifiable, Sendable {
    var source: String
    var runsheet: Runsheet

    var id: String { runsheet.key }
}

/// The bundled catalogue: 470-odd workouts and every exercise they name, exported from the web
/// app by `tools/export-ios.mjs`. Loaded once, then read from anywhere.
final class Library: @unchecked Sendable {
    static let shared = Library()

    /// The catalogue plus the exercises this account made, so every lookup (names, groups,
    /// alternatives, Health's activity type) treats yours the same as the bundled ones.
    private(set) var exercises: [String: LibraryExercise] = [:]
    private(set) var groupLabels: [String: String] = [:]
    private(set) var workouts: [ImportedWorkout] = []
    private var catalogueKeys: Set<String> = []
    private var didLoad = false

    /// Loads both files. Cheap enough to do on launch (under a megabyte), but call it off the
    /// main actor and publish the result rather than blocking the first frame.
    func load(bundle: Bundle = .main) {
        guard let exercises = bundle.url(forResource: "exercises", withExtension: "json"),
              let workouts = bundle.url(forResource: "workouts", withExtension: "json") else { return }
        load(exercises: exercises, workouts: workouts)
    }

    /// The same load from explicit files, so a tool or a test can point straight at the export
    /// without going through a bundle.
    func load(exercises exercisesURL: URL, workouts workoutsURL: URL) {
        guard !didLoad else { return }
        didLoad = true
        struct Catalogue: Decodable {
            var groups: [String: String]
            var exercises: [LibraryExercise]
        }
        if let data = try? Data(contentsOf: exercisesURL),
           let cat = try? JSONDecoder().decode(Catalogue.self, from: data) {
            let bundled = Dictionary(uniqueKeysWithValues: cat.exercises.map { ($0.key, $0) })
            catalogueKeys = Set(bundled.keys)
            exercises = bundled.merging(exercises) { catalogue, _ in catalogue }
            groupLabels = cat.groups
        }
        // Runsheets name their exercises by key; the decoder resolves them against what we just read.
        if let data = try? Data(contentsOf: workoutsURL),
           let list = try? decoder.decode([ImportedWorkout].self, from: data) {
            workouts = list
        }
    }

    func exercise(_ key: String) -> LibraryExercise? { exercises[key] }

    /// Adds exercises the account made. A key the catalogue already has is left alone: the
    /// bundled one is the truth for it.
    func addCustom(_ list: some Sequence<LibraryExercise>) {
        for e in list where !catalogueKeys.contains(e.key) { exercises[e.key] = e }
    }

    func group(_ key: String) -> ExerciseGroup? { exercises[key]?.group }

    func name(_ key: String) -> String { exercises[key]?.name ?? ExerciseRef.placeholder(key: key).name }

    /// A decoder wired to this library, for runsheets pulled from Supabase.
    var decoder: JSONDecoder {
        let d = JSONDecoder()
        d.userInfo[.exerciseLibrary] = exercises.mapValues(\.ref)
        return d
    }
}
