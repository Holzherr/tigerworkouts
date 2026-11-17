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
        // The literals the web app writes (SessionOrigin in progression.ts), in its order.
        #expect(SessionOrigin.allCases.map(\.rawValue) == ["recommended", "saved", "search", "mine", "history", "link", "home", "coach", "up_next"])

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

    @Test("password sign-in is GoTrue's password grant")
    func passwordGrant() throws {
        let grant = Supabase.passwordGrant(email: "review@example.com", password: "pw")
        #expect(grant.path == "auth/v1/token?grant_type=password")
        #expect(Supabase.endpoint(grant.path).query == "grant_type=password")
        #expect(grant.body == ["email": "review@example.com", "password": "pw"])
    }

    @Test("only a refused refresh token signs out; a rate limit or a server error keeps the sign-in")
    func refreshFailures() {
        #expect(Supabase.refreshRefused(400) && Supabase.refreshRefused(401))
        #expect(![429, 500, 502, 503].contains(where: Supabase.refreshRefused))
    }

    @Test("the foreground sync waits a minute, and for a sign-in, an idle timer and no sync already out")
    @MainActor
    func foregroundSync() {
        let t = Date(timeIntervalSince1970: 1_000)
        func due(_ gap: TimeInterval, signedIn: Bool = true, running: Bool = false, syncing: Bool = false) -> Bool {
            RootView.foregroundSyncDue(last: t, now: t.addingTimeInterval(gap), signedIn: signedIn, running: running, syncing: syncing)
        }
        #expect(due(60) && !due(59))
        #expect(!due(600, signedIn: false) && !due(600, running: true) && !due(600, syncing: true))
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

    // MARK: - Review D14: what this app does not model survives an edit here

    /// An Instagram import as the MCP stores it (specs/creator-imports.md, instagram-bot.md).
    private var imported: [String: Any] {
        [
            "id": "u-ig", "title": "Glutes", "creator": "Sam Fit", "later": ["a": 1],
            "source": ["title": "Glutes", "url": "https://www.instagram.com/reel/x/", "author": "Sam Fit", "kind": "social",
                       "handle": "samfit", "platform": "instagram", "review": "pending"],
            "items": [[
                "kind": "block", "id": "b1", "name": "Block 1", "repeat": 3, "pinned": true,
                "steps": [["kind": "exercise", "id": "e1", "exercise": ["key": "kb_swing", "name": "Kettlebell swings", "unit": "kg", "step": 4, "cue": "hips"],
                           "target": 16, "forMode": "reps", "forValue": 10, "tempo": "2-0-1"]],
            ]],
        ]
    }

    @Test("editing an import on the phone keeps its credit link and its place in the approval queue")
    func importKeepsCredit() throws {
        let raw = try JSONDecoder().decode(JSONValue.self, from: json(imported))
        var sheet = try JSONDecoder().decode(Runsheet.self, from: json(imported))
        sheet = Edit.updateStep(sheet, id: "e1") { $0.target = 20 }
        sheet.title = "Glutes, heavier"
        let data = try #require(Supabase.workoutRow(sheet, owner: "u", sendPublic: false, raw: raw)["data"] as? [String: Any])
        let source = try #require(data["source"] as? [String: Any])
        #expect(source["handle"] as? String == "samfit" && source["platform"] as? String == "instagram")
        #expect(source["review"] as? String == "pending" && source["kind"] as? String == "social")
        #expect(source["url"] as? String == "https://www.instagram.com/reel/x/")
        // The edit itself, and fields no version of this app knows, at every depth.
        #expect(data["title"] as? String == "Glutes, heavier")
        #expect((data["later"] as? [String: Any])?["a"] as? Double == 1)
        let block = try #require((data["items"] as? [[String: Any]])?.first)
        #expect(block["pinned"] as? Bool == true)
        let step = try #require((block["steps"] as? [[String: Any]])?.first)
        #expect(step["target"] as? Double == 20 && step["tempo"] as? String == "2-0-1")
        #expect((step["exercise"] as? [String: Any])?["cue"] as? String == "hips")
        // Without the pulled copy, as before: only what the model holds (the credit fields are modelled).
        let bare = try #require(Supabase.workoutRow(sheet, owner: "u", sendPublic: false)["data"] as? [String: Any])
        #expect((bare["source"] as? [String: Any])?["handle"] as? String == "samfit")
        #expect(bare["later"] == nil)
    }

    @Test("an adapted post's credit decodes, re-encodes with all five keys and reads 'Adapted from @handle'")
    func adaptedCredit() throws {
        let post: [String: Any] = ["kind": "social", "author": "Jane Doe", "handle": "janedoe", "platform": "instagram", "url": "https://www.instagram.com/p/x"]
        let sheet = try JSONDecoder().decode(Runsheet.self, from: json(["title": "Jump rope ladder", "source": post]))
        #expect(sheet.source?.credit == "Adapted from @janedoe")
        let back = try #require(JSONSerialization.jsonObject(with: JSONEncoder().encode(sheet)) as? [String: Any])
        let source = try #require(back["source"] as? [String: Any])
        for (key, value) in post { #expect(source[key] as? String == value as? String, "\(key)") }
        // As on the web: "@" typed into the handle is not doubled; no handle, or not a post, no credit.
        #expect(Source(kind: "social", handle: " @janedoe").credit == "Adapted from @janedoe")
        #expect(Source(author: "Jane Doe", kind: "social").credit == nil)
        #expect(Source(kind: "user", handle: "janedoe").credit == nil)
    }

    @Test("a field removed here stays removed, and a step given another exercise takes nothing from the old one")
    func removedStaysRemoved() throws {
        let raw = try JSONDecoder().decode(JSONValue.self, from: json(imported))
        var sheet = try JSONDecoder().decode(Runsheet.self, from: json(imported))
        sheet.source?.url = nil
        sheet = Edit.updateStep(sheet, id: "e1") {
            $0.target = nil
            $0.exercise = ExerciseRef(key: "db_row", name: "Dumbbell row", unit: "kg per arm", step: 2.5)
        }
        // A block added here has nothing to carry.
        sheet.items.append(.block(Block(id: "b-new", name: "Block 2", steps: [])))
        let data = try #require(Supabase.workoutRow(sheet, owner: "u", sendPublic: false, raw: raw)["data"] as? [String: Any])
        #expect((data["source"] as? [String: Any])?["url"] == nil)
        let items = try #require(data["items"] as? [[String: Any]])
        let step = try #require((items[0]["steps"] as? [[String: Any]])?.first)
        #expect(step["target"] == nil && step["tempo"] as? String == "2-0-1")
        #expect((step["exercise"] as? [String: Any])?["key"] as? String == "db_row")
        #expect((step["exercise"] as? [String: Any])?["cue"] == nil)
        #expect(items[1]["pinned"] == nil)
    }

    // MARK: - Review D14: a stale phone copy against a newer edit

    private func block(_ id: String, _ load: Double) -> Item {
        .block(Block(id: id, name: id, repeatCount: 3, steps: [Fixtures.work("\(id)-s", Fixtures.swing, target: load, forMode: .reps, forValue: 10)]))
    }

    @Test("merging a phone edit with a newer server copy keeps what each side alone changed")
    func mergeKeepsBoth() {
        let base = Runsheet(id: "u-1", title: "Legs", items: [block("a", 16), block("b", 20)])
        // Claude raised block b and added block c; the phone, not synced, renamed it and raised a.
        var remote = base
        remote.items = [block("a", 16), block("b", 24), block("c", 12)]
        var local = base
        local.title = "Legs day"
        local.items = [block("a", 20), block("b", 20)]
        let merged = WorkoutMerge.merge(base: base, local: local, remote: remote, localNewer: true)
        #expect(merged.title == "Legs day")
        #expect(merged.items == [block("a", 20), block("b", 24), block("c", 12)])
        // The same whichever is newer: nothing was changed on both sides.
        #expect(WorkoutMerge.merge(base: base, local: local, remote: remote, localNewer: false) == merged)
    }

    @Test("where both changed the same thing the newer edit wins; a removal stands unless the item was changed")
    func mergeNewerWins() {
        let base = Runsheet(id: "u-1", title: "Legs", items: [block("a", 16), block("b", 20)])
        var remote = base
        remote.title = "Legs (coach)"
        remote.items = [block("a", 18)]
        var local = base
        local.title = "Legs day"
        local.items = [block("a", 20), block("b", 22)]
        let phone = WorkoutMerge.merge(base: base, local: local, remote: remote, localNewer: true)
        #expect(phone.title == "Legs day" && phone.items == [block("a", 20), block("b", 22)])
        let server = WorkoutMerge.merge(base: base, local: local, remote: remote, localNewer: false)
        // Block b was removed on the server and changed here: the change keeps it.
        #expect(server.title == "Legs (coach)" && server.items == [block("a", 18), block("b", 22)])
        // Removed on the server, untouched here: gone.
        var untouched = base
        untouched.title = "Legs day"
        #expect(WorkoutMerge.merge(base: base, local: untouched, remote: remote, localNewer: true).items == [block("a", 18)])
        // Never pulled: the newer side whole.
        #expect(WorkoutMerge.merge(base: nil, local: local, remote: remote, localNewer: false) == remote)
        #expect(WorkoutMerge.merge(base: nil, local: local, remote: remote, localNewer: true) == local)
    }

    @Test("the conditional write names the row's updated_at exactly, and reads back the new one")
    func conditionalWrite() {
        #expect(Supabase.escapeStamp("2026-11-15T23:09:34.123456+00:00") == "2026-11-15T23%3A09%3A34.123456%2B00%3A00")
        #expect(Supabase.updatedStamp(json2([["updated_at": "2026-11-16T08:00:00+00:00"]])) == "2026-11-16T08:00:00+00:00")
        #expect(Supabase.updatedStamp(json2([])) == nil)
        let rows = Supabase.decodeWorkoutRows(json2([["id": "u-ig", "creator": "Sam Fit", "title": "Glutes", "public": false, "updated_at": "2026-11-15T23:09:34.123456+00:00", "data": imported]]))
        #expect(rows.first?.updatedAt == "2026-11-15T23:09:34.123456+00:00")
        #expect(rows.first?.sheet.title == "Glutes" && rows.first?.raw != nil)
    }

    @Test("an account made with Sign in with Apple is told from its user record")
    func appleIdentity() {
        #expect(Supabase.hasAppleIdentity(["app_metadata": ["provider": "apple", "providers": ["apple"]]]))
        #expect(Supabase.hasAppleIdentity(["app_metadata": ["provider": "email", "providers": ["email", "apple"]]]))
        #expect(Supabase.hasAppleIdentity(["identities": [["provider": "apple"]]]))
        #expect(!Supabase.hasAppleIdentity(["app_metadata": ["provider": "email", "providers": ["email", "google"]]]))
        #expect(!Supabase.hasAppleIdentity([:]))
    }

    private func json2(_ object: [Any]) -> Data { try! JSONSerialization.data(withJSONObject: object) }
}

@Suite("stale and deleted writes (review A3)")
struct StaleWriteTests {
    @Test("the database's 409 and 410 are told apart from any other failure")
    func refusals() {
        #expect(Store.refusal(SupabaseError(message: "stale write", status: 409, code: "PT409")) == .stale)
        #expect(Store.refusal(SupabaseError(message: "deleted", status: 410, code: "PT410")) == .deleted)
        #expect(Store.refusal(SupabaseError(message: "Request failed (500)", status: 500)) == nil)
        #expect(Store.refusal(URLError(.notConnectedToInternet)) == nil)
@Suite("sync-health ping")
struct HealthPingTests {
    @Test("once a day while syncs work, hourly while they fail, a kind of error and never its text")
    func cadence() throws {
        let d = try #require(UserDefaults(suiteName: "health-ping-\(UUID().uuidString)"))
        let t = Date(timeIntervalSince1970: 1_800_000_000)
        let first = try #require(HealthPing.next(error: nil, waiting: 0, build: "1.4+212", now: t, defaults: d))
        #expect(first["ok"] as? Bool == true && first["app"] as? String == "ios" && first["error"] == nil)
        #expect(HealthPing.next(error: nil, waiting: 0, build: "b", now: t.addingTimeInterval(3600), defaults: d) == nil)
        let failed = try #require(HealthPing.next(error: "The Internet connection appears to be offline.", waiting: 2, build: "b", now: t.addingTimeInterval(7200), defaults: d))
        #expect(failed["error"] as? String == "network" && failed["waiting"] as? Int == 2 && failed["sinceOkMin"] as? Int == 60)
        #expect(HealthPing.next(error: "x", waiting: 2, build: "b", now: t.addingTimeInterval(9000), defaults: d) == nil)
        #expect(HealthPing.next(error: "x", waiting: 2, build: "b", now: t.addingTimeInterval(10900), defaults: d) != nil)
        #expect(HealthPing.kind("Something odd for nick@example.com") == "other")
    }
}
