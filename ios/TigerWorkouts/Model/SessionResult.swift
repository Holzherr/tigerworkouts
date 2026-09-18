import Foundation

/// What was logged for one exercise step in a session.
struct StepResult: Codable, Hashable, Sendable, Identifiable {
    var stepId: String
    var exerciseKey: String
    /// Load actually used, in the exercise's unit.
    var target: Double?
    /// Treadmill incline actually used.
    var incline: Double?
    /// Reps achieved, one entry per set.
    var reps: [Double]?
    var success: Bool?

    var id: String { stepId }
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

/// One finished session. The shape the web app writes as `data` on a `sessions` row, so both
/// apps read each other's history without a migration.
struct SessionResult: Codable, Hashable, Sendable, Identifiable {
    var id: String?
    var runsheetId: String
    var title: String?
    var startedAt: String
    var endedAt: String?
    var durationSec: Double?
    var completed: Bool?
    var activity: ActivityLog?
    var device: DeviceSummary?
    var score: Double?
    var scoreText: String?
    var steps: [StepResult] = []
    var notes: String?

    var rowId: String { id ?? "\(runsheetId)@\(startedAt)" }
    var startedDate: Date { ISO8601.date(startedAt) ?? .distantPast }
    var displayTitle: String { title ?? activity?.name ?? runsheetId }

    init(runsheetId: String, title: String?, startedAt: String, endedAt: String? = nil, durationSec: Double? = nil, completed: Bool? = nil, score: Double? = nil, steps: [StepResult] = [], notes: String? = nil, id: String? = nil) {
        self.id = id
        self.runsheetId = runsheetId
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
        title = try c.decodeIfPresent(String.self, forKey: .title)
        startedAt = try c.decodeIfPresent(String.self, forKey: .startedAt) ?? ISO8601.string(Date())
        endedAt = try c.decodeIfPresent(String.self, forKey: .endedAt)
        durationSec = try c.decodeIfPresent(Double.self, forKey: .durationSec)
        completed = try c.decodeIfPresent(Bool.self, forKey: .completed)
        activity = try c.decodeIfPresent(ActivityLog.self, forKey: .activity)
        device = try c.decodeIfPresent(DeviceSummary.self, forKey: .device)
        score = try c.decodeIfPresent(Double.self, forKey: .score)
        scoreText = try c.decodeIfPresent(String.self, forKey: .scoreText)
        steps = try c.decodeIfPresent([StepResult].self, forKey: .steps) ?? []
        notes = try c.decodeIfPresent(String.self, forKey: .notes)
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
    static func encode(_ r: SessionResult, owner: String) -> [String: Any] {
        var data: [String: Any] = ["format": "v2", "blocks": []]
        if let body = try? JSONEncoder().encode(r),
           let obj = try? JSONSerialization.jsonObject(with: body) as? [String: Any] {
            data.merge(obj) { _, new in new }
        }
        return [
            "id": r.rowId,
            "owner": owner,
            "workout_id": r.activity != nil ? NSNull() : r.runsheetId,
            "type": r.activity != nil ? "activity" : "v2",
            "title": r.displayTitle,
            "started_at": r.startedAt,
            "ended_at": r.endedAt ?? NSNull(),
            "duration_min": Int(((r.durationSec ?? (r.activity?.minutes).map { $0 * 60 } ?? 0) / 60).rounded()),
            "completed": r.completed ?? true,
            "data": data,
        ]
    }
}
