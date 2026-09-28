import Foundation
import Testing
@testable import TigerWorkouts

/// Ported from `logbook.test.ts` (timed and distance work), `rounds.test.ts` and `edit-sets.test.ts`.
@Suite("timed and distance records, round times, set edits")
struct TimedRecordsTests {
    private func session(_ at: String, _ steps: [StepResult], runsheet: String = "w") -> SessionResult {
        SessionResult(runsheetId: runsheet, title: "Push", startedAt: at, steps: steps, id: "s-\(at)")
    }
    private func row(_ key: String, _ sets: [SetResult]) -> StepResult {
        StepResult(stepId: key, exerciseKey: key, target: nil, incline: nil, reps: nil, success: nil, sets: sets)
    }
    private func set(meters: Double? = nil, seconds: Double? = nil, calories: Double? = nil, load: Double? = nil, reps: Double? = nil, type: SetType? = nil) -> SetResult {
        SetResult(reps: reps, load: load, type: type, seconds: seconds, meters: meters, calories: calories)
    }

    private var rows: [SessionResult] {
        [
            session("2026-09-01T10:00:00Z", [row("row", [set(meters: 500, seconds: 110), set(meters: 500, seconds: 106)])]),
            session("2026-09-08T10:00:00Z", [row("row", [set(meters: 500, seconds: 104), set(meters: 1000, seconds: 230)])]),
            session("2026-09-15T10:00:00Z", [row("row", [set(meters: 500, seconds: 105), set(meters: 1200)])]),
        ]
    }
    private var planks: [SessionResult] {
        [
            session("2026-09-01T10:00:00Z", [row("plank", [set(seconds: 60), set(seconds: 45)])]),
            session("2026-09-03T10:00:00Z", [row("plank", [set(seconds: 75, type: .warmup), set(seconds: 62)])]),
        ]
    }

    @Test("tells timed, distance and calorie work apart")
    func kinds() {
        #expect(Logbook.kind(sets: [set(meters: 500, seconds: 100)]) == .pace)
        #expect(Logbook.kind(sets: [set(meters: 500)]) == .distance)
        #expect(Logbook.kind(sets: [set(seconds: 40, calories: 20)]) == .calories)
        #expect(Logbook.kind(sets: [set(seconds: 60)]) == .time)
        #expect(Logbook.kind(sets: [set(seconds: 40, load: 24)]) == .load)
    }

    @Test("keeps the fastest time per distance, the furthest and the longest hold")
    func records() {
        let r = Logbook.records(rows, exerciseKey: "row")
        #expect(r.kind == .pace)
        #expect(r.fastest[500]?.value == 104 && r.fastest[500]?.at == "2026-09-08T10:00:00Z")
        #expect(r.fastest[1000]?.value == 230)
        #expect(r.distance?.value == 1200)
        let p = Logbook.records(planks, exerciseKey: "plank")
        #expect(p.longest?.value == 62 && p.longest?.at == "2026-09-03T10:00:00Z")
    }

    @Test("charts the best pace per session, and the longest hold")
    func chart() {
        #expect(Logbook.points(Logbook.history(rows, exerciseKey: "row"), kind: .pace, per: 500).map(\.value) == [106, 104, 105])
        #expect(Logbook.points(Logbook.history(planks, exerciseKey: "plank")).map(\.value) == [60, 62])
    }

    @Test("marks a faster time over the same distance, further, more calories, a longer hold")
    func prs() {
        #expect(Logbook.history(rows, exerciseKey: "row").reversed().map(\.prs) == [[false, false], [true, true], [false, true]])
        #expect(Logbook.history(planks, exerciseKey: "plank")[0].prs == [false, true])
        let cal = Logbook.records([session("2026-09-01T10:00:00Z", [row("bike", [set(calories: 20)])])], exerciseKey: "bike")
        #expect(Logbook.isRecord(set(calories: 21), before: cal))
        #expect(!Logbook.isRecord(set(calories: 20), before: cal))
    }

    @Test("labels a set by what it measured")
    func labels() {
        #expect(Logbook.label(set(meters: 500, seconds: 101)) == "500 m in 1:41")
        #expect(Logbook.label(set(calories: 20)) == "20 cal")
        #expect(Logbook.label(set(seconds: 45)) == "45 s")
        #expect(Logbook.label(set(seconds: 40, load: 24), unit: "kg") == "24 kg · 40 s")
    }

