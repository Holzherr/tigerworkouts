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
