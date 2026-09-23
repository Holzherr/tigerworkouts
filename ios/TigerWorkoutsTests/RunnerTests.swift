import Foundation
import Testing
@testable import TigerWorkouts

/// Ported one for one from `src/features/timer/runner.test.ts`. The engine is the part that must
/// behave identically in both apps — a workout run on the phone has to log what the web app would.
enum Fixtures {
    static let swing = ExerciseRef(key: "kb_swing", name: "Kettlebell swings", unit: "kg", step: 4)
    static let press = ExerciseRef(key: "db_incline_press", name: "Incline chest press", unit: "kg per arm", step: 2.5)
    static let pullup = ExerciseRef(key: "bw_pullup", name: "Pull-ups", unit: "", step: 1)
    static let pushup = ExerciseRef(key: "bw_pushup", name: "Push-ups", unit: "", step: 1)
    static let burpee = ExerciseRef(key: "bw_burpee", name: "Burpees", unit: "", step: 1)
    static let squat = ExerciseRef(key: "bw_squat", name: "Squats", unit: "", step: 1)

    static func work(_ id: String, _ ex: ExerciseRef, target: Double? = nil, forMode: ForMode = .seconds, forValue: Double = 30) -> Step {
        .exercise(ExerciseStep(id: id, exercise: ex, target: target, forMode: forMode, forValue: forValue))
    }

    static func rest(_ id: String, _ seconds: Double) -> Step { .rest(RestStep(id: id, seconds: seconds)) }

    /// 2 rounds of: 30 s swings, 10 s rest, 30 s press, 10 s rest.
    static func interval() -> Runsheet {
        Runsheet(id: "i", title: "Interval", items: [.block(Block(
            id: "b", name: "B", repeatCount: 2,
            steps: [work("sw", swing, target: 28), rest("r1", 10), work("pr", press, target: 20), rest("r2", 10)]
        ))])
    }

    static func cindy() -> Runsheet {
        Runsheet(id: "c", title: "Cindy", items: [.block(Block(
            id: "b", name: "Cindy", repeatCount: 1, mode: .amrap,
            steps: [work("a", pullup, forMode: .reps, forValue: 5), work("b2", pushup, forMode: .reps, forValue: 10)],
            timeCapSec: 60
        ))])
    }
}

@Suite("expand")
struct ExpandTests {
    @Test("unrolls rounds and adds rest between them")
    func rounds() {
        let b = Block(id: "b", name: "B", repeatCount: 3, steps: [Fixtures.work("sw", Fixtures.swing)], restBetweenSec: 60)
        let slots = Runner.expand(Runsheet(title: "t", items: [.block(b)]))
        #expect(slots.map(\.kind) == [.work, .rest, .work, .rest, .work])
    }

    @Test("ladders scale reps per rung")
    func ladder() {
        let b = Block(
            id: "b", name: "B", repeatCount: 1, mode: .ladder,
            steps: [Fixtures.work("p", Fixtures.pullup, forMode: .reps, forValue: 21)],
            ladder: [21, 15, 9]
        )
        let slots = Runner.expand(Runsheet(title: "t", items: [.block(b)]))
        #expect(slots.map { $0.exercise?.forValue ?? 0 } == [21, 15, 9])
        #expect(slots[0].seconds == nil) // reps are user-paced
    }

    @Test("emom adds a wait-for-boundary rest each minute")
    func emom() {
        let b = Block(
            id: "b", name: "E", repeatCount: 2, mode: .emom,
            steps: [Fixtures.work("x", Fixtures.burpee, forMode: .reps, forValue: 5)],
            everySec: 60
        )
        let slots = Runner.expand(Runsheet(title: "t", items: [.block(b)]))
        #expect(slots.map(\.kind) == [.work, .rest, .work, .rest])
        #expect(slots[1].untilBoundary)
    }
}

