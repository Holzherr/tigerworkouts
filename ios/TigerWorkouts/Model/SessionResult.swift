import Foundation

/// One set as it was done: the reps counted and the load in hand.
struct SetResult: Codable, Hashable, Sendable {
    enum CodingKeys: String, CodingKey, CaseIterable {
        case reps, load, at, type, seconds, meters, calories, rpe
    }

    var reps: Double?
    var load: Double?
    /// When the set was ticked, in seconds of session time (pauses excluded). Nil on rows from
    /// before times were kept.
    var at: Double? = nil
    /// Warm-up, drop set or to failure; nil for a normal set and on rows from before types.
    var type: SetType? = nil
    /// Time actually worked on the set, seconds: a countdown for as long as it ran (Done early keeps
    /// the real time), a hold or a distance for as long as it took. Nil on rows from before it was kept.
    var seconds: Double? = nil
    /// Distance covered, metres: the plan's unless changed on the timer or afterwards.
    var meters: Double? = nil
    /// Calories on the machine's counter: the plan's unless changed.
    var calories: Double? = nil
    /// How hard the set was, RPE 1–10 (10 = nothing left). Logged for lifts progressed by effort
    /// (`ProgressMode.effort`); nil everywhere else and on rows from before it was kept.
    var rpe: Double? = nil
    /// Keys a newer app wrote that this one does not know, carried through unchanged.
    var extra: [String: JSONValue] = [:]

    /// Anything but a warm-up counts as work.
    var isWorking: Bool { type != .warmup }

    init(reps: Double? = nil, load: Double? = nil, at: Double? = nil, type: SetType? = nil, seconds: Double? = nil, meters: Double? = nil, calories: Double? = nil, rpe: Double? = nil) {
        self.reps = reps
        self.load = load
        self.at = at
        self.type = type
        self.seconds = seconds
        self.meters = meters
        self.calories = calories
        self.rpe = rpe
    }

    init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        reps = try c.decodeIfPresent(Double.self, forKey: .reps)
        load = try c.decodeIfPresent(Double.self, forKey: .load)
        at = try c.decodeIfPresent(Double.self, forKey: .at)
        type = try c.decodeIfPresent(SetType.self, forKey: .type)
        seconds = try c.decodeIfPresent(Double.self, forKey: .seconds)
        meters = try c.decodeIfPresent(Double.self, forKey: .meters)
        calories = try c.decodeIfPresent(Double.self, forKey: .calories)
        rpe = try c.decodeIfPresent(Double.self, forKey: .rpe)
        extra = UnknownKeys.decode(decoder, known: CodingKeys.self)
    }

    func encode(to encoder: any Encoder) throws {
        try UnknownKeys.encode(extra, to: encoder)
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(reps, forKey: .reps)
        try c.encodeIfPresent(load, forKey: .load)
        try c.encodeIfPresent(at, forKey: .at)
        try c.encodeIfPresent(type, forKey: .type)
        try c.encodeIfPresent(seconds, forKey: .seconds)
        try c.encodeIfPresent(meters, forKey: .meters)
        try c.encodeIfPresent(calories, forKey: .calories)
        try c.encodeIfPresent(rpe, forKey: .rpe)
    }
}

/// When each round of a circuit or AMRAP block finished, in seconds of session time. `at[0]` is
/// round 1. A round left unfinished (the AMRAP cap came mid-round) is not in the list.
struct RoundSplit: Codable, Hashable, Sendable {
    var blockId: String
    var at: [Double]
    /// Session time the block started at, same clock as `at`. Nil on sessions logged before it was kept.
    var from: Double? = nil
    /// Session time each round's work began, same clock: a round's time runs from here, so the rest
    /// before it is not in it. Nil on sessions logged before it was kept.
    var starts: [Double]? = nil
}

/// What was logged for one exercise step in a session.
struct StepResult: Codable, Hashable, Sendable, Identifiable {
    enum CodingKeys: String, CodingKey, CaseIterable {
        case stepId, exerciseKey, target, incline, reps, success, sets
    }
    var stepId: String
    var exerciseKey: String
    /// Load actually used, in the exercise's unit.
    var target: Double?
    /// Treadmill incline actually used.
    var incline: Double?
    /// Reps achieved, one entry per set.
    var reps: [Double]?
    var success: Bool?
    /// Each set in order, with its own reps and load. `target` and `reps` stay for older readers.
    var sets: [SetResult]?
    /// Keys a newer app wrote that this one does not know, carried through unchanged.
    var extra: [String: JSONValue] = [:]

