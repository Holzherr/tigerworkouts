import Foundation
import Testing
@testable import TigerWorkouts

/// The `sessions` row is the contract between this app and tigerworkouts.com: one history, two
/// clients. These mirror `src/features/cloud/legacy.test.ts`.
@Suite("session rows")
struct SyncTests {
    private func json(_ object: [String: Any]) -> Data {
        try! JSONSerialization.data(withJSONObject: object)
    }

    @Test("a v2 row round-trips unchanged")
    func v2RoundTrip() {
        let original = SessionResult(
            runsheetId: "cf-girls-fran", title: "Fran", startedAt: "2026-09-06T10:00:00.000Z",
            endedAt: "2026-09-06T10:06:42.000Z", durationSec: 402, completed: true, score: 402,
            steps: [StepResult(stepId: "t", exerciseKey: "bb_thruster", target: 43, incline: nil, reps: [21, 15, 9], success: true)],
            id: "s-x"
        )
        let row = SessionRow.encode(original, owner: "u")
        #expect(row["type"] as? String == "v2")
        #expect(row["duration_min"] as? Int == 7)
        #expect(row["workout_id"] as? String == "cf-girls-fran")

        // The old app reads `blocks`, so a v2 row still carries an empty one.
        let data = row["data"] as! [String: Any]
        #expect(data["format"] as? String == "v2")
        #expect((data["blocks"] as? [Any])?.isEmpty == true)

        let back = SessionRow.decode(id: "s-x", data: json(data))
        #expect(back?.runsheetId == original.runsheetId)
        #expect(back?.score == 402)
        #expect(back?.steps.first?.reps == [21, 15, 9])
        #expect(back?.id == "s-x")
    }

    @Test("startedFrom sits at the top of the row's data, and is absent when unset")
    func startedFrom() {
        // The six literals the web app writes (SessionOrigin in progression.ts), in its order.
        #expect(SessionOrigin.allCases.map(\.rawValue) == ["recommended", "saved", "search", "mine", "history", "link", "home"])

        let mine = SessionResult(runsheetId: "u-1", title: "Mine", startedAt: "2026-09-27T10:00:00.000Z", id: "s-a", startedFrom: "mine")
        let data = SessionRow.encode(mine, owner: "u")["data"] as! [String: Any]
        #expect(data["startedFrom"] as? String == "mine")
        #expect(SessionRow.decode(id: "s-a", data: json(data))?.startedFrom == "mine")

        let unset = SessionRow.encode(SessionResult(runsheetId: "u-1", title: "Mine", startedAt: "2026-09-27T10:00:00.000Z"), owner: "u")["data"] as! [String: Any]
        #expect(unset["startedFrom"] == nil)

        // A row the web wrote: decodes, and re-encodes with the value it came with.
        let web: [String: Any] = ["format": "v2", "blocks": [], "runsheetId": "cf-girls-fran", "startedAt": "2026-09-20T10:00:00.000Z", "startedFrom": "recommended", "steps": []]
        let r = SessionRow.decode(id: "s-y", data: json(web))
        #expect(r?.startedFrom == "recommended")
        #expect((SessionRow.encode(r!, owner: "u")["data"] as! [String: Any])["startedFrom"] as? String == "recommended")
        // A row from before the field existed still decodes.
        #expect(SessionRow.decode(id: "s-z", data: json(["format": "v2", "blocks": [], "runsheetId": "w", "startedAt": "2026-09-01T10:00:00.000Z"]))?.startedFrom == nil)
    }

    @Test("a v0.9 session converts, keeping the load actually used")
    func legacy() {
        let legacy: [String: Any] = [
            "id": "s-mtn8vr5s7i1z",
            "workoutId": "priyanka-swings-incline-press-sprints",
            "title": "Swings, incline press & sprints",
            "startedAt": "2026-09-04T17:20:00.000Z",
            "endedAt": "2026-09-04T18:00:00.000Z",
            "duration_min": 40,
            "completed": true,
            "blocks": [
                ["name": "Swings + incline press", "type": "interval", "rounds": 8, "exercises": [
                    ["ex": "kb_swing", "target": 28, "actual": 28],
                    ["ex": "db_incline_press", "target": 15, "actual": 20],
                ]],
                ["name": "Incline walk", "type": "steady", "ex": "incline_walk", "speeds_actual": [10, 6], "minutes_done": 10],
            ],
        ]
        let r = SessionRow.decode(id: "s-mtn8vr5s7i1z", data: json(legacy))
        #expect(r?.durationSec == 2_400)
        #expect(r?.title == "Swings, incline press & sprints")
        // `actual` wins over `target`: 20 kg is what went on the bench, not the 15 written down.
        #expect(r?.steps.first { $0.exerciseKey == "db_incline_press" }?.target == 20)
        #expect(r?.steps.first { $0.exerciseKey == "incline_walk" }?.target == 10)
    }

    @Test("a legacy row the newer app has touched reads its v2 payload")
    func legacyWithV2() {
        let legacy: [String: Any] = [
            "id": "s-1", "title": "Old", "startedAt": "2026-09-04T17:20:00.000Z", "blocks": [],
            "v2": [
                "runsheetId": "w", "title": "Edited", "startedAt": "2026-09-04T17:20:00.000Z",
                "steps": [["stepId": "a", "exerciseKey": "kb_swing", "target": 32]],
            ],
        ]
        let r = SessionRow.decode(id: "s-1", data: json(legacy))
        #expect(r?.title == "Edited")
        #expect(r?.steps.first?.target == 32)
    }

    @Test("a table URL keeps its query string")
    func endpoints() {
        // The bug this guards: appending a path component percent-encodes the "?", and PostgREST
        // answers 404 for a table called "sessions?select=id,data".
        let url = Supabase.endpoint("rest/v1/sessions?select=id,data&owner=eq.abc")
        #expect(url.absoluteString == "https://icpdzjohsvlpyaluxgbt.supabase.co/rest/v1/sessions?select=id,data&owner=eq.abc")
        #expect(url.query == "select=id,data&owner=eq.abc")
        #expect(Supabase.endpoint("auth/v1/token?grant_type=pkce").query == "grant_type=pkce")
    }

    @Test("dates parse whichever way Postgres hands them back")
    func dates() {
        #expect(ISO8601.date("2026-09-06T10:00:00.000Z") != nil)
        #expect(ISO8601.date("2026-09-06T10:00:00Z") != nil)
        #expect(ISO8601.date("2026-09-06T10:00:00.123456+00:00") != nil)
    }
}