@Suite("run")
struct RunTests {
    @Test("leads in, counts down, advances, and finishes")
    func lifecycle() {
        var s = Runner.start(Fixtures.interval(), now: 0)
        #expect(s.phase == .lead)
        s = Runner.tick(s, now: 5_000)
        #expect(s.phase == .running)
        #expect(s.i == 0)
        s = Runner.tick(s, now: 5_000 + 30_000) // 30 s swings
        #expect(s.i == 1)
        #expect(s.slots[1].kind == .rest)

        var t: Double = 35_000
        while t < 200_000, s.phase != .done {
            s = Runner.tick(s, now: t)
            t += 1_000
        }
        #expect(s.phase == .done)
        #expect(abs(Runner.elapsed(s, now: 200_000) - (s.endedAt ?? 0) / 1000) < 1)
    }

    @Test("pause freezes the countdown and resume restores it")
    func pauseResume() {
        var s = Runner.tick(Runner.start(Fixtures.interval(), now: 0), now: 5_000)
        s = Runner.pause(s, now: 15_000) // 20 s left
        s = Runner.tick(s, now: 60_000)
        #expect(s.phase == .paused)
        s = Runner.resume(s, now: 60_000)
        #expect(((s.endsAt ?? 0) - 60_000) / 1000 == 20)
        #expect(s.pausedMs == 45_000)
    }

    @Test("adjust logs a change with the time into the step")
    func adjust() {
        var s = Runner.tick(Runner.start(Fixtures.interval(), now: 0), now: 5_000)
        s = Runner.adjust(s, now: 12_000, target: 32)
        #expect(s.actuals[s.slots[0].id]?.changes == [Change(atSec: 7, target: 32)])
    }

    @Test("drop removes every later slot of that step")
    func drop() {
        var s = Runner.tick(Runner.start(Fixtures.interval(), now: 0), now: 5_000)
        s = Runner.drop(s, now: 6_000, stepId: "pr")
        #expect(!s.slots.contains { $0.step.id == "pr" })
        #expect(s.slots.count == 6)
    }

    @Test("amrap stops at the cap and scores rounds + reps")
    func amrap() {
        var s = Runner.tick(Runner.start(Fixtures.cindy(), now: 0), now: 5_000)
        var t: Double = 5_000
        for _ in 0..<5 {
            t += 10_000
            s = Runner.advance(s, now: t)
        }
        s = Runner.tick(s, now: 5_000 + 61_000)
        #expect(s.phase == .done)
        let result = Runner.toResult(s, Fixtures.cindy(), now: 70_000)
        #expect(abs((result.score ?? 0) - 2.005) < 0.0005)
    }

    @Test("a load set on a later round carries back to the rest of that step")
    func carriesForward() {
        var s = Runner.tick(Runner.start(Fixtures.interval(), now: 0), now: 5_000)
        s = Runner.adjust(s, now: 6_000, target: 32)
        // Round two's swings slot is index 4; it inherits the change made in round one.
        #expect(Runner.effectiveTarget(s, 4) == 32)
    }

    @Test("a step changed from the overview applies from there to the end")
    func adjustAhead() {
        var s = Runner.tick(Runner.start(Fixtures.interval(), now: 0), now: 5_000)
        s = Runner.adjustStep(s, stepId: "pr", target: 24)
        #expect(Runner.plannedTarget(s, stepId: "pr") == 24)
        #expect(Runner.effectiveTarget(s, 6) == 24) // round two's press, too
    }

    @Test("a new part parks the timer until Start block")
    func parksBetweenParts() {
        let sheet = Runsheet(id: "two", title: "Two", items: [
            .block(Block(id: "b1", name: "One", repeatCount: 1, steps: [Fixtures.work("a", Fixtures.swing)])),
            .block(Block(id: "b2", name: "Two", repeatCount: 1, steps: [Fixtures.work("b", Fixtures.press)])),
        ])
        var s = Runner.tick(Runner.start(sheet, now: 0), now: 5_000)
        s = Runner.tick(s, now: 5_000 + 30_000)
        #expect(s.phase == .ready)
        #expect(s.i == 1)
        s = Runner.startBlock(s, now: 40_000)
        #expect(s.phase == .running)
    }