    /// A step swapped mid-session has a row per exercise, so the step id alone is not unique.
    var id: String { "\(stepId)|\(exerciseKey)" }

    init(stepId: String, exerciseKey: String, target: Double? = nil, incline: Double? = nil, reps: [Double]? = nil, success: Bool? = nil, sets: [SetResult]? = nil) {
        self.stepId = stepId
        self.exerciseKey = exerciseKey
        self.target = target
        self.incline = incline
        self.reps = reps
        self.success = success
        self.sets = sets
    }

    init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        stepId = try c.decode(String.self, forKey: .stepId)
        exerciseKey = try c.decode(String.self, forKey: .exerciseKey)
        target = try c.decodeIfPresent(Double.self, forKey: .target)
        incline = try c.decodeIfPresent(Double.self, forKey: .incline)
        reps = try c.decodeIfPresent([Double].self, forKey: .reps)
        success = try c.decodeIfPresent(Bool.self, forKey: .success)
        sets = try c.decodeIfPresent([SetResult].self, forKey: .sets)
        extra = UnknownKeys.decode(decoder, known: CodingKeys.self)
    }

    func encode(to encoder: any Encoder) throws {
        try UnknownKeys.encode(extra, to: encoder)
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(stepId, forKey: .stepId)
        try c.encode(exerciseKey, forKey: .exerciseKey)
        try c.encodeIfPresent(target, forKey: .target)
        try c.encodeIfPresent(incline, forKey: .incline)
        try c.encodeIfPresent(reps, forKey: .reps)
        try c.encodeIfPresent(success, forKey: .success)
        try c.encodeIfPresent(sets, forKey: .sets)
    }
}

/// Heart-rate summary attached after a workout, from Apple Health or another device. The web app
/// reads the same field, so a session logged on the phone shows its heart rate there too.
struct DeviceSummary: Codable, Hashable, Sendable {
    var avgHr: Double?
    var maxHr: Double?
    var calories: Double?
    var source: String?
}

struct ActivityLog: Codable, Hashable, Sendable {
    var name: String
    var icon: String?
    var minutes: Double
    var intensity: String?
}

/// The list the user tapped to reach the workout, in the web app's words (`SessionOrigin` in
/// progression.ts): a Discover feed, their own list, a past session, a share link, or a workout a
/// coach assigned (`coach`, G-13).
enum SessionOrigin: String, CaseIterable, Codable, Sendable {
    case recommended, saved, search, mine, history, link, home, coach
    case upNext = "up_next"
}

/// One finished session. The shape the web app writes as `data` on a `sessions` row, so both
/// apps read each other's history without a migration.
struct SessionResult: Codable, Hashable, Sendable, Identifiable {
    enum CodingKeys: String, CodingKey, CaseIterable {
        case id, runsheetId, startedFrom, title, startedAt, tzOffsetMin, endedAt, durationSec, completed, activity, device, score, scoreText, capped, capReps, steps, splits, notes, rpe, version
    }

    var id: String?
    var runsheetId: String
    /// A `SessionOrigin` literal, kept as the string it came with so a row written by a newer web
    /// app still decodes. Unset for a resumed session and rows from before it was recorded.
    var startedFrom: String?
    var title: String?
    var startedAt: String
    /// Minutes east of UTC where the session was done, so its day and week follow that zone
    /// wherever History is read (review A10). Nil on rows from before it was kept.
    var tzOffsetMin: Double?
    var endedAt: String?
    var durationSec: Double?
    var completed: Bool?
    var activity: ActivityLog?
    var device: DeviceSummary?
    var score: Double?
    var scoreText: String?
    /// A for-time block's cap ran out before it was finished: `score` is the cap, not a finish
    /// time, and `capReps` the reps reached by then. Nil on a finish and on rows from before it was kept.
    var capped: Bool?
    var capReps: Double?
    var steps: [StepResult] = []
    /// Round times per circuit or AMRAP block; nil on rows from before times were kept.
    var splits: [RoundSplit]?
    var notes: String?
    /// How hard the session felt, 1–10, tapped on the finish screen. Apple Health's workout effort
    /// scale; the web writes the same field.
    var rpe: Double?
    /// What this session ran when it was not the workout as saved ("Just this time", a change mid-
    /// session): its items. Nil when it ran the workout as it is (Versions.swift).
    var version: SessionVersion?
    /// Keys a newer app wrote that this one does not know, carried through the cache and back to
    /// the server unchanged (review A4).
    var extra: [String: JSONValue] = [:]

