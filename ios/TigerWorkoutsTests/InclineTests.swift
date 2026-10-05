import Testing
@testable import TigerWorkouts

/// A treadmill set carries two settings, and the timer changes both.
@Suite("incline on the timer")
struct InclineTests {
    @Test("an incline changed on the set table is what later sets and the log read")
    @MainActor
    func inclineIsLogged() throws {
        // 3 sets of 30 s sprints at 14.5 kph and 10% incline.
        let sheet = Runsheet(id: "sp", title: "Sprints", items: [.block(Block(id: "b", name: "Sprints", repeatCount: 3, steps: [
            .exercise(ExerciseStep(id: "s1", exercise: SessionRunnerTests.sprint, target: 14.5, incline: 10)),
        ]))])
        let runner = SessionRunner(runsheet: sheet)
        runner.setStepIncline("s1", 10.5)
        #expect(runner.setRows.map(\.incline) == [10.5, 10.5, 10.5])
        #expect(runner.result().steps.first?.incline == 10.5)
        // + on set 2 moves it and set 3 half a percent.
        runner.nudgeSetIncline(try #require(runner.setRows.dropFirst().first).slotId, 1)
        #expect(runner.setRows.map(\.incline) == [10.5, 11, 11])
        SessionRunner.clearSaved()
    }
}