    @Test("toResult carries the adjusted target and the reps that were done")
    func result() {
        var s = Runner.tick(Runner.start(Fixtures.interval(), now: 0), now: 5_000)
        s = Runner.adjust(s, now: 6_000, target: 32)
        var t: Double = 35_000
        while t < 200_000, s.phase != .done {
            s = Runner.tick(s, now: t)
            t += 1_000
        }
        let result = Runner.toResult(s, Fixtures.interval(), now: 200_000)
        #expect(result.steps.first { $0.stepId == "sw" }?.target == 32)
        #expect(result.steps.first { $0.stepId == "pr" }?.target == 20)
        #expect(result.completed == true)
    }
}

/// Ported one for one from `runner.test.ts`: same cases, same names (specs/unified-editing.md).
@Suite("replan: editing what is still to come")
struct ReplanTests {
    /// 2 rounds of swings, then 3 rounds of press, then 10 squats.
    static func plan() -> Runsheet {
        Runsheet(id: "p", title: "Plan", items: [
            .block(Block(id: "b1", name: "Swings", repeatCount: 2, steps: [Fixtures.work("sw", Fixtures.swing, target: 28)])),
            .block(Block(id: "b2", name: "Press", repeatCount: 3, steps: [Fixtures.work("pr", Fixtures.press, target: 20)])),
            .block(Block(id: "b3", name: "Squats", repeatCount: 1, steps: [Fixtures.work("sq", Fixtures.squat, forMode: .reps, forValue: 10)])),
        ])
    }

    static func withRounds(_ r: Runsheet, _ id: String, _ repeatCount: Int) -> Runsheet {
        Edit.updateBlock(r, id: id) { $0.repeatCount = repeatCount }
    }

    @Test("changing the next block's rounds from 3 to 4 adds one round after the cursor and leaves done slots and their actuals unchanged")
    func nextBlockRounds() {
        var s = Runner.tick(Runner.start(Self.plan(), now: 0), now: 5_000) // swings, round 1
        s = Runner.adjust(s, now: 6_000, target: 32)
        s = Runner.advance(s, now: 35_000) // round 1 done, round 2 running
        let before = s
        s = Runner.replan(s, Self.withRounds(Self.plan(), "b2", 4), now: 36_000)
        #expect(s.i == 1)
        #expect(s.phase == .running)
        #expect(Array(s.slots.prefix(2)) == Array(before.slots.prefix(2)))
        #expect(s.actuals[before.slots[0].id] == before.actuals[before.slots[0].id])
        #expect(s.slots.filter { $0.blockId == "b2" }.count == 4)
        #expect(s.slots.count == 2 + 4 + 1)
        #expect(Set(s.slots.map(\.id)).count == s.slots.count)
    }

    @Test("a block moved up runs next, and a block already done never runs again")
    func movedUp() {
        var s = Runner.tick(Runner.start(Self.plan(), now: 0), now: 5_000)
        s = Runner.advance(s, now: 35_000)
        s = Runner.advance(s, now: 65_000) // parked at the press gate
        #expect(s.phase == .ready)
        let items = Self.plan().items
        var moved = Self.plan()
        moved.items = [items[2], items[1], items[0]]
        s = Runner.replan(s, moved, now: 66_000)
        #expect(s.phase == .ready)
        #expect(s.i == 2)
        #expect(s.slots.dropFirst(2).map(\.blockId) == ["b3", "b2", "b2", "b2"])
        #expect(s.slots.map(\.part) == [0, 0, 1, 2, 2, 2])
        #expect(s.slots.allSatisfy { $0.parts == 3 })
        s = Runner.startBlock(s, now: 70_000)
        #expect(Runner.current(s)?.step.id == "sq")
    }

    @Test("a swap and a load set ahead survive the replan")
    func carries() {
        var s = Runner.tick(Runner.start(Self.plan(), now: 0), now: 5_000)
        s = Runner.swap(s, now: 6_000, stepId: "sq", to: Fixtures.pushup, target: nil)
        s = Runner.adjustStep(s, stepId: "pr", target: 24)
        s = Runner.replan(s, Self.withRounds(Self.plan(), "b2", 4), now: 7_000)
        #expect(s.slots.filter { $0.step.id == "sq" }.allSatisfy { $0.exercise?.exercise.key == "bw_pushup" })
        #expect(Runner.plannedTarget(s, stepId: "pr") == 24)
        #expect(s.slots.filter { $0.step.id == "pr" }.count == 4)
    }

