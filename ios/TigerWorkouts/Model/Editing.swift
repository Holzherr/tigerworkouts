import Foundation

/// Pure edits on a runsheet. Every one takes a sheet and returns a new one, so the editor screen
/// holds a single value and the undo story is "don't save". Nothing here touches the network.
enum Edit {
    /// Ids only have to be unique inside one runsheet, and stable once written, because a session
    /// result keys its logged loads by step id.
    static func id(_ prefix: String) -> String {
        "\(prefix)-\(UUID().uuidString.prefix(8).lowercased())"
    }

    static func newRunsheet(creator: String?) -> Runsheet {
        var sheet = Runsheet(id: id("w"), title: "", creator: creator)
        sheet.source = Source(title: "", author: creator, kind: "user")
        sheet.items = [.block(newBlock(number: 1))]
        return sheet
    }

    static func newBlock(number: Int) -> Block {
        Block(id: id("b"), name: "Block \(number)", repeatCount: 8, mode: .rounds, steps: [])
    }

    /// A copy under a new id, so editing a catalogue workout never writes over the original.
    static func duplicate(_ r: Runsheet, creator: String?) -> Runsheet {
        var sheet = r
        sheet.id = id("w")
        sheet.title = r.title.isEmpty ? "Untitled" : "\(r.title) (mine)"
        sheet.creator = creator
        sheet.source = Source(title: r.title, author: creator, kind: "user")
        sheet.program = nil
        // Fresh step ids: two copies of a workout must not share the ids their history is keyed by.
        sheet.items = r.items.map { item in
            switch item {
            case .block(var b):
                b.id = id("b")
                b.steps = b.steps.map(reid)
                return .block(b)
            case .step(let s):
                return .step(reid(s))
            case .ref:
                return item
            }
        }
        return sheet
    }

    private static func reid(_ step: Step) -> Step {
        switch step {
        case .exercise(var e): e.id = id("e"); return .exercise(e)
        case .rest(var r): r.id = id("r"); return .rest(r)
        }
    }

    // MARK: - Adding

    static func addBlock(_ r: Runsheet) -> Runsheet {
        var sheet = r
        sheet.items.append(.block(newBlock(number: r.items.compactMap(\.asBlock).count + 1)))
        return sheet
    }

    /// Appends to a block, or to the top level when `blockId` is nil.
    static func addExercise(_ r: Runsheet, to blockId: String?, exercise: LibraryExercise) -> Runsheet {
        let step = ExerciseStep(
            id: id("e"),
            exercise: exercise.ref,
            target: exercise.unit.isEmpty ? nil : defaultTarget(exercise),
            forMode: .seconds,
            forValue: 30
        )
        return append(r, to: blockId, step: .exercise(step))
    }

    static func addRest(_ r: Runsheet, to blockId: String?, seconds: Double = 30) -> Runsheet {
        append(r, to: blockId, step: .rest(RestStep(id: id("r"), seconds: seconds)))
    }

    /// Where a machine sits when you have never set it: walking pace on a treadmill, four notches
    /// up on anything with plates.
    private static func defaultTarget(_ exercise: LibraryExercise) -> Double {
        exercise.unit == "kph" ? 10 : max(exercise.step, exercise.step * 4)
    }

    private static func append(_ r: Runsheet, to blockId: String?, step: Step) -> Runsheet {
        var sheet = r
        guard let blockId else {
            sheet.items.append(.step(step))
            return sheet
        }
        sheet.items = sheet.items.map { item in
            guard var b = item.asBlock, b.id == blockId else { return item }
            b.steps.append(step)
            return .block(b)
        }
        return sheet
    }

    // MARK: - Removing and reordering

    static func remove(_ r: Runsheet, itemId: String) -> Runsheet {
        var sheet = r
        sheet.items.removeAll { $0.id == itemId }
        return sheet
    }

    static func removeStep(_ r: Runsheet, stepId: String) -> Runsheet {
        var sheet = r
        sheet.items = sheet.items.compactMap { item in
            switch item {
            case .block(var b):
                b.steps.removeAll { $0.id == stepId }
                return .block(b)
            case .step(let s):
                return s.id == stepId ? nil : item
            case .ref:
                return item
            }
        }
        return sheet
    }

    static func moveItems(_ r: Runsheet, from source: IndexSet, to destination: Int) -> Runsheet {
        var sheet = r
        sheet.items = moved(sheet.items, from: source, to: destination)
        return sheet
    }

    static func moveSteps(_ r: Runsheet, in blockId: String, from source: IndexSet, to destination: Int) -> Runsheet {
        updateBlock(r, id: blockId) { $0.steps = moved($0.steps, from: source, to: destination) }
    }

    /// The same semantics as SwiftUI's `onMove`, written out here so the editing layer stays pure
    /// Foundation: `destination` is an index in the list as it was *before* anything moved.
    static func moved<T>(_ items: [T], from source: IndexSet, to destination: Int) -> [T] {
        let indices = source.sorted().filter { items.indices.contains($0) }
        guard !indices.isEmpty else { return items }
        let picked = indices.map { items[$0] }
        var result = items
        for i in indices.reversed() { result.remove(at: i) }
        let landing = destination - indices.filter { $0 < destination }.count
        result.insert(contentsOf: picked, at: max(0, min(result.count, landing)))
        return result
    }

    // MARK: - Changing

    static func updateBlock(_ r: Runsheet, id blockId: String, _ change: (inout Block) -> Void) -> Runsheet {
        var sheet = r
        sheet.items = sheet.items.map { item in
            guard var b = item.asBlock, b.id == blockId else { return item }
            change(&b)
            return .block(b)
        }
        return sheet
    }

    static func updateStep(_ r: Runsheet, id stepId: String, _ change: (inout ExerciseStep) -> Void) -> Runsheet {
        var sheet = r
        sheet.items = sheet.items.map { item in
            switch item {
            case .block(var b):
                b.steps = b.steps.map { step in
                    guard case .exercise(var e) = step, e.id == stepId else { return step }
                    change(&e)
                    return .exercise(e)
                }
                return .block(b)
            case .step(.exercise(var e)) where e.id == stepId:
                change(&e)
                return .step(.exercise(e))
            default:
                return item
            }
        }
        return sheet
    }

    static func updateRest(_ r: Runsheet, id stepId: String, seconds: Double) -> Runsheet {
        var sheet = r
        sheet.items = sheet.items.map { item in
            switch item {
            case .block(var b):
                b.steps = b.steps.map { step in
                    guard case .rest(var rest) = step, rest.id == stepId else { return step }
                    rest.seconds = seconds
                    return .rest(rest)
                }
                return .block(b)
            case .step(.rest(var rest)) where rest.id == stepId:
                rest.seconds = seconds
                return .step(.rest(rest))
            default:
                return item
            }
        }
        return sheet
    }

    // MARK: - Validation

    /// What is stopping this being saved, in the order a person would fix it.
    static func problem(with r: Runsheet) -> String? {
        if r.title.trimmingCharacters(in: .whitespaces).isEmpty { return "Give it a name." }
        if r.exerciseSteps.isEmpty { return "Add at least one exercise." }
        if r.items.compactMap(\.asBlock).contains(where: { $0.steps.isEmpty }) { return "Every block needs a step in it." }
        return nil
    }
}
