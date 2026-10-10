import Foundation
import Testing
@testable import TigerWorkouts

/// The Next block card: every dial the next machine has, each settable before the block starts.
@Suite("next block settings")
struct NextBlockSettingsTests {
    static let sprint = ExerciseRef(key: "sprint", name: "Treadmill sprints", unit: "kph", step: 0.5)

    /// A loose warm-up, then a block of sprints at 14.5 kph and 10% incline, so the timer parks.
    static func sheet() -> Runsheet {
        var sprints = ExerciseStep(id: "s1", exercise: sprint, target: 14.5, forMode: .seconds, forValue: 30)
        sprints.incline = 10
        return Runsheet(id: "sp", title: "Sprints", items: [
            .step(Fixtures.work("wu", Fixtures.squat)),
            .block(Block(id: "b", name: "Sprints", repeatCount: 2, steps: [.exercise(sprints), Fixtures.rest("r1", 30)])),
        ])
    }

    static func history() -> [SessionResult] {
        [SessionResult(
            runsheetId: "sp", title: "Sprints", startedAt: "2026-09-29T17:00:00.000Z",
            steps: [
                StepResult(stepId: "s1", exerciseKey: "sprint", target: 14, incline: 9, reps: nil, success: true),
                StepResult(stepId: "pr", exerciseKey: Fixtures.press.key, target: 20, incline: nil, reps: [8], success: true),
            ]
        )]
    }

    @Test("a treadmill step shows Speed and Incline, each with last time; a dumbbell step its load only")
    func settings() throws {
        let step = try #require(Self.sheet().exerciseSteps.first { $0.id == "s1" })
        let treadmill = TimerView.blockSettings(step, target: 14.5, incline: 10, results: Self.history())
        #expect(treadmill == [
            .init(label: "Speed", unit: "kph", value: 14.5, last: 14),
            .init(label: "Incline", unit: "%", value: 10, last: 9),
        ])
        let press = ExerciseStep(id: "pr", exercise: Fixtures.press, target: 22, forMode: .reps, forValue: 8)
        #expect(TimerView.blockSettings(press, target: 22, incline: nil, results: Self.history()) == [
            .init(label: "Load", unit: "kg", value: 22, last: 20),
        ])
    }

    @Test("+ on the card's Incline before the block starts makes its first set start at 10.5")
    @MainActor
    func inclineBeforeTheBlock() throws {
        let runner = SessionRunner(runsheet: Self.sheet())
        runner.tick(at: runner.state.startedAt + Runner.leadSec * 1000 + 1)
        runner.done() // the warm-up
        #expect(runner.state.phase == .ready)
        #expect(runner.incline == 10)
        runner.setStepIncline("s1", TimerView.inclineStep(runner.incline, by: 1))
        runner.startBlock()
        #expect(runner.state.phase == .lead) // a block on a clock gets its Get ready first
        runner.tick(at: (runner.state.endsAt ?? 0) + 1)
        #expect(runner.state.phase == .running)
        #expect(runner.slot?.step.id == "s1")
        #expect(runner.incline == 10.5)
        SessionRunner.clearSaved() // the change wrote a crash-safety copy; leave none behind
    }

    @Test("the Session sheet's set grid has an Incline row for a treadmill step, set or not, and none for a dumbbell")
    func gridIncline() throws {
        let sprints = try #require(Self.sheet().exerciseSteps.first { $0.id == "s1" })
        #expect(SetPlanGrid.showsIncline(sprints.incline, for: sprints))
        let flat = ExerciseStep(id: "s2", exercise: Self.sprint, target: 14.5, forMode: .seconds, forValue: 30)
        #expect(flat.incline == nil)
        #expect(SetPlanGrid.showsIncline(nil, for: flat))
        let press = ExerciseStep(id: "pr", exercise: Fixtures.press, target: 22, forMode: .reps, forValue: 8)
        #expect(!SetPlanGrid.showsIncline(nil, for: press))
    }

    @Test("the grid's Incline stepper moves half a percent a press and never below flat")
    func gridInclineStepper() {
        #expect(TimerView.inclineStep(10, by: 1) == 10.5)
        #expect(TimerView.inclineStep(0, by: -1) == 0)
    }
}
