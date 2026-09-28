import Foundation
import Testing
@testable import TigerWorkouts

/// Progression, prefs sync, time zones and Health effort: the fixes ported from the web's
/// progression.test.ts, prefs.test.ts and dst.test.ts.
@Suite("data fixes")
struct DataFixesTests {
    private let squat = ExerciseRef(key: "bb_back_squat", name: "Barbell back squat", unit: "kg", step: 2.5)

    private func stronglifts() -> Runsheet {
        var b = Block(id: "b", name: "Squat 5×5", repeatCount: 5, steps: [.exercise(ExerciseStep(id: "sq", exercise: squat, target: 60, forMode: .reps, forValue: 5))])
        b.progression = Progression(onSuccessKg: 2.5, deloadPct: 10, failAfter: 3)
        return Runsheet(id: "sl-a", title: "StrongLifts A", items: [.block(b)])
    }

    private func session(_ day: Int, ok: Bool, load: Double = 60, sets: [SetResult]? = nil, id: String = "sl-a") -> SessionResult {
        var step = StepResult(stepId: "sq", exerciseKey: "bb_back_squat")
        step.target = load
        step.success = ok
        step.sets = sets
        return SessionResult(runsheetId: id, title: nil, startedAt: String(format: "2026-09-%02dT10:00:00Z", day), steps: [step], id: "s-\(day)")
    }

    private func squatLoad(_ r: Runsheet) -> Double? {
        guard case .exercise(let e) = r.items.first?.asBlock?.steps.first else { return nil }
        return e.target
    }

    @Test("the next session starts on +2.5 kg after a clean one")
    func progressesOnSuccess() {
        let done = [session(6, ok: true)]
        let next = ProgressionRules.progressed(Settings.withLastUsed(stronglifts(), results: done), results: done, kit: nil)
        #expect(squatLoad(next) == 62.5)
    }

    @Test("a miss repeats the weight; three in a row deload")
    func deloads() {
        #expect(squatLoad(ProgressionRules.progressed(stronglifts(), results: [session(6, ok: false)], kit: nil)) == 60)
        let three = [session(6, ok: false), session(4, ok: false), session(2, ok: false)]
        #expect(squatLoad(ProgressionRules.progressed(stronglifts(), results: three, kit: nil)) == 55)
    }

    @Test("deloads once, then counts misses again from the deload")
    func deloadsOnce() {
        let four = [session(8, ok: false), session(6, ok: false), session(4, ok: false), session(2, ok: false)]
        #expect(squatLoad(ProgressionRules.progressed(stronglifts(), results: four, kit: nil)) == 60)
        let six = [session(12, ok: false), session(10, ok: false)] + four
        #expect(squatLoad(ProgressionRules.progressed(stronglifts(), results: six, kit: nil)) == 55)
    }

    @Test("a drop set is never the next session's starting load")
    func dropSet() {
        let sets = [SetResult(reps: 5, load: 100), SetResult(reps: 5, load: 100), SetResult(reps: 10, load: 60, type: .drop)]
        let r = session(6, ok: true, load: 60, sets: sets)
        #expect(ProgressionRules.workingLoad(r.steps[0]) == 100)
        #expect(Settings.lastUsed([r])["ex:bb_back_squat"]?.target == 100)
    }

    @Test("an unsave, a cleared kit and removed maxes stick through a sync")
    func prefsClear() {
        let phone = PrefsMerge.Side(values: ["saved": ["fran"], "trainingMaxes": [String: Double]()], updatedAt: ["saved": "2026-09-27T11:00:00.000Z", "equipment": "2026-09-27T11:00:00.000Z", "trainingMaxes": "2026-09-27T11:00:00.000Z"])
        let server: [String: Any] = [
            "saved": ["fran", "cindy"], "equipment": ["barKg": 20], "trainingMaxes": ["bb_bench": 80], "name": "Nick", "avatar": ["emoji": "🐯"],
            "updatedAt": ["saved": "2026-09-27T10:00:00.000Z", "equipment": "2026-09-27T10:00:00.000Z", "name": "2026-09-01T10:00:00.000Z"],
        ]
        let m = PrefsMerge.merge(local: phone, remote: PrefsMerge.remote(server))
        #expect(m.push)
        #expect(m.values["saved"] as? [String] == ["fran"])
        #expect(m.values["equipment"] == nil)
        #expect((m.values["trainingMaxes"] as? [String: Double])?.isEmpty == true)
        let row = PrefsMerge.row(existing: server, m)
        #expect(row["equipment"] is NSNull)
        // The web's own fields go back as they were.
        #expect(row["name"] as? String == "Nick")
        #expect((row["avatar"] as? [String: String])?["emoji"] == "🐯")
        #expect((row["updatedAt"] as? [String: String])?["name"] == "2026-09-01T10:00:00.000Z")
    }

    @Test("the newer side wins per field, and agreeing sides write nothing")
    func prefsNewer() {
        let local = PrefsMerge.Side(values: ["bodyweightKg": 80.0], updatedAt: ["bodyweightKg": "2026-09-27T09:00:00.000Z"])
        let remote = PrefsMerge.Side(values: ["bodyweightKg": 82.0], updatedAt: ["bodyweightKg": "2026-09-27T10:00:00.000Z"])
        #expect(PrefsMerge.merge(local: local, remote: remote).values["bodyweightKg"] as? Double == 82)
        #expect(!PrefsMerge.merge(local: remote, remote: remote).push)
    }

    @Test("the weekly streak holds across the clock change on 25 Oct 2026 in London")
    func streakAcrossDST() {
        var cal = Calendar(identifier: .iso8601)
        cal.firstWeekday = 2
        cal.timeZone = TimeZone(identifier: "Europe/London")!
        let at = { (iso: String) in SessionResult(runsheetId: "w", title: nil, startedAt: iso) }
        let s = EffortModel.streak(
            [at("2026-10-14T17:00:00Z"), at("2026-10-21T17:00:00Z"), at("2026-10-28T18:00:00Z")],
            today: ISO8601DateFormatter().date(from: "2026-10-29T12:00:00Z")!,
            calendar: cal
        )
        #expect(s.weeks == 3)
        #expect(s.lastWeek == 1)
    }

    @Test("a sync that brings a new effort for a known session sends it to Health")
    func effortLearned() {
        var before = SessionResult(runsheetId: "w", title: nil, startedAt: "2026-09-27T10:00:00Z", id: "s-1")
        var after = before
        after.rpe = 7
        let fresh = SessionResult(runsheetId: "w", title: nil, startedAt: "2026-09-26T10:00:00Z", id: "s-web")
        #expect(Store.effortChanges(before: [before], after: [after, fresh]).map(\.rowId) == ["s-1"])
        before.rpe = 7
        #expect(Store.effortChanges(before: [before], after: [after]).isEmpty)
    }

    @Test("training maxes cover any lift loaded as % TM")
    func maxLifts() {
        var row = ExerciseStep(id: "r", exercise: ExerciseRef(key: "bb_row", name: "Row", unit: "kg", step: 2.5), forMode: .reps, forValue: 5)
        row.targetPct = 70
        let w = Runsheet(id: "w", title: "Rows", items: [.step(.exercise(row))])
        let keys = TrainingMaxesView.lifts(in: [w], maxes: ["front_squat": 90]) { ExerciseRef(key: $0, name: $0, unit: "kg", step: 2.5) }.map(\.key)
        #expect(keys == ["bb_back_squat", "bb_bench", "bb_deadlift", "bb_ohp", "bb_row", "front_squat"])
    }
}
