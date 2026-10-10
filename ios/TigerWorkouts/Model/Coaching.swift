import Foundation

/// Coaching (G-13, migration 0008): a PT invites a client with a link, assigns them workouts and
/// leaves notes. These mirror the rows the client can read; the PT's side lives on the web.

/// `coach_clients`: who coaches whom. Either side may end it.
struct CoachLink: Codable, Hashable, Sendable {
    var coach: String
    var client: String
    var status: String

    var isActive: Bool { status == "active" }
}

/// `assignments`: a workout a PT sent this client. `workoutId` is the PT's own `workouts` row.
struct Assignment: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var coach: String
    var client: String
    var workoutId: String
    var note: String?
    var dueOn: String?
    var archived: Bool
    var createdAt: String

    enum CodingKeys: String, CodingKey {
        case id, coach, client, note, archived
        case workoutId = "workout_id"
        case dueOn = "due_on"
        case createdAt = "created_at"
    }

    init(id: String, coach: String, client: String, workoutId: String, note: String? = nil, dueOn: String? = nil, archived: Bool = false, createdAt: String) {
        self.id = id
        self.coach = coach
        self.client = client
        self.workoutId = workoutId
        self.note = note
        self.dueOn = dueOn
        self.archived = archived
        self.createdAt = createdAt
    }

    init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        coach = try c.decode(String.self, forKey: .coach)
        client = try c.decode(String.self, forKey: .client)
        workoutId = try c.decode(String.self, forKey: .workoutId)
        note = try c.decodeIfPresent(String.self, forKey: .note)
        dueOn = try c.decodeIfPresent(String.self, forKey: .dueOn)
        archived = try c.decodeIfPresent(Bool.self, forKey: .archived) ?? false
        createdAt = try c.decode(String.self, forKey: .createdAt)
    }

    var createdDate: Date { ISO8601.date(createdAt) ?? .distantPast }
}

/// `coach_notes`: a short note on an assignment or a session, written by either side.
struct CoachNote: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var coach: String
    var client: String
    var author: String
    var sessionId: String?
    var assignmentId: String?
    var body: String
    var createdAt: String

    enum CodingKeys: String, CodingKey {
        case id, coach, client, author, body
        case sessionId = "session_id"
        case assignmentId = "assignment_id"
        case createdAt = "created_at"
    }

    var createdDate: Date { ISO8601.date(createdAt) ?? .distantPast }
}

/// What `coach_invite_info(p_code)` shows before an invite is accepted: the PT's name, nothing else.
struct CoachInvite: Codable, Hashable, Sendable {
    var coach: String
    var name: String
    var handle: String?
    var accepted: Bool
}

/// Everything the client side holds about coaching, cached on disk beside the main cache.
struct CoachingState: Codable, Hashable, Sendable {
    var links: [CoachLink] = []
    var assignments: [Assignment] = []
    /// The assigned workouts themselves: the PT's rows, readable while the link is active.
    var workouts: [Runsheet] = []
    var notes: [CoachNote] = []
    /// Coach id → name from `profiles`.
    var names: [String: String] = [:]
}

enum Coaching {
    /// What the home section lists: not archived, from a coach whose link is still active, newest first.
    static func active(_ s: CoachingState) -> [Assignment] {
        let coaches = Set(s.links.filter(\.isActive).map(\.coach))
        return s.assignments
            .filter { !$0.archived && coaches.contains($0.coach) }
            .sorted { $0.createdDate > $1.createdDate }
    }

    /// Done once a session of that very workout started after the assignment was made: the rule
    /// the server's `pt_client_runs` counts (a session's `workout_id` matching the assignment's).
    static func isDone(_ a: Assignment, results: [SessionResult]) -> Bool {
        let since = a.createdDate
        return results.contains { $0.runsheetId == a.workoutId && $0.activity == nil && $0.startedDate > since }
    }

    /// The newest active assignment of a workout, for its page and its finish screen.
    static func assignment(forWorkout id: String, in s: CoachingState) -> Assignment? {
        active(s).first { $0.workoutId == id }
    }

    static func name(of coach: String, in s: CoachingState) -> String {
        let n = s.names[coach]?.trimmingCharacters(in: .whitespaces) ?? ""
        return n.isEmpty ? "Your coach" : n
    }

    /// Notes on an assignment, oldest first, as a conversation reads.
    static func notes(for a: Assignment, in s: CoachingState) -> [CoachNote] {
        s.notes.filter { $0.assignmentId == a.id }.sorted { $0.createdDate < $1.createdDate }
    }
}

/// The invite link: `https://tigerworkouts.com/#/join/<code>` from the web, or
/// `tigerworkouts://join/<code>` into the app.
enum JoinLink {
    static func code(from url: URL) -> String? {
        let raw: String?
        if url.scheme == "tigerworkouts" {
            guard url.host == "join" else { return nil }
            raw = url.pathComponents.dropFirst().first
        } else if url.scheme == "https" || url.scheme == "http",
                  let host = url.host, host == "tigerworkouts.com" || host == "www.tigerworkouts.com" {
            // The web router is hash-based: the code sits in the fragment, `/join/<code>`.
            let parts = (url.fragment ?? "").split(separator: "/", omittingEmptySubsequences: true)
            guard parts.count >= 2, parts[0] == "join" else { return nil }
            raw = String(parts[1])
        } else {
            raw = nil
        }
        // A query or trailing junk a messenger appended is not part of the code.
        guard let code = raw?.split(separator: "?").first.map(String.init)?.removingPercentEncoding,
              !code.isEmpty else { return nil }
        return code
    }
}
