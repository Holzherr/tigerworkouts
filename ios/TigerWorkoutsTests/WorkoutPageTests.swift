import Foundation
import Testing
@testable import TigerWorkouts

/// Priyanka's test session, 14 Nov 2026: saving a new workout, Duplicate for next week, the
/// last-time label and today's line on the workout page.
@Suite("workout page")
struct WorkoutPageTests {
    private let swing = LibraryExerciseFixture.make(key: "kb_swing", name: "Kettlebell swings", unit: "kg", step: 4, group: .kettlebell)
    private let thrust = ExerciseRef(key: "bb_hip_thrust", name: "Barbell hip thrust", unit: "kg", step: 5)

    @Test("a new workout with an exercise is storable even with an empty block or no name")
    func storable() throws {
        var r = Edit.newRunsheet(creator: "P")
        #expect(Edit.storable(r) == nil, "nothing to run, nothing to save")
        // Her path: Add block, exercises in block 2, block 1 left empty, no name.
        r = Edit.addBlock(r)
        let second = r.items.compactMap(\.asBlock)[1].id
        r = Edit.addExercise(r, to: second, exercise: swing)
        #expect(Edit.problem(with: r) != nil, "the old gate refused this, so it was never saved")
        let kept = try #require(Edit.storable(r))
        #expect(kept.title == "My workout")
        #expect(kept.items.count == 1)
        #expect(kept.id == r.id)
        #expect(Edit.problem(with: kept) == nil)
    }

    @Test("Duplicate counts the week on, gives fresh ids and leaves the original's history alone")
    func duplicate() {
        let step = ExerciseStep(id: "e1", exercise: thrust, target: 100, forMode: .reps, forValue: 8)
        var original = Runsheet(id: "w-1", title: "Hip thrust focus week 1", items: [
            .block(Block(id: "b1", name: "Block 1", repeatCount: 4, steps: [.exercise(step), .rest(RestStep(id: "r1", seconds: 90))])),
            .step(.exercise(ExerciseStep(id: "e2", exercise: thrust, forMode: .reps, forValue: 5))),
        ])
        original.isPublic = true
        let copy = Edit.duplicateForNextWeek(original, creator: "P")
        #expect(copy.title == "Hip thrust focus week 2")
        #expect(copy.key != original.key)
        #expect(copy.duplicatedFrom == "w-1")
        #expect(copy.copyOf == nil, "copyOf would merge histories and hide the original from Mine")
        #expect(copy.isPublic == nil)
        #expect(Set(Edit.ids(copy)).isDisjoint(with: Edit.ids(original)))
        #expect(copy.exerciseSteps.map(\.target) == original.exerciseSteps.map(\.target))
        #expect(Edit.ids(copy).count == Edit.ids(original).count)
        let session = SessionResult(runsheetId: "w-1", title: nil, startedAt: "2026-11-10T10:00:00Z")
        #expect(original.owns(session) && !copy.owns(session))
        // It round-trips through the stored JSON.
        let decoded = try? JSONDecoder().decode(Runsheet.self, from: JSONEncoder().encode(copy))
        #expect(decoded?.duplicatedFrom == "w-1")
    }

    @Test("the name a duplicate is offered", arguments: [
        ("Hip thrust focus week 1", "Hip thrust focus week 2"),
        ("Legs Week 9", "Legs Week 10"),
        ("Push wk3", "Push wk4"),
        ("Upper W2", "Upper W3"),
        ("Leg day", "Leg day (copy)"),
        ("Murph 2024", "Murph 2024 (copy)"),
    ])
    func nextTitle(_ pair: (String, String)) {
        #expect(Edit.nextTitle(pair.0) == pair.1)
    }