    var rowId: String { id ?? "\(runsheetId)@\(startedAt)" }
    var startedDate: Date { ISO8601.date(startedAt) ?? .distantPast }
    /// The start as a Date whose wall time in this phone's zone reads the session's own wall
    /// clock: days and weeks are grouped and shown by it. `wallDate` in dates.ts.
    var wallDate: Date { SessionResult.wallDate(startedDate, tzOffsetMin: tzOffsetMin) }

    static func wallDate(_ at: Date, tzOffsetMin: Double?, zone: TimeZone = .current) -> Date {
        guard let tz = tzOffsetMin, tz.isFinite, abs(tz) <= 14 * 60 else { return at }
        // Shift by the difference between the session's offset and this zone's at that instant.
        return at.addingTimeInterval(tz * 60 - Double(zone.secondsFromGMT(for: at)))
    }
    var displayTitle: String { title ?? activity?.name ?? runsheetId }

    init(runsheetId: String, title: String?, startedAt: String, endedAt: String? = nil, durationSec: Double? = nil, completed: Bool? = nil, score: Double? = nil, steps: [StepResult] = [], notes: String? = nil, id: String? = nil, startedFrom: String? = nil) {
        self.id = id
        self.runsheetId = runsheetId
        self.startedFrom = startedFrom
        self.title = title
        self.startedAt = startedAt
        self.endedAt = endedAt
        self.durationSec = durationSec
        self.completed = completed
        self.score = score
        self.steps = steps
        self.notes = notes
    }

    init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(String.self, forKey: .id)
        runsheetId = try c.decodeIfPresent(String.self, forKey: .runsheetId) ?? ""
        startedFrom = try c.decodeIfPresent(String.self, forKey: .startedFrom)
        title = try c.decodeIfPresent(String.self, forKey: .title)
        startedAt = try c.decodeIfPresent(String.self, forKey: .startedAt) ?? ISO8601.string(Date())
        tzOffsetMin = try? c.decodeIfPresent(Double.self, forKey: .tzOffsetMin)
        endedAt = try c.decodeIfPresent(String.self, forKey: .endedAt)
        durationSec = try c.decodeIfPresent(Double.self, forKey: .durationSec)
        completed = try c.decodeIfPresent(Bool.self, forKey: .completed)
        activity = try c.decodeIfPresent(ActivityLog.self, forKey: .activity)
        device = try c.decodeIfPresent(DeviceSummary.self, forKey: .device)
        score = try c.decodeIfPresent(Double.self, forKey: .score)
        scoreText = try c.decodeIfPresent(String.self, forKey: .scoreText)
        capped = try c.decodeIfPresent(Bool.self, forKey: .capped)
        capReps = try c.decodeIfPresent(Double.self, forKey: .capReps)
        steps = try c.decodeIfPresent([StepResult].self, forKey: .steps) ?? []
        splits = try c.decodeIfPresent([RoundSplit].self, forKey: .splits)
        notes = try c.decodeIfPresent(String.self, forKey: .notes)
        rpe = try c.decodeIfPresent(Double.self, forKey: .rpe)
        version = try? c.decodeIfPresent(SessionVersion.self, forKey: .version)
        extra = UnknownKeys.decode(decoder, known: CodingKeys.self)
        // A version this app cannot read is kept as it came, so an edit here does not drop it.
        if version == nil, let raw = UnknownKeys.raw(decoder, key: CodingKeys.version.stringValue) { extra[CodingKeys.version.stringValue] = raw }
    }

    func encode(to encoder: any Encoder) throws {
        try UnknownKeys.encode(extra, to: encoder)
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(id, forKey: .id)
        try c.encode(runsheetId, forKey: .runsheetId)
        try c.encodeIfPresent(startedFrom, forKey: .startedFrom)
        try c.encodeIfPresent(title, forKey: .title)
        try c.encode(startedAt, forKey: .startedAt)
        try c.encodeIfPresent(tzOffsetMin, forKey: .tzOffsetMin)
        try c.encodeIfPresent(endedAt, forKey: .endedAt)
        try c.encodeIfPresent(durationSec, forKey: .durationSec)
        try c.encodeIfPresent(completed, forKey: .completed)
        try c.encodeIfPresent(activity, forKey: .activity)
        try c.encodeIfPresent(device, forKey: .device)
        try c.encodeIfPresent(score, forKey: .score)
        try c.encodeIfPresent(scoreText, forKey: .scoreText)
        try c.encodeIfPresent(capped, forKey: .capped)
        try c.encodeIfPresent(capReps, forKey: .capReps)
        try c.encode(steps, forKey: .steps)
        try c.encodeIfPresent(splits, forKey: .splits)
        try c.encodeIfPresent(notes, forKey: .notes)
        try c.encodeIfPresent(rpe, forKey: .rpe)
        if let version { try c.encode(version, forKey: .version) }
    }
}

