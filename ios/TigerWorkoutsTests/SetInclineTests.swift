import Foundation
import Testing
@testable import TigerWorkouts

@Suite("set table incline")
@MainActor
struct SetInclineTests {
    /// 2 rounds of 30 s Treadmill sprints at 14.5 kph and 10% incline.
    static func sprints() -> Runsheet {
        Edit.updateStep(SessionRunnerTests.sprints(), id: "s1") { $0.target = 14.5; $0.incline = 10 }
    }

    @Test("a treadmill block reads KPH / INCL / SEC; a dumbbell block with no incline has no INCL")
    func columns() {
        SessionRunner.$savedName.withValue("test-\(UUID().uuidString).json") {
            let runner = SessionRunner(runsheet: Self.sprints())
            guard let step = runner.straightSetStep else { Issue.record("sprints are not a set table"); return }
            #expect(TimerView.setColumns(step, inclines: runner.setRows.map(\.incline)) == ["KPH", "INCL", "SEC"])
        }
        let press = ExerciseStep(id: "pr", exercise: Fixtures.press, target: 20, forMode: .reps, forValue: 10)
        #expect(TimerView.setColumns(press, inclines: [nil, nil, nil]) == ["KG", "REPS"])
    }

    @Test("+ on the current sprint set takes 10 to 10.5, for the next set and in the log")
    func raise() {
        SessionRunner.$savedName.withValue("test-\(UUID().uuidString).json") {
            let runner = SessionRunner(runsheet: Self.sprints())
            runner.control(.done, token: SessionRunner.token(runner.state)) // Start, from the lead-in
            guard let first = runner.setRows.first else { Issue.record("no set rows"); return }
            #expect(first.current && first.incline == 10)
            runner.nudgeSetIncline(first.slotId, 1)
            #expect(runner.setRows.map(\.incline) == [10.5, 10.5])
            runner.done()
            #expect(runner.setRows.last?.current == true && runner.setRows.last?.incline == 10.5)
            #expect(runner.result().steps.first?.incline == 10.5)
        }
    }

    @Test("+ on a later set tapped open changes that set, not the one running")
    func openRow() {
        SessionRunner.$savedName.withValue("test-\(UUID().uuidString).json") {
            let runner = SessionRunner(runsheet: Self.sprints())
            runner.control(.done, token: SessionRunner.token(runner.state))
            runner.nudgeSetIncline(runner.setRows.last?.slotId ?? "", -2)
            #expect(runner.setRows.map(\.incline) == [10, 9])
        }
    }
}
