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

    private(set) var exercises: [String: LibraryExercise] = [:]
    private(set) var groupLabels: [String: String] = [:]
    private(set) var workouts: [ImportedWorkout] = []

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
        guard exercises.isEmpty else { return }
        struct Catalogue: Decodable {
            var groups: [String: String]
            var exercises: [LibraryExercise]
        }
        if let data = try? Data(contentsOf: exercisesURL),
           let cat = try? JSONDecoder().decode(Catalogue.self, from: data) {
            exercises = Dictionary(uniqueKeysWithValues: cat.exercises.map { ($0.key, $0) })
            groupLabels = cat.groups
        }
        // Runsheets name their exercises by key; the decoder resolves them against what we just read.
        if let data = try? Data(contentsOf: workoutsURL),
           let list = try? decoder.decode([ImportedWorkout].self, from: data) {
            workouts = list
        }
    }

    func exercise(_ key: String) -> LibraryExercise? { exercises[key] }

    func group(_ key: String) -> ExerciseGroup? { exercises[key]?.group }

    func name(_ key: String) -> String { exercises[key]?.name ?? ExerciseRef.placeholder(key: key).name }

    /// A decoder wired to this library, for runsheets pulled from Supabase.
    var decoder: JSONDecoder {
        let d = JSONDecoder()
        d.userInfo[.exerciseLibrary] = exercises.mapValues(\.ref)
        return d
    }
}
