import Foundation
import Testing
@testable import TigerWorkouts

@Suite("editing")
struct EditingTests {
    private let swing = LibraryExerciseFixture.make(key: "kb_swing", name: "Kettlebell swings", unit: "kg", step: 4, group: .kettlebell)
    private let walk = LibraryExerciseFixture.make(key: "incline_walk", name: "Incline walk", unit: "kph", step: 0.5, group: .walk)

    private func sheetWithOneBlock() -> (Runsheet, String) {
        var r = Edit.newRunsheet(creator: "Nick")
        r.title = "Mine"
        let blockId = r.items.compactMap(\.asBlock)[0].id
        r = Edit.addExercise(r, to: blockId, exercise: swing)
        return (r, blockId)
    }

    @Test("a new workout starts with one empty block and says what is missing")
    func newWorkout() {
        let r = Edit.newRunsheet(creator: "Nick")
        #expect(r.items.count == 1)
        #expect(r.items.compactMap(\.asBlock).first?.steps.isEmpty == true)
        #expect(Edit.problem(with: r) == "Give it a name.")

        var named = r
        named.title = "Mine"
        #expect(Edit.problem(with: named) == "Add at least one exercise.")
    }

    @Test("an empty block blocks saving even when there are exercises elsewhere")
    func emptyBlock() {
        var (r, _) = sheetWithOneBlock()
        #expect(Edit.problem(with: r) == nil)
        r = Edit.addBlock(r)
        #expect(Edit.problem(with: r) == "Every block needs a step in it.")
    }

    @Test("adding lands in the right place, with a sensible default")
    func adding() {
        let (r, blockId) = sheetWithOneBlock()
        let block = r.items.compactMap(\.asBlock).first { $0.id == blockId }
        #expect(block?.steps.count == 1)
        // Four notches of the exercise's own step: 16 kg on a bell that moves in fours.
        #expect(block?.steps.first?.asExercise?.target == 16)

        let withWalk = Edit.addExercise(r, to: nil, exercise: walk)
        #expect(withWalk.items.count == 2)
        // A treadmill starts at a walking pace, not at four times its increment.
        #expect(withWalk.items.last?.asStep?.asExercise?.target == 10)

        let withRest = Edit.addRest(withWalk, to: blockId, seconds: 45)
        #expect(withRest.items.compactMap(\.asBlock).first?.steps.count == 2)
    }

    @Test("your own version is a new private workout that points at the original")
    func newVersion() {
        let (original, _) = sheetWithOneBlock()
        let version = Settings.newVersion(original, of: original, id: "u-1", creator: "Nick")
        #expect(version.id == "u-1")
        #expect(version.title == "Mine (mine)")
        #expect(version.isPublic == false)
        #expect(version.derivedFrom == original.id)
        #expect(version.source?.kind == "user")
        // Step ids stay: last-used history is keyed by workout id and step id together, so the
        // two workouts cannot leak loads into each other.
        #expect(version.exerciseSteps.map(\.id) == original.exerciseSteps.map(\.id))
    }

    @Test("removing and reordering")
    func removeAndMove() {
        var (r, blockId) = sheetWithOneBlock()
        r = Edit.addRest(r, to: blockId, seconds: 30)
        r = Edit.addExercise(r, to: blockId, exercise: walk)
        let steps = r.items.compactMap(\.asBlock)[0].steps
        #expect(steps.count == 3)

        let moved = Edit.moveSteps(r, in: blockId, from: [2], to: 0)
        #expect(moved.items.compactMap(\.asBlock)[0].steps.first?.id == steps[2].id)

        let removed = Edit.removeStep(r, stepId: steps[1].id)
        #expect(removed.items.compactMap(\.asBlock)[0].steps.count == 2)

        let gone = Edit.remove(r, itemId: blockId)
        #expect(gone.items.isEmpty)
    }

    @Test("blocks reorder without losing their steps")
    func moveBlocks() {
        var (r, first) = sheetWithOneBlock()
        r = Edit.addBlock(r)
        let second = r.items.compactMap(\.asBlock)[1].id
        r = Edit.addExercise(r, to: second, exercise: walk)

        let moved = Edit.moveItems(r, from: [1], to: 0)
        #expect(moved.items.map(\.id) == [second, first])
        #expect(moved.items.compactMap(\.asBlock)[0].steps.first?.asExercise?.exercise.key == "incline_walk")
    }

    @Test("an update touches one step and leaves its neighbours alone")
    func updating() {
        var (r, blockId) = sheetWithOneBlock()
        r = Edit.addExercise(r, to: blockId, exercise: walk)
        let target = r.exerciseSteps[0]
        let neighbour = r.exerciseSteps[1]

        let changed = Edit.updateStep(r, id: target.id) { $0.target = 32; $0.forMode = .reps; $0.forValue = 15 }
        #expect(changed.exerciseSteps.first { $0.id == target.id }?.target == 32)
        #expect(changed.exerciseSteps.first { $0.id == target.id }?.forValue == 15)
        #expect(changed.exerciseSteps.first { $0.id == neighbour.id }?.target == neighbour.target)

        let blocked = Edit.updateBlock(r, id: blockId) { $0.repeatCount = 5; $0.mode = .amrap; $0.timeCapSec = 600 }
        #expect(blocked.items.compactMap(\.asBlock)[0].runMode == .amrap)
        #expect(blocked.items.compactMap(\.asBlock)[0].modeLabel == "AMRAP 10:00")
    }

    @Test("an edited workout survives the round trip to the server and back")
    func roundTrip() {
        var (r, blockId) = sheetWithOneBlock()
        r = Edit.addRest(r, to: blockId, seconds: 30)
        r = Edit.updateBlock(r, id: blockId) { $0.repeatCount = 8; $0.restBetweenSec = 60 }

        let data = try! JSONEncoder().encode(r)
        let back = try! JSONDecoder().decode(Runsheet.self, from: data)
        #expect(back.title == r.title)
        #expect(back.items.compactMap(\.asBlock)[0].repeatCount == 8)
        #expect(back.items.compactMap(\.asBlock)[0].restBetweenSec == 60)
        #expect(back.exerciseSteps.map(\.id) == r.exerciseSteps.map(\.id))
        // And it still runs: the engine has to be able to expand what the editor wrote.
        #expect(Runner.expand(back).count == 8 * 2 + 7)
    }
}

/// `LibraryExercise` decodes from the export rather than being built by hand, so the tests make
/// one through the same door.
enum LibraryExerciseFixture {
    static func make(key: String, name: String, unit: String, step: Double, group: ExerciseGroup) -> LibraryExercise {
        let json = """
        {"key":"\(key)","name":"\(name)","unit":"\(unit)","step":\(step),"group":"\(group.rawValue)","cue":""}
        """
        return try! JSONDecoder().decode(LibraryExercise.self, from: Data(json.utf8))
    }
}
