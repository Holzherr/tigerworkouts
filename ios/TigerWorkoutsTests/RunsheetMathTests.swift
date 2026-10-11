import Foundation
import Testing
@testable import TigerWorkouts

/// The timing half of model.ts (stepSeconds, blockSeconds, runsheetSeconds) as ported to
/// RunsheetMath.swift: the minutes on every card and the stats both apps show.
@Suite("runsheet math")
struct RunsheetMathTests {
    static func ex(_ mode: ForMode, _ value: Double, _ tweak: (inout ExerciseStep) -> Void = { _ in }) -> Step {
        var e = ExerciseStep(id: "e", exercise: Fixtures.squat, forMode: mode, forValue: value)
        tweak(&e)
        return .exercise(e)
    }

    @Test("a step's seconds per mode, as stepSeconds")
    func stepSeconds() {
        #expect(Self.ex(.seconds, 40).estimatedSeconds == 40)
        #expect(Self.ex(.minutes, 2).estimatedSeconds == 120)
        #expect(Self.ex(.meters, 400).estimatedSeconds == 120)
        #expect(Self.ex(.calories, 15).estimatedSeconds == 60)
        #expect(Self.ex(.max, 1).estimatedSeconds == 60)
        #expect(Self.ex(.reps, 10).estimatedSeconds == 30)
        #expect(Self.ex(.reps, 10) { $0.perSide = true }.estimatedSeconds == 60)
        #expect(Self.ex(.segment, 0) { $0.startSeconds = 30; $0.endSeconds = 90 }.estimatedSeconds == 60)
        #expect(Self.ex(.segment, 0) { $0.startSeconds = 30 }.estimatedSeconds == 60)
        #expect(Fixtures.rest("r", 45).estimatedSeconds == 45)
    }

    @Test("only timed steps get a countdown")
    func clockSeconds() {
        #expect(Self.ex(.seconds, 40).clockSeconds == 40)
        #expect(Self.ex(.minutes, 2).clockSeconds == 120)
        #expect(Self.ex(.reps, 10).clockSeconds == nil)
        #expect(Self.ex(.segment, 0) { $0.startSeconds = 30 }.clockSeconds == nil)
        #expect(Fixtures.rest("r", 45).clockSeconds == 45)
    }

    @Test("a block's seconds per mode, as blockSeconds")
    func blockSeconds() {
        let round: [Step] = [Self.ex(.seconds, 30), Fixtures.rest("r", 10)]
        let rounds: Double = 3 * 40 + 2 * 60
        #expect(Block(id: "b", name: "B", repeatCount: 3, steps: round, restBetweenSec: 60).estimatedSeconds == rounds)
        #expect(Block(id: "b", name: "B", repeatCount: 5, mode: .fortime, steps: round, timeCapSec: 100).estimatedSeconds == 100)
        #expect(Block(id: "b", name: "B", repeatCount: 1, mode: .amrap, steps: round, timeCapSec: 600).estimatedSeconds == 600)
        #expect(Block(id: "b", name: "B", repeatCount: 10, mode: .emom, steps: round, everySec: 90).estimatedSeconds == 900)
        // 21-15-9 of reps at 3 s each, a fixed 30 s step every rung, 60 s between rungs.
        var fixed = ExerciseStep(id: "f", exercise: Fixtures.pushup, forMode: .seconds, forValue: 30)
        fixed.ladderFixed = true
        let ladder = Block(id: "b", name: "B", mode: .ladder, steps: [Self.ex(.reps, 1), .exercise(fixed)], restBetweenSec: 60, ladder: [21, 15, 9])
        let expected: Double = 45 * 3 + 3 * 30 + 2 * 60 // 45 reps over the rungs
        #expect(ladder.estimatedSeconds == expected)
    }

    @Test("a cap of 0 is no cap, as the runner and the web read it")
    func zeroCap() {
        let round: [Step] = [Self.ex(.seconds, 30)]
        #expect(Block(id: "b", name: "B", repeatCount: 4, mode: .fortime, steps: round, timeCapSec: 0).estimatedSeconds == 120)
        #expect(Runsheet(title: "T", items: [.step(Self.ex(.minutes, 10))], timeCapSec: 0).minutes == 10)
        #expect(Runsheet(title: "T", items: [.step(Self.ex(.minutes, 10))], timeCapSec: 300).minutes == 5)
    }

    @Test("the score comes from the main block's mode when none is set")
    func effectiveScore() {
        let round: [Step] = [Self.ex(.reps, 10)]
        #expect(Runsheet(title: "T", items: [.block(Block(id: "b", name: "B", mode: .fortime, steps: round))]).effectiveScore == .time)
        #expect(Runsheet(title: "T", items: [.block(Block(id: "b", name: "B", mode: .amrap, steps: round, timeCapSec: 600))]).effectiveScore == .rounds)
        #expect(Runsheet(title: "T", items: [.block(Block(id: "b", name: "B", steps: [Self.ex(.max, 1)]))]).effectiveScore == .reps)
        #expect(Runsheet(title: "T", items: [.block(Block(id: "b", name: "B", steps: round))]).effectiveScore == ScoreType.none)
        #expect(Runsheet(title: "T", items: [.block(Block(id: "b", name: "B", mode: .fortime, steps: round))], score: .load).effectiveScore == .load)
    }

    @Test("labels and numbers read as on the web")
    func labels() {
        #expect(Block(id: "b", name: "B", mode: .amrap, timeCapSec: 90).modeLabel == "AMRAP 1:30")
        #expect(Block(id: "b", name: "B", mode: .amrap).modeLabel == "AMRAP")
        #expect(Block(id: "b", name: "B", mode: .ladder, ladder: [21, 15, 9]).modeLabel == "21-15-9")
        #expect(Block(id: "b", name: "B", repeatCount: 1, mode: .fortime).modeLabel == "1 round for time")
        #expect(Format.number(43) == "43" && Format.number(14.5) == "14.5")
        #expect(Format.clock(3750) == "1:02:30" && Format.clock(30) == "0:30")
        #expect(Format.duration(45) == "45s" && Format.duration(1440) == "24 min" && Format.duration(3900) == "1h 05")
    }
}