/// Keys a type does not know, read and written as they came: a newer app's fields survive the
/// phone's cache and an edit made here (review A4).
enum UnknownKeys {
    struct Key: CodingKey {
        var stringValue: String
        var intValue: Int? { nil }
        init(_ s: String) { stringValue = s }
        init?(stringValue: String) { self.stringValue = stringValue }
        init?(intValue: Int) { nil }
    }

    static func decode<K: CodingKey & CaseIterable>(_ decoder: any Decoder, known: K.Type) -> [String: JSONValue] {
        guard let c = try? decoder.container(keyedBy: Key.self) else { return [:] }
        let names = Set(K.allCases.map(\.stringValue))
        var out: [String: JSONValue] = [:]
        for k in c.allKeys where !names.contains(k.stringValue) {
            if let v = try? c.decode(JSONValue.self, forKey: k) { out[k.stringValue] = v }
        }
        return out
    }

    /// One key's value as raw JSON, whatever its shape.
    static func raw(_ decoder: any Decoder, key: String) -> JSONValue? {
        guard let c = try? decoder.container(keyedBy: Key.self) else { return nil }
        return try? c.decodeIfPresent(JSONValue.self, forKey: Key(key))
    }

    static func encode(_ extra: [String: JSONValue], to encoder: any Encoder) throws {
        guard !extra.isEmpty else { return }
        var c = encoder.container(keyedBy: Key.self)
        for (k, v) in extra { try c.encode(v, forKey: Key(k)) }
    }
}

enum ISO8601 {
    private static let withFraction: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    private static let plain = ISO8601DateFormatter()

    /// Supabase writes both `…Z` and `…​.123Z`, and Postgres hands back `…+00:00`.
    static func date(_ s: String) -> Date? {
        withFraction.date(from: s) ?? plain.date(from: s) ?? {
            let f = DateFormatter()
            f.locale = Locale(identifier: "en_US_POSIX")
            f.dateFormat = "yyyy-MM-dd'T'HH:mm:ss.SSSSSSXXXXX"
            return f.date(from: s)
        }()
    }

    static func string(_ d: Date) -> String { withFraction.string(from: d) }
}

// MARK: - Legacy sessions

/// The v0.9 app's session shape. Read-only: history from before the React app still has to show.
private struct LegacySession: Decodable {
    struct Exercise: Decodable {
        var ex: String
        var target: Double?
        var actual: Double?
        var reps: Double?
        var removed: Bool?
        var done: [Done]?
        struct Done: Decodable { var reps: Double?; var weight: Double? }
    }
    struct LegacyBlock: Decodable {
        var type: String?
        var name: String?
        var skipped: Bool?
        var exercises: [Exercise]?
        var ex: String?
        var speeds_actual: [Double]?
        var minutes_done: Double?
    }
    var id: String?
    var workoutId: String?
    var title: String?
    var type: String?
    var startedAt: String
    var endedAt: String?
    var duration_min: Double?
    var completed: Bool?
    var notes: String?
    var icon: String?
    var intensity: String?
    var blocks: [LegacyBlock]?
}

