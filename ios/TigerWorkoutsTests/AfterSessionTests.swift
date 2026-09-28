import Foundation
import Testing
@testable import TigerWorkouts

/// Putting a session right afterwards (sets added and removed, the score), the logbook chart's
/// metrics and range, and the rest-end notice.
@Suite("after the session")
struct AfterSessionTests {
    private func session(_ sets: [SetResult]) -> SessionResult {
        SessionResult(runsheetId: "w", title: "W", startedAt: "2026-09-20T10:00:00Z", steps: [
            StepResult(stepId: "s", exerciseKey: "bench", target: sets.last?.load, incline: nil, reps: sets.compactMap(\.reps), success: true, sets: sets),
        ])
    }
    private var key: String { session([]).steps[0].id }

    @Test("Add set copies the last set as a normal set with no time")
    func addSet() {
        var last = SetResult(reps: 5, load: 80, at: 300, type: .drop)
        last.seconds = 40
        let r = EditSets.addSet(session([SetResult(reps: 8, load: 60), last]), row: key)
        let sets = r.steps[0].sets ?? []
        #expect(sets.count == 3)
        #expect(sets[2].load == 80 && sets[2].reps == 5 && sets[2].seconds == 40)
        #expect(sets[2].at == nil && sets[2].type == nil)
        #expect(r.steps[0].reps == [8, 5, 5])
    }

    @Test("removing a set works the row's load and reps out again; the last set takes the row")
    func removeSet() {
        let r = EditSets.removeSet(session([SetResult(reps: 8, load: 60), SetResult(reps: 5, load: 80)]), row: key, index: 1)
        #expect(r.steps[0].sets?.count == 1)
        #expect(r.steps[0].target == 60)
        #expect(r.steps[0].reps == [8])
        #expect(EditSets.removeSet(r, row: key, index: 0).steps.isEmpty)
        #expect(EditSets.removeSet(r, row: key, index: 5) == r)
    }

    @Test("a corrected score writes the text the web shows")
    func score() {
        let r = ScoreEntryView.scored(session([]), 12.007, type: .rounds)
        #expect(r.score == 12.007)
        #expect(r.scoreText == "12 rounds + 7 reps")
        #expect(ScoreEntryView.scored(session([]), 1, type: .rounds).scoreText == "1 round")
        #expect(ScoreEntryView.scored(session([]), nil, type: .time).scoreText == nil)
    }

    @Test("times typed as mm:ss, m.ss or whole minutes")
    func parseTime() {
        #expect(ScoreEntryView.parseTime("12:34") == 754)
        #expect(ScoreEntryView.parseTime("3.05") == 185)
        #expect(ScoreEntryView.parseTime("7") == 420)
        #expect(ScoreEntryView.parseTime("1:75") == nil)
        #expect(ScoreEntryView.parseTime("abc") == nil)
    }

    private func logged(_ day: String, _ sets: [SetResult]) -> Logbook.Session {
        Logbook.Session(resultId: day, runsheetId: "w", title: "W", startedAt: "2026-\(day)T10:00:00Z", sets: sets)
    }

    @Test("a lift offers four lines; a bodyweight move two; timed work none")
    func metrics() {
        #expect(Logbook.chartMetrics(.strength) == [.e1rm, .topLoad, .volume, .mostReps])
        #expect(Logbook.chartMetrics(.reps) == [.mostReps, .totalReps])
        #expect(Logbook.chartMetrics(.time).isEmpty)
        let h = [logged("09-01", [SetResult(reps: 5, load: 100), SetResult(reps: 8, load: 80)])]
        #expect(Logbook.pointsFor(h, metric: .topLoad).map(\.value) == [100])
        #expect(Logbook.pointsFor(h, metric: .volume).map(\.value) == [1140])
        #expect(Logbook.pointsFor(h, metric: .mostReps).map(\.value) == [8])
        #expect(Logbook.pointsFor(h, metric: .totalReps).map(\.value) == [13])
        #expect(Logbook.pointsFor(h, metric: .e1rm).first.map { abs($0.value - 116.67) < 0.01 } == true)
    }

    @Test("3 m and 1 y count back from now; All keeps everything")
    func range() {
        let now = ISO8601.date("2026-09-28T12:00:00Z")!
        let pts = ["2025-06-01", "2025-12-01", "2026-08-01"].map { Logbook.Point(at: "\($0)T10:00:00Z", value: 1) }
        #expect(Logbook.inRange(pts, .threeMonths, now: now).count == 1)
        #expect(Logbook.inRange(pts, .year, now: now).count == 2)
        #expect(Logbook.inRange(pts, .all, now: now).count == 3)
    }

    @Test("the rest-end notice follows a running rest only")
    func restEnd() {
        let onRest = RestControlTests.onRest()
        #expect(RestNotice.restEnd(onRest)?.at == 80_000)
        #expect(RestNotice.restEnd(onRest)?.next == Fixtures.press.name)
        #expect(RestNotice.restEnd(Runner.pause(onRest, now: 30_000)) == nil)
        let work = Runner.tick(Runner.start(RestControlTests.sheet(), now: 0), now: 5_000)
        #expect(RestNotice.restEnd(work) == nil)
    }
}
