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

    @Test("an edit keeps what the web app keeps on the row, and clears a field emptied here")
    func editMergesOverRow() {
        let existing: [String: Any] = [
            "format": "v2", "blocks": [] as [Any], "runsheetId": "w", "startedAt": "2026-09-06T10:00:00.000Z",
            "notes": "old", "rpe": 6, "futureField": ["kept": true], "steps": [] as [Any],
        ]
        var r = SessionRow.decode(id: "s-1", data: json(existing))!
        r.notes = nil
        r.rpe = 8
        r.durationSec = 1800
        let data = SessionRow.encode(r, owner: "u", existing: existing)["data"] as! [String: Any]
        #expect(data["format"] as? String == "v2")
        #expect((data["futureField"] as? [String: Bool])?["kept"] == true)
        #expect(data["notes"] == nil)
        #expect(data["rpe"] as? Double == 8)
        #expect(data["durationSec"] as? Double == 1800)
        #expect(SessionRow.decode(id: "s-1", data: json(data))?.rpe == 8)
    }

    @Test("an edit to a v0.9 row keeps its shape, with the result under v2, as the web writes it")
    func editKeepsLegacyShape() {
        let legacy: [String: Any] = [
            "id": "old-1", "workoutId": "w", "title": "Old", "type": "workout", "startedAt": "2026-01-01T10:00:00.000Z",
            "duration_min": 30, "notes": "", "blocks": [["type": "sets", "exercises": [["ex": "bb_bench", "actual": 60]]]],
        ]
        var r = SessionRow.decode(id: "old-1", data: json(legacy))!
        r.notes = "felt good"
        r.durationSec = 2700
        let row = SessionRow.encode(r, owner: "u", existing: legacy)
        let data = row["data"] as! [String: Any]
        #expect(row["type"] as? String == "workout")
        #expect(data["format"] == nil)
        #expect((data["blocks"] as? [Any])?.count == 1)
        #expect(data["notes"] as? String == "felt good")
        #expect(data["duration_min"] as? Int == 45)
        #expect((data["v2"] as? [String: Any])?["notes"] as? String == "felt good")
        let back = SessionRow.decode(id: "old-1", data: json(data))
        #expect(back?.notes == "felt good")
        #expect(back?.steps.first?.exerciseKey == "bb_bench")
    }

    @Test("effort rides on the row's data and reads back")
    func effortRoundTrip() {
        var r = SessionResult(runsheetId: "w", title: "W", startedAt: "2026-09-06T10:00:00.000Z", id: "s-e")
        r.rpe = 7
        let data = SessionRow.encode(r, owner: "u")["data"] as! [String: Any]
        #expect(data["rpe"] as? Double == 7)
        #expect(SessionRow.decode(id: "s-e", data: json(data))?.rpe == 7)
    }

    @Test("a workout keeps the web's icon through a phone edit, and sends public only when set here")
    func workoutRow() throws {
        let web: [String: Any] = [
            "id": "u-1", "title": "Legs", "public": true, "items": [] as [Any],
            "icon": ["kind": "monogram", "letters": "LG", "palette": 3, "style": "glow", "treatment": "white"],
        ]
        var sheet = try JSONDecoder().decode(Runsheet.self, from: json(web))
        sheet.title = "Legs day"
        let row = try Supabase.workoutRow(sheet, owner: "u", sendPublic: false)
        let data = row["data"] as! [String: Any]
        let icon = try #require(data["icon"] as? [String: Any])
        #expect(icon["letters"] as? String == "LG" && icon["palette"] as? Double == 3 && icon["style"] as? String == "glow")
        #expect(data["title"] as? String == "Legs day")
        // Left out, the upsert keeps the server's column: an edit on a stale copy cannot unpublish it.
        #expect(row["public"] == nil && data["public"] == nil)
        sheet.isPublic = false
        #expect(try Supabase.workoutRow(sheet, owner: "u", sendPublic: true)["public"] as? Bool == false)
    }

    @Test("a sync keeps the phone's unpushed edits and deletes over the server's copy")
    func mergeAfterFetch() {
        func r(_ id: String, _ at: String, notes: String? = nil) -> SessionResult {
            SessionResult(runsheetId: "w", title: "W", startedAt: at, notes: notes, id: id)
        }
        let remote = [r("a", "2026-09-01T10:00:00Z", notes: "server"), r("b", "2026-09-02T10:00:00Z"), r("c", "2026-09-03T10:00:00Z")]
        let merged = Store.merged(remote: remote, pending: [r("a", "2026-09-01T10:00:00Z", notes: "phone"), r("d", "2026-09-04T10:00:00Z")], deleting: ["b"])
        #expect(merged.map(\.rowId) == ["d", "c", "a"])
        #expect(merged.last?.notes == "phone")
    }
}