enum SessionRow {
    /// Read a `sessions` row's `data`, whichever app wrote it.
    static func decode(id: String, data: Data) -> SessionResult? {
        let d = JSONDecoder()
        if let probe = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            if probe["format"] as? String == "v2" {
                var r = try? d.decode(SessionResult.self, from: data)
                r?.id = id
                return r
            }
            // A legacy row the newer app has already touched carries the v2 payload inside it.
            if let v2 = probe["v2"], JSONSerialization.isValidJSONObject(v2),
               let inner = try? JSONSerialization.data(withJSONObject: v2),
               var r = try? d.decode(SessionResult.self, from: inner) {
                r.id = id
                return r
            }
            if probe["startedAt"] != nil, let legacy = try? d.decode(LegacySession.self, from: data) {
                return fromLegacy(legacy, id: id)
            }
        }
        var r = try? d.decode(SessionResult.self, from: data)
        r?.id = id
        return r
    }

    private static func fromLegacy(_ s: LegacySession, id: String) -> SessionResult {
        var steps: [StepResult] = []
        for (bi, b) in (s.blocks ?? []).enumerated() where !(b.skipped ?? false) {
            for (ei, e) in (b.exercises ?? []).enumerated() where !(e.removed ?? false) {
                steps.append(StepResult(
                    stepId: "\(bi)-\(ei)-\(e.ex)",
                    exerciseKey: e.ex,
                    target: e.actual ?? e.target,
                    incline: nil,
                    reps: e.done?.compactMap(\.reps),
                    success: nil
                ))
            }
            if b.type == "steady", let ex = b.ex {
                steps.append(StepResult(stepId: "\(bi)-\(ex)", exerciseKey: ex, target: b.speeds_actual?.first, incline: nil, reps: nil, success: nil))
            }
        }
        var r = SessionResult(
            runsheetId: s.workoutId ?? s.id ?? id,
            title: s.title,
            startedAt: s.startedAt,
            endedAt: s.endedAt,
            durationSec: s.duration_min.map { $0 * 60 },
            completed: s.completed,
            steps: steps,
            notes: (s.notes?.isEmpty ?? true) ? nil : s.notes,
            id: s.id ?? id
        )
        if s.type == "activity" {
            r.activity = ActivityLog(name: s.title ?? id, icon: s.icon, minutes: s.duration_min ?? 0, intensity: s.intensity)
        }
        r.id = id
        return r
    }

    /// The row body to upsert. New sessions go up as v2 with an empty `blocks[]`, exactly as the
    /// web app writes them, so the old app can still read the row without choking.
    ///
    /// `existing` is the row's `data` as the server has it, when there is one. The result is laid
    /// over it rather than replacing it, so whatever the web app keeps there that this app does not
    /// read (`legacy`, fields added later) survives an edit made on the phone. A v0.9 row keeps its
    /// own shape, with the edited dates, duration and notes on top and the full result under `v2`,
    /// as `toRow` in sync.ts writes it.
    static func encode(_ r: SessionResult, owner: String, existing: [String: Any]? = nil) -> [String: Any] {
        var obj: [String: Any] = [:]
        if let body = try? JSONEncoder().encode(r),
           let o = try? JSONSerialization.jsonObject(with: body) as? [String: Any] {
            obj = o
        }
        /// Keys this app owns: cleared first, so a field emptied on the phone (notes, effort) goes.
        func laid(over base: [String: Any]) -> [String: Any] {
            var d = base
            // A version this app could not read stays: the phone never clears one.
            for key in SessionResult.CodingKeys.allCases.map(\.stringValue) where key != "version" || obj["version"] != nil { d.removeValue(forKey: key) }
            d.merge(obj) { _, new in new }
            return d
        }
        var data: [String: Any]
        if let existing, existing["format"] as? String != "v2", existing["startedAt"] != nil {
            data = existing
            data["notes"] = r.notes ?? ""
            data["startedAt"] = r.startedAt
            if let end = r.endedAt { data["endedAt"] = end }
            if let d = r.durationSec { data["duration_min"] = Int((d / 60).rounded()) }
            data["v2"] = laid(over: existing["v2"] as? [String: Any] ?? [:])
        } else {
            data = laid(over: existing ?? [:])
            data["format"] = "v2"
            if data["blocks"] == nil { data["blocks"] = [] as [Any] }
        }
        let legacyType = data["v2"] != nil ? (data["type"] as? String ?? "workout") : nil
        return [
            "id": r.rowId,
            "owner": owner,
            "workout_id": r.activity != nil ? NSNull() : r.runsheetId,
            "type": r.activity != nil ? "activity" : legacyType ?? "v2",
            "title": r.displayTitle,
            "started_at": r.startedAt,
            "ended_at": r.endedAt ?? NSNull(),
            "duration_min": Int(((r.durationSec ?? (r.activity?.minutes).map { $0 * 60 } ?? 0) / 60).rounded()),
            "completed": r.completed ?? true,
            "data": data,
        ]
    }
}

/// A random tag made once per install. Session ids are one key across every account, and the
/// timer's id is built from the start time so a result saved twice replaces itself; the tag keeps
/// two people who press Start in the same millisecond apart. Sessions saved before it ended "-run".
enum DeviceTag {
    static let key = "deviceTag"

    /// Read or made once per launch (a static let is initialised once, whatever thread asks first).
    nonisolated static let current: String = current(in: .standard)

    nonisolated static func current(in defaults: UserDefaults) -> String {
        if let tag = defaults.string(forKey: key), !tag.isEmpty { return tag }
        let tag = String(UUID().uuidString.replacingOccurrences(of: "-", with: "").prefix(12)).lowercased()
        defaults.set(tag, forKey: key)
        return tag
    }
}
