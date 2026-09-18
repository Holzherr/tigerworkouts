import Foundation
import Testing
@testable import TigerWorkouts

@Suite("muscles")
struct MuscleTests {
    @Test("matches names written plural as well as singular")
    func plurals() {
        #expect(Muscles.forExercise("Kettlebell swings")[.glutes] == 1)
        #expect(Muscles.forExercise("Kettlebell swing")[.glutes] == 1)
        #expect(Muscles.forExercise("Push-ups")[.chest] == 1)
    }

    @Test("the more specific rule wins")
    func specificity() {
        // "incline chest press" must be chest, not caught by the generic row or curl rules.
        #expect(Muscles.forExercise("Incline chest press")[.chest] == 1)
        #expect(Muscles.forExercise("Incline chest press")[.back] == nil)
        #expect(Muscles.forExercise("Lateral raises")[.shoulders] == 1)
        #expect(Muscles.forExercise("Barbell row")[.back] == 1)
    }

    @Test("falls back to the equipment group, and is empty when it cannot tell")
    func fallback() {
        #expect(Muscles.forExercise("Machine thing", group: .rower)[.back] == 1)
        #expect(Muscles.forExercise("Machine thing").isEmpty)
    }

    @Test("load normalises so the hardest-worked muscle is 1")
    func normalised() {
        let load = Muscles.load([
            WorkedSet(name: "Kettlebell swings", group: .kettlebell, seconds: 120, reps: 0, load: 28),
            WorkedSet(name: "Incline chest press", group: .dumbbell, seconds: 60, reps: 0, load: 20),
        ])
        #expect(load.values.max() == 1)
        #expect((load[.chest] ?? 0) < 1)
    }
}

@Suite("effort")
struct EffortTests {
    private func session(durationSec: Double = 1_440) -> SessionResult {
        SessionResult(
            runsheetId: "w", title: "W", startedAt: "2026-09-15T17:00:00.000Z",
            durationSec: durationSec,
            steps: [StepResult(stepId: "sw", exerciseKey: "kb_swing", target: 28, incline: nil, reps: nil, success: true)]
        )
    }

    @Test("a top-level exercise is matched to its real length, not a guess")
    func topLevelExercise() {
        // The dangling-else bug this guards: a loose 10-minute walk was never registered, so its
        // set length fell back to the session average.
        let sheet = Runsheet(id: "w", title: "W", items: [
            .step(.exercise(ExerciseStep(id: "walk", exercise: Fixtures.swing, forMode: .minutes, forValue: 10)))
        ])
        let result = SessionResult(
            runsheetId: "w", title: "W", startedAt: "2026-09-15T17:00:00.000Z", durationSec: 600,
            steps: [StepResult(stepId: "walk", exerciseKey: "kb_swing", target: nil, incline: nil, reps: nil, success: true)]
        )
        let worked = EffortModel.workedFrom(result, runsheet: sheet)
        #expect(worked.count == 1)
        #expect(worked[0].seconds == 600)
    }

    @Test("calories scale with bodyweight and say when the weight is a guess")
    func calories() {
        let worked = [WorkedSet(name: "Kettlebell swings", group: .kettlebell, seconds: 600, reps: 10, load: 28)]
        let guessed = EffortModel.effort(session(), worked: worked, bodyweightKg: nil)
        let known = EffortModel.effort(session(), worked: worked, bodyweightKg: 100)
        #expect(guessed.estimatedWeight)
        #expect(!known.estimatedWeight)
        #expect(known.kcal > guessed.kcal)
        #expect(guessed.tonnage == 280)
    }

    @Test("streak counts back in Monday weeks and stops at the first gap")
    func streak() {
        let today = ISO8601.date("2026-09-17T12:00:00.000Z")!
        var results: [SessionResult] = []
        // This week and the two before it, then a gap, then one older session.
        for iso in ["2026-09-15T08:00:00.000Z", "2026-09-09T08:00:00.000Z", "2026-09-02T08:00:00.000Z", "2026-08-12T08:00:00.000Z"] {
            results.append(SessionResult(runsheetId: "w", title: "W", startedAt: iso))
        }
        let s = EffortModel.streak(results, today: today)
        #expect(s.weeks == 3)
        #expect(s.thisWeek == 1)
        #expect(s.lastWeek == 1)
        #expect(s.total == 4)
    }
}

@Suite("last used")
struct LastUsedTests {
    @Test("a workout starts on the numbers you finished on")
    func carriesOver() {
        let sheet = Fixtures.interval()
        let history = [SessionResult(
            runsheetId: "i", title: "Interval", startedAt: "2026-09-15T17:00:00.000Z",
            steps: [
                StepResult(stepId: "sw", exerciseKey: "kb_swing", target: 32, incline: nil, reps: nil, success: true),
                StepResult(stepId: "pr", exerciseKey: "db_incline_press", target: 24, incline: nil, reps: nil, success: true),
            ]
        )]
        let seeded = Settings.withLastUsed(sheet, results: history)
        #expect(seeded.exerciseSteps.first { $0.id == "sw" }?.target == 32)
        #expect(seeded.exerciseSteps.first { $0.id == "pr" }?.target == 24)
    }

    @Test("the newest session wins, and the exercise key carries between workouts")
    func newestWins() {
        let history = [
            SessionResult(runsheetId: "x", title: "X", startedAt: "2026-09-16T17:00:00.000Z",
                          steps: [StepResult(stepId: "other", exerciseKey: "kb_swing", target: 36, incline: nil, reps: nil, success: true)]),
            SessionResult(runsheetId: "x", title: "X", startedAt: "2026-09-01T17:00:00.000Z",
                          steps: [StepResult(stepId: "other", exerciseKey: "kb_swing", target: 20, incline: nil, reps: nil, success: true)]),
        ]
        let seeded = Settings.withLastUsed(Fixtures.interval(), results: history)
        #expect(seeded.exerciseSteps.first { $0.id == "sw" }?.target == 36)
    }
}
