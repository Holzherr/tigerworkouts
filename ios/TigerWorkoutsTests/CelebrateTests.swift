import Foundation
import Testing
@testable import TigerWorkouts

/// Ported one for one from `src/features/results/celebrate.test.ts`.
@Suite("celebration")
struct CelebrateTests {
    private func s(_ id: String, _ startedAt: String, _ steps: [StepResult], runsheetId: String = "push", score: Double? = nil, durationSec: Double? = nil) -> SessionResult {
        SessionResult(runsheetId: runsheetId, title: "Push", startedAt: startedAt, durationSec: durationSec, score: score, steps: steps, id: id)
    }
    private func bench(_ sets: [(Double, Double)]) -> StepResult {
        StepResult(stepId: "b", exerciseKey: "bench", target: nil, incline: nil, reps: nil, success: nil, sets: sets.map { SetResult(reps: $0.1, load: $0.0) })
    }
    private func pushups(_ reps: [Double]) -> StepResult {
        StepResult(stepId: "p", exerciseKey: "pushup", target: nil, incline: nil, reps: nil, success: nil, sets: reps.map { SetResult(reps: $0, load: nil) })
    }

    private var past: [SessionResult] {
        [
            s("s1", "2026-09-01T10:00:00Z", [bench([(60, 8), (60, 8)]), pushups([15])], score: 600, durationSec: 1800),
            s("s2", "2026-09-08T10:00:00Z", [bench([(62.5, 8), (62.5, 6)]), pushups([18])], score: 580, durationSec: 1700),
            s("other", "2026-09-10T10:00:00Z", [], runsheetId: "run"),
        ]
    }
    private var today: SessionResult {
        s("s3", "2026-09-15T10:00:00Z", [bench([(65, 5), (67.5, 3)]), pushups([17])], score: 560, durationSec: 1760)
    }

    @Test("one record per exercise, the best set that beat what stood before")
    func prs() {
        #expect(Logbook.sessionPRs(today, all: past + [today]) == [Logbook.SessionPR(exerciseKey: "bench", set: SetResult(reps: 5, load: 65))])
        #expect(Logbook.sessionPRs(past[0], all: past).isEmpty)
        let later = s("s4", "2026-09-20T10:00:00Z", [bench([(80, 5)])])
        #expect(Logbook.sessionPRs(past[1], all: past + [later]).map(\.exerciseKey) == ["bench", "pushup"])
        #expect(Logbook.sessionPRs(today, all: past) == Logbook.sessionPRs(today, all: past + [today]))
    }

    @Test("counts every session before it, this one included")
    func ordinal() {
        #expect(Celebrate.celebrate(today, all: past + [today]).ordinal == 4)
        #expect(Celebrate.celebrate(today, all: past).ordinal == 4)
        #expect(Celebrate.celebrate(past[0], all: past).ordinal == 1)
    }

    @Test("compares with the last time of the same workout only")
    func deltas() {
        let c = Celebrate.celebrate(today, all: past + [today])
        #expect(c.last?.id == "s2")
        let volume: Double = 65 * 5 + 67.5 * 3 - 62.5 * 14
        #expect(c.deltas == Celebrate.Deltas(score: -20, durationSec: 60, volume: volume))
        let first = Celebrate.celebrate(past[0], all: past)
        #expect(first.last == nil)
        #expect(first.deltas == .init())
    }

    @Test("streak as of the session, and volume over loaded work")
    func streakAndVolume() {
        let c = Celebrate.celebrate(today, all: past + [today])
        #expect(c.streak.weeks == 3 && c.streak.thisWeek == 1 && c.streak.total == 4)
        let todayVolume: Double = 65 * 5 + 67.5 * 3
        #expect(Celebrate.totalVolume(today) == todayVolume)
        #expect(Celebrate.totalVolume(s("x", "2026-09-01T00:00:00Z", [pushups([20])])) == nil)
    }

