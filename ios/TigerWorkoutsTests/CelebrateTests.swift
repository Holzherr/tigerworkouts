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
