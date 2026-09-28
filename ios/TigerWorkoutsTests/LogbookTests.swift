import Foundation
import Testing
@testable import TigerWorkouts

/// Ported one for one from `src/features/results/logbook.test.ts`.
@Suite("logbook")
struct LogbookTests {
    private func session(_ startedAt: String, _ steps: [StepResult], title: String = "Push") -> SessionResult {
        SessionResult(runsheetId: "w", title: title, startedAt: startedAt, steps: steps, id: "s-\(startedAt)")
    }

    private func row(_ key: String, step: String = "a", target: Double? = nil, reps: [Double]? = nil, sets: [SetResult]? = nil) -> StepResult {
        StepResult(stepId: step, exerciseKey: key, target: target, incline: nil, reps: reps, success: nil, sets: sets)
    }

    private func set(_ load: Double?, _ reps: Double?) -> SetResult { SetResult(reps: reps, load: load) }

    private var bench: [SessionResult] {
        [
            session("2026-09-01T10:00:00Z", [row("bench", sets: [set(60, 8), set(60, 8)])]),
            session("2026-09-08T10:00:00Z", [row("bench", sets: [set(65, 5), set(60, 10)])]),
            // An older result with no per-set rows.
            session("2026-08-25T10:00:00Z", [row("bench", target: 55, reps: [8, 8, 6])]),
        ]
    }

    @Test("reads older results from target and reps")
    func olderResults() {
        #expect(Logbook.sets(of: row("x", target: 55, reps: [8, 6])) == [set(55, 8), set(55, 6)])
        #expect(Logbook.sets(of: row("x", target: 14.5)) == [set(14.5, nil)])
        #expect(Logbook.sets(of: row("x")).isEmpty)
    }

    @Test("estimates a 1RM by Epley, and a single is itself")
    func epley() {
        #expect(Logbook.e1rm(set(100, 1)) == 100)
        #expect(abs(Logbook.e1rm(set(100, 5))! - 116.67) < 0.01)
        #expect(Logbook.e1rm(set(100, nil)) == nil)
        #expect(Logbook.e1rm(set(nil, 10)) == nil)
        #expect(abs(Logbook.e1rm(set(100, 10))! - 133.33) < 0.01)
        #expect(Logbook.e1rm(set(100, 11)) == nil) // Epley overstates past 10
    }

    @Test("a set above 10 reps counts for most reps and volume, not the 1RM")
    func highReps() {
        let r = Logbook.records([session("2026-09-01T10:00:00Z", [row("bench", sets: [set(60, 5), set(40, 15)])])], exerciseKey: "bench")
        #expect(r.e1rm?.value == 70)
        #expect(r.reps?.value == 15)
        #expect(r.volume?.value == 900)
    }

    @Test("charts top load for a session with only sets above 10 reps")
    func highRepsChart() {
        let h = Logbook.history([
            session("2026-09-01T10:00:00Z", [row("bench", sets: [set(60, 5)])]),
            session("2026-09-02T10:00:00Z", [row("bench", sets: [set(40, 15), set(45, 12)])]),
        ], exerciseKey: "bench")
        #expect(Logbook.points(h).map(\.value) == [70, 45])
    }

    @Test("lists sessions newest first, with title and sets")
    func newestFirst() {
        let h = Logbook.history(bench, exerciseKey: "bench")
        #expect(h.map { String($0.startedAt.prefix(10)) } == ["2026-09-08", "2026-09-01", "2026-08-25"])
        #expect(h[0].title == "Push")
        #expect(h[0].sets == [set(65, 5), set(60, 10)])
    }

    @Test("joins every row of the exercise in a session, and follows a swap by exercise key")
    func swap() {
        let r = [session("2026-09-10T10:00:00Z", [
            row("rower", step: "row", sets: [SetResult(), SetResult()]),
            // Swapped to the bike for the last rounds of the same step.
            row("bike", step: "row", sets: [SetResult()]),
            row("rower", step: "row2", sets: [SetResult()]),
        ])]
        #expect(Logbook.history(r, exerciseKey: "rower")[0].sets.count == 3)
        #expect(Logbook.history(r, exerciseKey: "bike")[0].sets.count == 1)
    }

    @Test("picks what to chart from what was logged")
    func kinds() {
        #expect(Logbook.kind(sets: [set(60, 8)]) == .strength)
        #expect(Logbook.kind(sets: [set(14.5, nil)]) == .load)
        #expect(Logbook.kind(sets: [set(nil, 12)]) == .reps)
        #expect(Logbook.kind(sets: [SetResult(), SetResult()]) == .rounds)
    }

    @Test("charts the best set per session, oldest first")
    func chart() {
        let pts = Logbook.points(Logbook.history(bench, exerciseKey: "bench"))
        #expect(pts.map { String($0.at.prefix(10)) } == ["2026-08-25", "2026-09-01", "2026-09-08"])
        #expect(abs(pts[2].value - 80) < 0.0001) // 60 × 10 beats 65 × 5 on Epley
    }

    @Test("keeps each record with the date it was set")
    func records() {
        let r = Logbook.records(bench, exerciseKey: "bench")
        #expect(r.kind == .strength)
        #expect(r.sessions == 3)
        #expect(r.heaviest?.value == 65 && r.heaviest?.at == "2026-09-08T10:00:00Z")
        #expect(abs((r.e1rm?.value ?? 0) - 80) < 0.0001)
        #expect(r.reps?.value == 10 && r.reps?.at == "2026-09-08T10:00:00Z")
        #expect(r.volume?.value == 1210 && r.volume?.at == "2026-08-25T10:00:00Z") // 55 × (8 + 8 + 6)
    }