    @Test("delta lines word each number the way the web does")
    func lines() {
        let c = Celebrate.celebrate(today, all: past + [today])
        #expect(Celebrate.deltaLines(c, type: .time).first == .init(label: "Score", text: "0:20 faster", better: true))
        #expect(Celebrate.deltaLines(c, type: .reps).first == .init(label: "Score", text: "−20 reps", better: false))
        #expect(Celebrate.deltaLines(c, type: .none) == [
            .init(label: "Volume", text: "−348 kg", better: false),
            .init(label: "Time", text: "1 min longer"),
        ])
    }

    @Test("short sessions say seconds under a minute")
    func seconds() {
        let a = s("a", "2026-09-01T10:00:00Z", [], durationSec: 37)
        let b = s("b", "2026-09-02T10:00:00Z", [], durationSec: 6)
        #expect(Celebrate.deltaLines(Celebrate.celebrate(b, all: [a, b]), type: .none) == [.init(label: "Time", text: "31s shorter")])
    }

    @Test("labels")
    func labels() {
        #expect([1, 3, 4, 6, 7, 8, 9, 10].map(Celebrate.effortWord) == ["Easy", "Easy", "Moderate", "Moderate", "Hard", "Hard", "All out", "All out"])
        #expect(Celebrate.streakLabel(Streak(weeks: 1, thisWeek: 2, lastWeek: 0, total: 5)) == "2 this week")
        #expect(Celebrate.streakLabel(Streak(weeks: 3, thisWeek: 1, lastWeek: 2, total: 9)) == "3 weeks running · 1 this week")
    }
}

/// iPhone History rows: the score at the trailing edge and a medal for a record (review U13).
@Suite("history rows")
@MainActor
struct HistoryRowTests {
    private func bench(_ load: Double) -> StepResult {
        StepResult(stepId: "b", exerciseKey: "bench", target: nil, incline: nil, reps: nil, success: nil, sets: [SetResult(reps: 5, load: load)])
    }

    @Test("the score reads as the web writes it, saved text first")
    func score() {
        let amrap = SessionResult(runsheetId: "cindy", title: "Cindy", startedAt: "2026-11-03T10:00:00Z", score: 18.005)
        #expect(HistoryView.scoreLabel(amrap, type: .rounds) == "18 rounds + 5 reps")
        #expect(HistoryView.scoreLabel(amrap, type: nil) == nil)
        var capped = amrap
        capped.scoreText = "Capped · 40 reps"
        #expect(HistoryView.scoreLabel(capped, type: .time) == "Capped · 40 reps")
        #expect(HistoryView.scoreLabel(SessionResult(runsheetId: "w", title: "W", startedAt: "2026-11-03T10:00:00Z"), type: .time) == nil)
    }

    @Test("a medal on the session that set a record, kept after a later one beats it")
    func record() {
        let a = SessionResult(runsheetId: "push", title: "Push", startedAt: "2026-11-01T10:00:00Z", steps: [bench(60)], id: "a")
        let b = SessionResult(runsheetId: "push", title: "Push", startedAt: "2026-11-08T10:00:00Z", steps: [bench(65)], id: "b")
        let c = SessionResult(runsheetId: "push", title: "Push", startedAt: "2026-11-15T10:00:00Z", steps: [bench(62.5)], id: "c")
        let all = [a, b, c]
        #expect(!HistoryView.setRecord(a, all: all, runsheet: nil))
        #expect(HistoryView.setRecord(b, all: all, runsheet: nil))
        #expect(!HistoryView.setRecord(c, all: all, runsheet: nil))
    }
}

/// A session done without the phone, logged by hand (review U9).
@Suite("log without the timer")
struct ManualLogTests {
    @Test("every planned set is there, as planned, at the date and length given, with no score")
    func planned() {
        let start = ISO8601.date("2026-11-10T07:30:00.000Z")!
        let r = ManualLog.result(HonestLoggingTests.press(), startedAt: start, minutes: 25)
        #expect(r.runsheetId == "p")
        #expect(r.startedAt == "2026-11-10T07:30:00.000Z")
        #expect(r.endedAt == "2026-11-10T07:55:00.000Z")
        #expect(r.durationSec == 1500)
        #expect(r.completed == true)
        #expect(r.score == nil)
        #expect(r.steps.count == 1)
        #expect(r.steps[0].sets == Array(repeating: SetResult(reps: 8, load: 20), count: 3))
        #expect(r.steps[0].reps == [8, 8, 8])
        let later = ManualLog.moved(r, startedAt: start.addingTimeInterval(3600), minutes: 40)
        #expect(later.startedAt == "2026-11-10T08:30:00.000Z")
        #expect(later.endedAt == "2026-11-10T09:10:00.000Z")
        #expect(later.durationSec == 2400)
    }

    @Test("an AMRAP's guessed rounds are not logged as sets: its score says what was done")
    func amrap() {
        let r = ManualLog.result(Fixtures.cindy(), startedAt: Date(timeIntervalSince1970: 0), minutes: 20)
        #expect(r.steps.isEmpty)
        #expect(r.score == nil)
    }
}