    private func split(_ at: String, _ times: [Double], from: Double?, runsheet: String = "w") -> SessionResult {
        var r = SessionResult(runsheetId: runsheet, title: nil, startedAt: at, id: at)
        r.splits = [RoundSplit(blockId: "b", at: times, from: from)]
        return r
    }

    @Test("round times, fastest and slowest, against last time")
    func roundTimes() {
        #expect(Rounds.times(RoundSplit(blockId: "b", at: [100, 190, 290], from: 5)) == [95, 90, 100])
        #expect(Rounds.times(RoundSplit(blockId: "b", at: [100, 190])) == [nil, 90])
        // With round starts kept, the rest before a round is not in its time.
        #expect(Rounds.times(RoundSplit(blockId: "b", at: [100, 190, 290], from: 5, starts: [5, 130, 220])) == [95, 60, 70])
        let row = Rounds.rows(split("2026-09-08", [100, 190, 290], from: 5), last: split("2026-09-01", [105, 200, 290], from: 5))[0]
        #expect(row.times == [95, 90, 100] && row.fastest == 1 && row.slowest == 2 && row.vsLast == [-5, -5, 10])
        #expect(Rounds.rows(split("2026-09-08", [100], from: 5))[0].fastest == nil)
    }

    @Test("the fastest round of a workout, and a PR only against a standing one")
    func roundPRs() {
        let past = [split("2026-09-01", [100, 190], from: 5), split("2026-09-05", [98, 200], from: 10), split("2026-09-06", [50], from: 0, runsheet: "other")]
        #expect(Rounds.fastest(past) == [Rounds.Fastest(blockId: "b", round: 0, seconds: 50, at: "2026-09-06")])
        let today = split("2026-09-08", [90, 174], from: 5)
        #expect(Rounds.prs(today, all: past + [today]) == [Rounds.PR(blockId: "b", round: 1, seconds: 84, at: "2026-09-08", was: 88)])
        #expect(Rounds.prs(past[0], all: past).isEmpty)
    }

    private var logged: SessionResult {
        session("2026-09-01T10:00:00Z", [
            StepResult(stepId: "a", exerciseKey: "bench", target: 60, incline: nil, reps: [8, 8], success: true, sets: [set(load: 40, reps: 10, type: .warmup), set(load: 60, reps: 8), set(load: 60, reps: 8)]),
            row("row", [set(meters: 500, seconds: 110)]),
            StepResult(stepId: "o", exerciseKey: "squat", target: 80, incline: nil, reps: [5, 5], success: nil),
        ])
    }

    @Test("editing a set works target and reps out again, and every reader sees it")
    func edit() {
        let r = EditSets.edit(logged, row: "a|bench", index: 2, plan: 8) { $0.load = 62.5; $0.reps = 6 }
        #expect(r.steps[0].target == 62.5 && r.steps[0].reps == [8, 6] && r.steps[0].success == false)
        #expect(Logbook.records([r], exerciseKey: "bench").heaviest?.value == 62.5)
        let t = EditSets.edit(logged, row: "a|bench", index: 0) { $0.type = .normal }
        #expect(t.steps[0].sets?[0].type == nil && t.steps[0].reps == [10, 8, 8])
        let m = EditSets.edit(logged, row: "row|row", index: 0) { $0.seconds = nil; $0.meters = 480 }
        #expect(m.steps[1].sets == [set(meters: 480)])
        let o = EditSets.edit(logged, row: "o|squat", index: 1) { $0.reps = 4 }
        #expect(o.steps[2].sets == [set(load: 80, reps: 5), set(load: 80, reps: 4)] && o.steps[2].reps == [5, 4])
    }

    @Test("reps edited below the plan make the row a miss, and back up to it a success")
    func editSuccess() {
        let miss = EditSets.edit(logged, row: "a|bench", index: 1, plan: 8) { $0.reps = 6 }
        #expect(miss.steps[0].success == false)
        #expect(EditSets.edit(miss, row: "a|bench", index: 1, plan: 8) { $0.reps = 8 }.steps[0].success == true)
        #expect(EditSets.edit(logged, row: "a|bench", index: 1, plan: 8) { $0.load = 65 }.steps[0].success == true)
        #expect(EditSets.edit(logged, row: "a|bench", index: 1) { $0.reps = 7 }.steps[0].success == false)
        #expect(EditSets.edit(logged, row: "a|bench", index: 1) { $0.reps = 9 }.steps[0].success == true)
        #expect(EditSets.edit(logged, row: "o|squat", index: 1) { $0.reps = 4 }.steps[2].success == nil)
    }
}
