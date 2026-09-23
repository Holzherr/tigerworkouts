import Foundation
import Testing
@testable import TigerWorkouts

/// The gym does not read the plan: benches and machines are taken, and the session has to carry on.
@Suite("alternatives")
struct AlternativesTests {
    private func exercise(_ key: String) -> LibraryExercise {
        guard let e = Library.shared.exercise(key) else { fatalError("no \(key) in the library") }
        return e
    }

    @Test("a busy bench offers machines and bodyweight that press the same way")
    func benchAlternatives() {
        let step = ExerciseStep(id: "s1", exercise: exercise("db_bench").ref, target: 20, forMode: .reps, forValue: 8)
        let keys = Alternatives.options(for: step, limit: 8).map(\.exercise.key)
        #expect(keys.contains("machine_chest_press"))
        #expect(keys.contains { $0.contains("pushup") || $0.contains("push_up") })
        #expect(!keys.contains("db_bench"))
    }

    @Test("the load comes over in the new exercise's own terms")
    func loadConverts() {
        let db = exercise("db_bench")           // 20 kg per arm
        let machine = exercise("machine_chest_press") // one number, 2.5 kg steps
        // Two dumbbells, plus what a machine's leverage flatters you by, rounded to its steppers.
        #expect(Alternatives.convert(20, from: db, to: machine) == 45)
        #expect(Alternatives.convert(45, from: machine, to: db) == 20)
        // Bodyweight has no load to carry over.
        #expect(Alternatives.convert(20, from: db, to: exercise("bw_pushup")) == nil)
    }

    @Test("a rower is cardio, not a row")
    func patternsReadTheMachine() {
        #expect(Alternatives.pattern(of: exercise("cardio_rower")) == .cardio)
        #expect(Alternatives.pattern(of: exercise("cable_row")) == .horizontalPull)
        #expect(Alternatives.pattern(of: exercise("machine_leg_press")) == .squat)
        #expect(Alternatives.pattern(of: exercise("kb_swing")) == .hinge)
    }

    @Test("a swap changes what is left, not what is done")
    func swapKeepsHistory() {
        let sheet = Fixtures.interval()
        var s = Runner.tick(Runner.start(sheet, now: 0), now: 5_000)
        let stepId = Runner.current(s)!.step.id
        s = Runner.advance(s, now: 20_000)          // first round done
        s = Runner.tick(s, now: 40_000)
        let machine = Library.shared.exercise("machine_chest_press")!
        let after = Runner.swap(s, now: 41_000, stepId: stepId, to: machine.ref, target: 45)
        let done = after.slots.prefix(after.i).compactMap { $0.step.asExercise }.filter { $0.id == stepId }
        let left = after.slots.dropFirst(after.i).compactMap { $0.step.asExercise }.filter { $0.id == stepId }
        #expect(done.allSatisfy { $0.exercise.key != "machine_chest_press" })
        #expect(!left.isEmpty)
        #expect(left.allSatisfy { $0.exercise.key == "machine_chest_press" && $0.target == 45 })
    }
}

