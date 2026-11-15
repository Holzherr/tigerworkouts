import Foundation

/// How a lift moves on: more reps first, more weight at fixed reps, or by how hard it felt.
/// Priyanka (via Nick), 15 Nov 2026: "Lifters often keep reps fixed (deadlifts × 4) and add weight,
/// or push effort (RPE)."
enum ProgressMode: String, Codable, CaseIterable, Identifiable, Sendable {
    /// Add reps up to a ceiling, then add weight and go back to the bottom (double progression).
    case reps
    /// Keep the plan's reps, add one step of weight once every set made them.
    case weight
    /// Keep weight and reps; add a step once a set's RPE comes down.
    case effort

    var id: String { rawValue }
    var label: String {
        switch self {
        case .reps: "Reps"
        case .weight: "Weight"
        case .effort: "Effort"
        }
    }
    var note: String {
        switch self {
        case .reps: "Add reps up to the top of the range, then add weight and start again."
        case .weight: "Keep the reps, add a step of weight (+2.5 kg) once every set makes them."
        case .effort: "Keep weight and reps, rate how hard it was (RPE), add weight once it feels easier."
        }
    }
}

/// Whether to suggest at all, and how: `user_state.prefs.suggestions`, synced with the web, which
/// carries it through untouched. Every field optional, so an empty object is the default — on, by
/// reps — and a newer build's extra fields decode in an older one.
struct SuggestPrefs: Codable, Hashable, Sendable {
    /// True turns every suggestion off for the account: no Today line, no target pill, no Next time,
    /// no stall cards.
    var off: Bool?
    /// The account's mode; nil is reps.
    var mode: ProgressMode?
    /// The setup question ("Want suggestions on how to progress?") has been answered.
    var asked: Bool?
    /// Per exercise key, over the account's mode.
    var exercises: [String: ProgressMode]?
    /// Workout ids with suggestions off.
    var offWorkouts: [String]?

    init(off: Bool? = nil, mode: ProgressMode? = nil, asked: Bool? = nil, exercises: [String: ProgressMode]? = nil, offWorkouts: [String]? = nil) {
        self.off = off
        self.mode = mode
        self.asked = asked
        self.exercises = exercises
        self.offWorkouts = offWorkouts
    }

    /// An unknown mode (a newer build's) reads as unset rather than failing the whole object.
    init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        off = try? c.decodeIfPresent(Bool.self, forKey: .off)
        asked = try? c.decodeIfPresent(Bool.self, forKey: .asked)
        mode = (try? c.decodeIfPresent(String.self, forKey: .mode)).flatMap { $0.flatMap(ProgressMode.init(rawValue:)) }
        exercises = (try? c.decodeIfPresent([String: String].self, forKey: .exercises))?.flatMap { $0.compactMapValues(ProgressMode.init(rawValue:)) }
        offWorkouts = try? c.decodeIfPresent([String].self, forKey: .offWorkouts)
    }

    var enabled: Bool { off != true }

    func mode(for exerciseKey: String) -> ProgressMode { exercises?[exerciseKey] ?? mode ?? .reps }

    /// On for this workout: on for the account and not turned off for it, or for the workout it was
    /// copied from.
    func on(for r: Runsheet) -> Bool {
        enabled && !r.lineage.contains { (offWorkouts ?? []).contains($0) }
    }

    /// Ask the setup question on a workout that has a loaded exercise, once per account.
    func shouldAsk(_ r: Runsheet) -> Bool {
        asked != true && enabled && r.exerciseSteps.contains { ($0.target ?? 0) > 0 && $0.shortUnit != "kph" && Measure.of($0.exercise.unit) == nil }
    }

    // MARK: - Changes

    func answered(yes: Bool, mode: ProgressMode? = nil) -> SuggestPrefs {
        var p = self
        p.asked = true
        p.off = yes ? nil : true
        if let mode { p.mode = mode }
        return p
    }

    func setting(workout r: Runsheet, on: Bool) -> SuggestPrefs {
        var p = self
        var ids = (p.offWorkouts ?? []).filter { !r.lineage.contains($0) }
        if !on { ids.append(r.key) }
        p.offWorkouts = ids.isEmpty ? nil : ids
        return p
    }

    /// Nil follows the account's mode.
    func setting(exercise key: String, mode: ProgressMode?) -> SuggestPrefs {
        var p = self
        var m = p.exercises ?? [:]
        m[key] = mode
        p.exercises = m.isEmpty ? nil : m
        return p
    }

    // MARK: - Mirror

    /// Mirrored into UserDefaults by the store, so the engine and the targets read it the way they
    /// read the equipment.
    static let storageKey = "suggestions"

    static func current(_ defaults: UserDefaults = .standard) -> SuggestPrefs {
        defaults.data(forKey: storageKey).flatMap { try? JSONDecoder().decode(SuggestPrefs.self, from: $0) } ?? SuggestPrefs()
    }

    static func store(_ p: SuggestPrefs, _ defaults: UserDefaults = .standard) {
        if p != SuggestPrefs(), let data = try? JSONEncoder().encode(p) { defaults.set(data, forKey: storageKey) } else { defaults.removeObject(forKey: storageKey) }
    }

    /// The prefs JSON value, nil for the default (written as a cleared field).
    var json: Any? {
        guard self != SuggestPrefs(), let data = try? JSONEncoder().encode(self) else { return nil }
        return try? JSONSerialization.jsonObject(with: data)
    }

    static func from(json: Any?) -> SuggestPrefs {
        guard let json, JSONSerialization.isValidJSONObject(json), let data = try? JSONSerialization.data(withJSONObject: json) else { return SuggestPrefs() }
        return (try? JSONDecoder().decode(SuggestPrefs.self, from: data)) ?? SuggestPrefs()
    }
}