    @Test("during the count-in the whole session is rebuilt")
    func countIn() {
        var s = Runner.start(Self.plan(), now: 0)
        s = Runner.replan(s, Self.withRounds(Self.plan(), "b1", 3), now: 1_000)
        #expect(s.phase == .lead)
        #expect(s.slots.filter { $0.blockId == "b1" }.count == 3)
    }

    @Test("removing everything still to come ends the session at the gate")
    func nothingLeft() {
        var s = Runner.tick(Runner.start(Self.plan(), now: 0), now: 5_000)
        s = Runner.advance(s, now: 35_000)
        s = Runner.advance(s, now: 65_000)
        var only = Self.plan()
        only.items = [only.items[0]]
        s = Runner.replan(s, only, now: 66_000)
        #expect(s.phase == .done)
        #expect(s.slots.count == 2)
    }
}

/// What the workout screen shows is what the session runs: last-used numbers are seeded there,
/// once, and the runner takes the sheet as handed over.
@Suite("session runner")
struct SessionRunnerTests {
    static let sprint = ExerciseRef(key: "sprint", name: "Treadmill sprints", unit: "kph", step: 0.5)

    /// 2 rounds of 30 s sprints at 10 kph, as written — no incline.
    static func sprints() -> Runsheet {
        Runsheet(id: "sp", title: "Sprints", items: [.block(Block(
            id: "b", name: "Sprints", repeatCount: 2,
            steps: [Fixtures.work("s1", sprint, target: 10), Fixtures.rest("r1", 30)]
        ))])
    }

    /// Last week's session: 12 kph at 1% incline.
    static func history() -> [SessionResult] {
        [SessionResult(
            runsheetId: "sp", title: "Sprints", startedAt: "2026-09-13T17:00:00.000Z",
            steps: [StepResult(stepId: "s1", exerciseKey: "sprint", target: 12, incline: 1, reps: nil, success: true)]
        )]
    }

    @Test("what is set on the workout screen is what the session starts with")
    @MainActor
    func screenIsWhatRuns() {
        // The screen seeds once, before the numbers are seen.
        let seeded = Settings.withLastUsed(Self.sprints(), results: Self.history())
        #expect(seeded.exerciseSteps.first?.target == 12)
        #expect(seeded.exerciseSteps.first?.incline == 1)
        // Then the incline is set to 5 on the screen, the way its sheet does it.
        let edited = Edit.updateStep(seeded, id: "s1") { $0.incline = 5 }
        let runner = SessionRunner(runsheet: edited)
        #expect(Runner.effectiveIncline(runner.state, 0) == 5)
        #expect(Runner.effectiveTarget(runner.state, 0) == 12)
    }

    @Test("the runner leaves every target and incline exactly as passed")
    @MainActor
    func verbatim() {
        let sheet = Edit.updateStep(Self.sprints(), id: "s1") { $0.target = 14; $0.incline = 3 }
        let runner = SessionRunner(runsheet: sheet)
        #expect(runner.runsheet == sheet)
        #expect(runner.state.slots.compactMap { $0.exercise?.target } == [14, 14])
        #expect(runner.state.slots.compactMap { $0.exercise?.incline } == [3, 3])
    }

    @Test("the timer's incline line reads the incline and follows a change from the sheet")
    @MainActor
    func inclineLine() throws {
        let sheet = Edit.updateStep(Self.sprints(), id: "s1") { $0.incline = 5 }
        let runner = SessionRunner(runsheet: sheet)
        let step = try #require(runner.slot?.exercise)
        #expect(TimerView.inclineLabel(runner.incline, for: step) == "5% incline")
        runner.setStepIncline("s1", 6)
        #expect(runner.incline == 6)
        #expect(TimerView.inclineLabel(runner.incline, for: step) == "6% incline")
        SessionRunner.clearSaved() // the change wrote a crash-safety copy; leave none behind
    }

    @Test("a step with no incline that is not on a treadmill has no incline line")
    @MainActor
    func noInclineLine() throws {
        let runner = SessionRunner(runsheet: Fixtures.interval())
        let step = try #require(runner.slot?.exercise)
        #expect(TimerView.inclineLabel(runner.incline, for: step) == nil)
    }
}