    @Test("last time is the last session's sets in order, not the heaviest one")
    func lastTime() {
        let step = ExerciseStep(id: "e1", exercise: thrust, target: 100, forMode: .reps, forValue: 8)
        let sheet = Runsheet(id: "w-1", title: "Hip thrusts", items: [.step(.exercise(step))])
        func row(_ sets: [(Double, Double)]) -> StepResult {
            StepResult(stepId: "e1", exerciseKey: thrust.key, target: sets.map(\.0).max(), incline: nil, reps: sets.map(\.1), success: nil,
                       sets: sets.map { SetResult(reps: $0.1, load: $0.0) })
        }
        let older = SessionResult(runsheetId: "w-1", title: nil, startedAt: "2026-11-01T10:00:00Z", steps: [row([(80, 8)])])
        let last = SessionResult(runsheetId: "w-1", title: nil, startedAt: "2026-11-10T10:00:00Z",
                                 steps: [row([(100, 8), (110, 4), (110, 4), (115, 1)])])
        #expect(LastTime.lastSessionLabel([older, last], for: step, in: sheet) == "last time 100 × 8, 110 × 4 (×2), 115 × 1")
        #expect(LastTime.label([older, last], for: step, in: sheet) == "last time 115 × 1", "the old label, kept for other callers")
        // Same exercise in another workout when this one has no history.
        let other = Runsheet(id: "w-2", title: "Other", items: [.step(.exercise(ExerciseStep(id: "x", exercise: thrust, forMode: .reps, forValue: 8)))])
        #expect(LastTime.lastSessionLabel([older, last], for: other.exerciseSteps[0], in: other) == "last time 100 × 8, 110 × 4 (×2), 115 × 1")
        #expect(LastTime.lastSessionLabel([], for: step, in: sheet) == nil)
    }

    @Test("compact sets", arguments: [
        ([SetResult(reps: 8, load: 100), SetResult(reps: 8, load: 100), SetResult(reps: 8, load: 100)], "", "100 × 8 (×3)"),
        ([SetResult(reps: 12, load: nil), SetResult(reps: 12, load: nil), SetResult(reps: 10, load: nil)], "", "12 (×2), 10 reps"),
        ([SetResult(reps: nil, load: 10), SetResult(reps: nil, load: 12)], "kph", "10, 12 kph"),
        ((1...6).map { SetResult(reps: 5, load: Double(40 + $0 * 5)) }, "kg", "45 × 5, 50 × 5, 55 × 5, 60 × 5 +2 more"),
    ])
    func compact(_ c: ([SetResult], String, String)) {
        #expect(LastTime.compact(c.0, unit: c.1) == c.2)
    }

    @Test("legacy rows without per-set data read as reps at their one load")
    func legacy() {
        let step = ExerciseStep(id: "e1", exercise: thrust, forMode: .reps, forValue: 8)
        let r = SessionResult(runsheetId: "w", title: nil, startedAt: "2026-11-10T10:00:00Z",
                              steps: [StepResult(stepId: "e1", exerciseKey: thrust.key, target: 90, incline: nil, reps: [8, 8, 6], success: nil, sets: nil)])
        #expect(LastTime.lastSessionLabel([r], for: step) == "last time 90 × 8 (×2), 90 × 6")
    }

    @Test("today's line names the change: load when it moves, else reps")
    func todayDelta() {
        let last = [SetResult(reps: 12, load: 25), SetResult(reps: 12, load: 25), SetResult(reps: 12, load: 25)]
        let jump = Targets.SetTarget(stepId: "e", exerciseKey: "k", name: "Shoulder press", load: 27.5, reps: [8, 8, 8], jump: true, text: "27.5 kg × 8", reason: "")
        #expect(TodayLine.delta(jump, last: last, unit: "kg") == "+2.5 kg")
        let bank = Targets.SetTarget(stepId: "e", exerciseKey: "k", name: "Shoulder press", load: 25, reps: [13, 13, 13], jump: false, text: "25 kg × 13", reason: "")
        #expect(TodayLine.delta(bank, last: last, unit: "kg") == "+1 rep/set")
        let same = Targets.SetTarget(stepId: "e", exerciseKey: "k", name: "Shoulder press", load: 25, reps: [12, 12, 12], jump: false, text: "25 kg × 12", reason: "")
        #expect(TodayLine.delta(same, last: last, unit: "kg") == nil)
        #expect(TodayLine.why("a rep more · 1 more on the workout page") == "a rep more")
        #expect(TodayLine.why("Finish in under 12:00") == "Finish in under 12:00")
    }
}