    @Test("a tie does not move a record to the later date")
    func tie() {
        let r = Logbook.records([
            session("2026-09-01T10:00:00Z", [row("bench", sets: [set(60, 8)])]),
            session("2026-09-02T10:00:00Z", [row("bench", sets: [set(60, 8)])]),
        ], exerciseKey: "bench")
        #expect(r.heaviest?.at == "2026-09-01T10:00:00Z")
    }

    @Test("shows what exists for timed work: top speed and sessions")
    func timed() {
        let r = Logbook.records([
            session("2026-09-01T10:00:00Z", [row("sprint", step: "s", target: 14.5, sets: [set(14, nil), set(14.5, nil)])]),
            session("2026-09-03T10:00:00Z", [row("sprint", step: "s", sets: [set(15, nil)])]),
        ], exerciseKey: "sprint")
        #expect(r.kind == .load)
        #expect(r.sessions == 2)
        #expect(r.heaviest?.value == 15)
        #expect(r.e1rm == nil)
        #expect(r.volume == nil)
    }

    @Test("marks a set that beat a record standing before it, never in the first session")
    func prs() {
        let h = Logbook.history(bench, exerciseKey: "bench")
        #expect(h[2].prs == [false, false, false]) // first session
        #expect(h[1].prs == [true, false]) // 60 heavier than 55; the second 60 × 8 only ties
        #expect(h[0].prs == [true, true]) // 65 heaviest; 60 × 10 best e1RM and most reps
    }

    @Test("isRecord needs a record to beat")
    func isRecord() {
        #expect(!Logbook.isRecord(set(100, 5), before: Logbook.Records(kind: .strength)))
        let before = Logbook.records(bench, exerciseKey: "bench")
        #expect(Logbook.isRecord(set(70, 1), before: before))
        #expect(!Logbook.isRecord(set(60, 8), before: before))
        #expect(Logbook.isRecord(set(nil, 11), before: before))
    }

    @Test("more reps is a PR only without a load")
    func repsPR() {
        let before = Logbook.records(bench, exerciseKey: "bench") // most reps 10, heaviest 65, e1RM 80
        #expect(!Logbook.isRecord(set(20, 15), before: before))
        #expect(Logbook.isRecord(set(nil, 12), before: before))
        #expect(!Logbook.isRecord(set(nil, 10), before: before)) // a tie
    }

    @Test("volume sums load × reps")
    func volume() {
        #expect(Logbook.volume([set(60, 8), set(50, 10), set(nil, 5)]) == 980)
        #expect(Logbook.volume([set(14, nil)]) == nil)
    }

    @Test("lists every logged exercise, most recently done first")
    func logged() {
        let list = Logbook.logged(bench + [session("2026-09-09T10:00:00Z", [row("squat", step: "x", sets: [set(80, 5)])])])
        #expect(list == [
            Logbook.Logged(exerciseKey: "squat", lastAt: "2026-09-09T10:00:00Z", sessions: 1),
            Logbook.Logged(exerciseKey: "bench", lastAt: "2026-09-08T10:00:00Z", sessions: 3),
        ])
    }

    @Test("labels a set")
    func labels() {
        #expect(Logbook.label(set(57.5, 8)) == "57.5 × 8")
        #expect(Logbook.label(set(14.5, nil), unit: "kph") == "14.5 kph")
        #expect(Logbook.label(set(nil, 12)) == "12 reps")
        #expect(Logbook.label(SetResult()) == "")
    }

    /// Before 28 Sep a rower, a plank or a bike logged its metres, seconds or calories as the load.
    @Test("rows logged before measures had their own fields read the load as the measure")
    func legacyMeasures() {
        var metres = SetResult(reps: nil, load: nil); metres.meters = 500; metres.at = 120
        #expect(Logbook.sets(of: row("row", target: 500, sets: [SetResult(reps: nil, load: 500, at: 120)]), unit: "m") == [metres])
        var held = SetResult(); held.seconds = 60
        #expect(Logbook.sets(of: row("plank", target: 60), unit: "s") == [held])
        var cal = SetResult(reps: 1, load: nil); cal.calories = 20
        #expect(Logbook.sets(of: row("bike", target: 20, reps: [1]), unit: "cal") == [cal])
        #expect(Logbook.sets(of: row("row", sets: [set(500, nil)]), unit: "kg") == [set(500, nil)])
        var both = set(3, nil); both.meters = 500
        #expect(Logbook.sets(of: row("row", sets: [both]), unit: "m") == [both])

        var fresh = SetResult(); fresh.meters = 1000; fresh.seconds = 230
        let old = [
            session("2026-09-01T10:00:00Z", [row("row", step: "r", target: 500, sets: [SetResult(reps: nil, load: 500, at: 120)])]),
            session("2026-09-03T10:00:00Z", [row("plank", step: "p", target: 60)]),
            session("2026-09-29T10:00:00Z", [row("row", step: "r", sets: [fresh])]),
        ]
        let h = Logbook.history(old, exerciseKey: "row", unit: "m")
        #expect(Logbook.kind(h) == .pace)
        let rec = Logbook.records(old, exerciseKey: "row", unit: "m")
        #expect(rec.kind == .pace && rec.distance?.value == 1000 && rec.heaviest == nil)
        let plank = Logbook.records(old, exerciseKey: "plank", unit: "s")
        #expect(plank.kind == .time && plank.longest?.value == 60)
    }

    @Test("an old rower row edited with its unit is saved with metres, not a load")
    func legacyEdit() {
        let old = session("2026-09-01T10:00:00Z", [row("row", step: "r", target: 500, sets: [set(500, nil)])])
        let e = EditSets.edit(old, row: "r|row", index: 0, unit: "m") { $0.meters = 480 }
        var m = SetResult(); m.meters = 480
        #expect(e.steps[0].sets == [m] && e.steps[0].target == nil)
    }
}
