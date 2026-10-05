import Foundation
import Testing
@testable import TigerWorkouts

/// Coaching (migration 0008): the rows the client reads, the done tick, and the invite link.
@Suite("coaching")
struct CoachingTests {
    private func data(_ s: String) -> Data { Data(s.utf8) }

    @Test("assignment rows decode from PostgREST's snake_case, nulls and all")
    func assignmentRows() throws {
        let json = """
        [{"id":"a1","coach":"c","client":"u","workout_id":"w-9","note":"Go easy on the swings","due_on":"2026-10-06","archived":false,"created_at":"2026-10-04T09:12:33.123456+00:00"},
         {"id":"a2","coach":"c","client":"u","workout_id":"w-10","note":null,"due_on":null,"archived":true,"created_at":"2026-10-01T08:00:00+00:00"}]
        """
        let rows = try JSONDecoder().decode([Assignment].self, from: data(json))
        #expect(rows.count == 2)
        #expect(rows[0].workoutId == "w-9")
        #expect(rows[0].note == "Go easy on the swings")
        #expect(rows[0].dueOn == "2026-10-06")
        #expect(rows[0].createdDate != .distantPast)
        #expect(rows[1].note == nil && rows[1].archived)
    }

    @Test("note, link and invite rows decode")
    func otherRows() throws {
        let notes = try JSONDecoder().decode([CoachNote].self, from: data("""
        [{"id":"n1","coach":"c","client":"u","author":"c","session_id":null,"assignment_id":"a1","body":"Keep the rest short","created_at":"2026-10-04T09:13:00.5+00:00"},
         {"id":"n2","coach":"c","client":"u","author":"u","session_id":"s-1","assignment_id":null,"body":"Done!","created_at":"2026-10-04T10:00:00+00:00"}]
        """))
        #expect(notes[0].assignmentId == "a1" && notes[0].sessionId == nil)
        #expect(notes[1].sessionId == "s-1" && notes[1].author == "u")

        let links = try JSONDecoder().decode([CoachLink].self, from: data(#"[{"coach":"c","client":"u","status":"active"},{"coach":"d","client":"u","status":"ended"}]"#))
        #expect(links.map(\.isActive) == [true, false])

        let invite = try JSONDecoder().decode(CoachInvite.self, from: data(#"{"coach":"c","name":"Sam","handle":null,"accepted":false}"#))
        #expect(invite.name == "Sam" && invite.handle == nil && !invite.accepted)
    }

    @Test("an assigned workout in the coach's workouts row decodes and keeps its row id")
    func assignedWorkoutRow() throws {
        Library.shared.load()
        let body = data(#"[{"id":"w-coach-1","creator":"Sam","title":"Legs","public":false,"data":{"id":"local","title":"Legs","items":[{"kind":"exercise","id":"s1","exercise":"bw_squat","forMode":"reps","forValue":10}]}}]"#)
        let sheets = Supabase.decodeWorkouts(body)
        #expect(sheets.first?.key == "w-coach-1")
    }

    @Test("the home section lists active links' unarchived assignments, newest first")
    func activeAssignments() {
        var s = CoachingState()
        s.links = [CoachLink(coach: "c", client: "u", status: "active"), CoachLink(coach: "d", client: "u", status: "ended")]
        s.assignments = [
            Assignment(id: "old", coach: "c", client: "u", workoutId: "w1", createdAt: "2026-10-01T00:00:00Z"),
            Assignment(id: "new", coach: "c", client: "u", workoutId: "w2", createdAt: "2026-10-03T00:00:00Z"),
            Assignment(id: "gone", coach: "c", client: "u", workoutId: "w3", archived: true, createdAt: "2026-10-04T00:00:00Z"),
            Assignment(id: "ended", coach: "d", client: "u", workoutId: "w4", createdAt: "2026-10-04T00:00:00Z"),
        ]
        #expect(Coaching.active(s).map(\.id) == ["new", "old"])
        #expect(Coaching.assignment(forWorkout: "w1", in: s)?.id == "old")
        #expect(Coaching.name(of: "c", in: s) == "Your coach")
    }

    @Test("done once a session of that workout started after the assignment was made")
    func doneTick() {
        let a = Assignment(id: "a", coach: "c", client: "u", workoutId: "w-9", createdAt: "2026-10-04T09:00:00.000000+00:00")
        let before = SessionResult(runsheetId: "w-9", title: nil, startedAt: "2026-10-03T09:00:00.000Z")
        let other = SessionResult(runsheetId: "w-8", title: nil, startedAt: "2026-10-05T09:00:00.000Z")
        let after = SessionResult(runsheetId: "w-9", title: nil, startedAt: "2026-10-04T18:30:00.000Z")
        #expect(!Coaching.isDone(a, results: []))
        #expect(!Coaching.isDone(a, results: [before, other]))
        #expect(Coaching.isDone(a, results: [before, other, after]))
    }

    @Test("an unedited assigned workout uploads its session under the coach's workout id")
    @MainActor
    func sessionWorkoutId() throws {
        Library.shared.load()
        let body = data(#"[{"id":"w-coach-1","title":"Legs","data":{"title":"Legs","items":[{"kind":"exercise","id":"s1","exercise":"bw_squat","forMode":"reps","forValue":10}]}}]"#)
        let sheet = try #require(Supabase.decodeWorkouts(body).first)
        let store = Store()
        store.coaching.workouts = [sheet]
        // What the detail page does: seed, then the root prepares it for the timer.
        let found = try #require(store.workout(id: "w-coach-1"))
        let runner = SessionRunner(runsheet: store.prepared(store.seeded(found)), startedFrom: .coach)
        let result = runner.result()
        #expect(result.startedFrom == "coach")
        let row = SessionRow.encode(result, owner: "u")
        #expect(row["workout_id"] as? String == "w-coach-1")
    }

    @Test("invite links from the web and the app scheme", arguments: [
        ("https://tigerworkouts.com/#/join/AbC-12_xyz", "AbC-12_xyz"),
        ("https://www.tigerworkouts.com/#/join/AbC-12_xyz/", "AbC-12_xyz"),
        ("https://tigerworkouts.com/#/join/AbC?utm_source=wa", "AbC"),
        ("tigerworkouts://join/AbC-12_xyz", "AbC-12_xyz"),
    ])
    func joinLinks(_ link: String, _ code: String) throws {
        #expect(JoinLink.code(from: try #require(URL(string: link))) == code)
    }

    @Test("other links are not invites", arguments: [
        "https://tigerworkouts.com/#/w/fran",
        "https://tigerworkouts.com/#/join/",
        "https://example.com/#/join/abc",
        "tigerworkouts://w/fran",
        "tigerworkouts://auth?code=1",
        "tigerworkouts://join",
    ])
    func notJoinLinks(_ link: String) throws {
        #expect(JoinLink.code(from: try #require(URL(string: link))) == nil)
    }
}
