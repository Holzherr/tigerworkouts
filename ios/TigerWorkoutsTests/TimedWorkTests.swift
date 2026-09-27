import Foundation
import Testing
@testable import TigerWorkouts

/// Ported from the "timed and distance work" suite in `src/features/timer/runner.test.ts`.
@Suite("timed and distance work")
struct TimedWorkTests {
    static let plankEx = ExerciseRef(key: "bw_plank", name: "Plank", unit: "s", step: 5)
    static let rower = ExerciseRef(key: "cardio_rower", name: "Rowing machine", unit: "m", step: 100)
    static let bike = ExerciseRef(key: "cardio_assault_bike", name: "Assault bike", unit: "cal", step: 1)

    static func plank() -> Runsheet {
        Runsheet(id: "pl", title: "Plank", items: [.block(Block(id: "b", name: "B", repeatCount: 2, steps: [Fixtures.work("p", plankEx, forMode: .seconds, forValue: 60), Fixtures.rest("r", 30)]))])
    }
    static func row() -> Runsheet {
        Runsheet(id: "rw", title: "Row", items: [.step(.exercise(ExerciseStep(id: "rw", exercise: rower, forMode: .meters, forValue: 500)))])
    }

    @Test("a countdown that runs out logs its whole length")
    func runsOut() {
        var s = Runner.tick(Runner.start(Self.plank(), now: 0), now: 5000)
        s = Runner.tick(s, now: 5000 + 60000 + 400) // a late tick
        let set = Runner.toResult(s, Self.plank(), now: 70000).steps[0].sets?[0]
        #expect(set?.seconds == 60)
        #expect(set?.load == nil) // seconds is the plank's unit, not a load
    }

    @Test("Done early keeps the time it ran, pauses out; Skip logs nothing")
    func doneEarly() {
        var s = Runner.tick(Runner.start(Self.plank(), now: 0), now: 5000)
        s = Runner.pause(s, now: 25000)
        s = Runner.resume(s, now: 40000)
        s = Runner.advance(s, now: 57000)
        #expect(s.actuals[s.slots[0].id]?.seconds == 37)
        s = Runner.advance(s, now: 60000, skipped: true)
        s = Runner.advance(s, now: 70000, skipped: true)
        #expect(Runner.toResult(s, Self.plank(), now: 70000).steps[0].sets?.map(\.seconds) == [37])
    }

    @Test("a distance logs the plan unless changed, and the time it took")
    func distance() {
        var s = Runner.tick(Runner.start(Self.row(), now: 0), now: 5000)
        #expect(Runner.amountAt(s, s.slots[0]) == 500)
        var set = Runner.toResult(Runner.advance(s, now: 5000 + 101_000), Self.row(), now: 110_000).steps[0].sets?[0]
        #expect(set?.meters == 500 && set?.seconds == 101)
        s = Runner.setAmount(s, value: 480)
        set = Runner.toResult(Runner.advance(s, now: 5000 + 99000), Self.row(), now: 110_000).steps[0].sets?[0]
        #expect(set?.meters == 480 && set?.seconds == 99 && set?.load == nil)
    }

    @Test("a rower on the clock logs metres only when entered")
    func rowerOnTheClock() {
        let sheet = Runsheet(id: "t", title: "T", items: [.step(.exercise(ExerciseStep(id: "x", exercise: Self.rower, forMode: .minutes, forValue: 2)))])
        var s = Runner.tick(Runner.start(sheet, now: 0), now: 5000)
        #expect(Runner.amountField(s.slots[0]) == .meters)
        #expect(Runner.amountAt(s, s.slots[0]) == nil)
        s = Runner.setAmount(s, value: 540)
        s = Runner.tick(s, now: 5000 + 120_000)
        let set = Runner.toResult(s, sheet, now: 130_000).steps[0].sets?[0]
        #expect(set?.meters == 540 && set?.seconds == 120)
    }

    @Test("calories count on a calorie step; a set of reps keeps no time")
    func calories() {
        let sheet = Runsheet(id: "c", title: "C", items: [.block(Block(id: "b", name: "B", repeatCount: 1, steps: [Fixtures.work("bk", Self.bike, forMode: .calories, forValue: 20), Fixtures.work("pu", Fixtures.pushup, forMode: .reps, forValue: 10)]))])
        var s = Runner.tick(Runner.start(sheet, now: 0), now: 5000)
        s = Runner.setAmount(s, value: 22)
        s = Runner.advance(s, now: 45000)
        s = Runner.advance(s, now: 65000)
        let r = Runner.toResult(s, sheet, now: 65000)
        #expect(r.steps[0].sets?[0].calories == 22 && r.steps[0].sets?[0].seconds == 40)
        #expect(r.steps[1].sets?[0].seconds == nil)
    }

    @Test("a done set is locked until un-ticked")
    func locked() {
        var s = Runner.tick(Runner.start(Self.row(), now: 0), now: 5000)
        s = Runner.advance(s, now: 105_000)
        #expect(Runner.setAmountAt(s, slotId: s.slots[0].id, value: 400) == s)
    }

    @Test("a set ticked straight after its rest has no time of its own")
    func tickedAfterRest() {
        let sheet = Runsheet(id: "h", title: "H", items: [.block(Block(id: "b", name: "B", repeatCount: 2, steps: [Fixtures.work("h", Self.plankEx, forMode: .max, forValue: 0)], restBetweenSec: 60))])
        var s = Runner.tick(Runner.start(sheet, now: 0), now: 5000)
        s = Runner.advance(s, now: 50000)
        s = Runner.completeSet(s, now: 60000, slotId: s.slots[2].id)
        #expect(Runner.toResult(s, sheet, now: 60000).steps[0].sets?.map(\.seconds) == [45, nil])
    }

    @Test("for-time rounds are split per round")
    func forTimeSplits() {
        let sheet = Runsheet(id: "f", title: "F", items: [.block(Block(id: "b", name: "F", repeatCount: 3, mode: .fortime, steps: [Fixtures.work("a", Fixtures.pullup, forMode: .reps, forValue: 5), Fixtures.work("c", Fixtures.pushup, forMode: .reps, forValue: 10)]))])
        var s = Runner.tick(Runner.start(sheet, now: 0), now: 5000)
        for t in [20.0, 40, 70, 95, 130, 150] { s = Runner.advance(s, now: t * 1000) }
        #expect(Runner.toResult(s, sheet, now: 150_000).splits == [RoundSplit(blockId: "b", at: [40, 95, 150], from: 5)])
    }
}
