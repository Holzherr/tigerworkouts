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

    /// A copy under a new id, so editing a catalogue workout never writes over the original. It
    /// keeps the program day and every step id, and remembers what it was copied from, so the
    /// sessions logged against the original stay its history (Up next, last time, pace, stalls).
    /// The port of `editedCopy` in model.ts.
    static func duplicate(_ r: Runsheet, creator: String?) -> Runsheet {
        var sheet = r
        sheet.id = id("w")
        sheet.title = r.title.isEmpty ? "Untitled" : "\(r.title) (mine)"
        sheet.creator = creator
        sheet.source = Source(title: r.title, author: creator, kind: "user")
        sheet.isPublic = nil
        sheet.copyOf = r.copyOf ?? r.key
        return sheet
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

    // MARK: - The editor's rows

    /// The editor is one flat list, so a single drag can move a step within a block, into another
    /// block or out to the top level, and a block moves by dragging its header.
    enum Row: Hashable, Identifiable {
        /// A block's header. Dragging it moves the whole block.
        case block(String)
        /// A step in a block, or on its own when `block` is nil.
        case step(String, block: String?)
        /// Add exercise / Add rest under a block. Never moves.
        case add(String)

        var id: String {
            switch self {
            case .block(let b): "h:\(b)"
            case .step(let s, _): "s:\(s)"
            case .add(let b): "a:\(b)"
            }
        }
    }

    static func rows(_ r: Runsheet) -> [Row] {
        r.items.flatMap { item -> [Row] in
            switch item {
            case .block(let b): [.block(b.id)] + b.steps.map { .step($0.id, block: b.id) } + [.add(b.id)]
            case .step(let s): [.step(s.id, block: nil)]
            case .ref: []
            }
        }
    }

    /// One drag in the editor, with `onMove` semantics: `destination` is a row index in the list as
    /// it was before the move. Items in `locked` (done or running in a live session) keep their place
    /// and contents; a move that would disturb them is refused.
    static func moveRow(_ r: Runsheet, from: Int, to destination: Int, locked: Set<String> = []) -> Runsheet {
        let rows = rows(r)
        guard rows.indices.contains(from) else { return r }
        let next: Runsheet
        switch rows[from] {
        case .add:
            return r
        case .block(let blockId):
            guard let at = r.items.firstIndex(where: { $0.id == blockId }) else { return r }
            // The block lands after every item whose first row sits above the drop point.
            var starts: [Int] = []
            var row = 0
            for item in r.items {
                starts.append(row)
                switch item {
                case .block(let b): row += b.steps.count + 2
                case .step: row += 1
                case .ref: break
                }
            }
            next = moveItems(r, from: [at], to: starts.filter { $0 < destination }.count)
        case .step(let stepId, _):
            guard let step = findStep(r, stepId) else { return r }
            var rest = rows
            rest.remove(at: from)
            let landing = max(0, min(rest.count, destination > from ? destination - 1 : destination))
            var sheet = removeStep(r, stepId: stepId)
            switch landing > 0 ? rest[landing - 1] : nil {
            case nil:
                sheet.items.insert(.step(step), at: 0)
            case .block(let b)?:
                sheet = updateBlock(sheet, id: b) { $0.steps.insert(step, at: 0) }
            case .step(let after, let b?)?:
                sheet = updateBlock(sheet, id: b) { block in
                    let i = block.steps.firstIndex { $0.id == after }.map { $0 + 1 } ?? block.steps.count
                    block.steps.insert(step, at: i)
                }
            case .step(let after, nil)?, .add(let after)?:
                // After a loose step, or below a block's last row: on its own at the top level.
                let i = sheet.items.firstIndex { $0.id == after }.map { $0 + 1 } ?? sheet.items.count
                sheet.items.insert(.step(step), at: i)
            }
            next = sheet
        }
        let fixed = r.items.prefix { locked.contains($0.id) }
        return Array(next.items.prefix(fixed.count)) == Array(fixed) ? next : r
    }

    /// A block dropped before item `destination`, an index in the list as it was (`items.count` is
    /// the end): the editor's block drag and Move up / Move down. Locked items keep their place.
    static func moveBlock(_ r: Runsheet, id: String, to destination: Int, locked: Set<String> = []) -> Runsheet {
        guard let at = r.items.firstIndex(where: { $0.id == id }) else { return r }
        let next = moveItems(r, from: [at], to: max(0, min(r.items.count, destination)))
        let fixed = r.items.prefix { locked.contains($0.id) }
        return Array(next.items.prefix(fixed.count)) == Array(fixed) ? next : r
    }

    static func findStep(_ r: Runsheet, _ stepId: String) -> Step? {
        for item in r.items {
            switch item {
            case .block(let b): if let s = b.steps.first(where: { $0.id == stepId }) { return s }
            case .step(let s): if s.id == stepId { return s }
            case .ref: break
            }
        }
        return nil
    }

    /// Every block and step id in order, so a copy's ids can be matched to the original's.
    static func ids(_ r: Runsheet) -> [String] {
        r.items.flatMap { item -> [String] in
            switch item {
            case .block(let b): [b.id] + b.steps.map(\.id)
            case .step(let s): [s.id]
            case .ref(let ref): [ref.id]
            }
        }
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

    // MARK: - Straight sets

    /// Change one set of a straight-set block. Every set is written out with what it showed first,
    /// so the edit changes that row and no other.
    static func editSet(_ r: Runsheet, block blockId: String, round: Int, reps: Double? = nil, load: Double? = nil, type: SetType? = nil) -> Runsheet {
        updateStraightSet(r, block: blockId) { b, step in
            var sets = (0..<max(b.repeatCount, step.sets?.count ?? 0)).map { i in
                let p = step.plannedSet(i)
                let t = step.plannedType(i)
                return SetPlan(reps: p.reps, load: p.load, type: t == .normal ? nil : t)
            }
            guard sets.indices.contains(round) else { return }
            if let reps { sets[round].reps = reps }
            if let load { sets[round].load = load }
            if let type { sets[round].type = type == .normal ? nil : type }
            step.sets = sets
        }
    }

    /// One more set, a copy of the last one; the block repeats once more.
    static func addSet(_ r: Runsheet, block blockId: String) -> Runsheet {
        updateStraightSet(r, block: blockId) { b, step in
            let last = step.plannedSet(b.repeatCount - 1)
            var sets = (0..<b.repeatCount).map { i in step.sets.flatMap { $0.indices.contains(i) ? $0[i] : nil } ?? SetPlan() }
            sets.append(SetPlan(reps: last.reps, load: last.load))
            step.sets = sets
            b.repeatCount += 1
        }
    }

    /// Consecutive sets alike in type, load and count, folded: 8 identical sets are one run of 8, a
    /// warm-up then 4 working sets are two runs. `setRuns` in the web's model.ts.
    struct SetRun: Hashable {
        var from: Int
        var count: Int
        var type: SetType
        var reps: Double
        var load: Double?
    }

    static func setRuns(_ block: Block) -> [SetRun] {
        guard let step = block.straightSetStep else { return [] }
        var runs: [SetRun] = []
        for round in 0..<block.repeatCount {
            let p = step.plannedSet(round)
            let type = step.plannedType(round)
            if let last = runs.last, last.type == type, last.reps == p.reps, last.load == p.load {
                runs[runs.count - 1].count += 1
            } else {
                runs.append(SetRun(from: round, count: 1, type: type, reps: p.reps, load: p.load))
            }
        }
        return runs
    }

    /// Change every set of a run at once, as a stepper on a folded row does.
    static func editRun(_ r: Runsheet, block blockId: String, run: SetRun, reps: Double? = nil, load: Double? = nil, type: SetType? = nil) -> Runsheet {
        (run.from..<(run.from + run.count)).reduce(r) { editSet($0, block: blockId, round: $1, reps: reps, load: load, type: type) }
    }

    /// Drop the last set. A block keeps at least one.
    static func removeSet(_ r: Runsheet, block blockId: String) -> Runsheet {
        updateStraightSet(r, block: blockId) { b, step in
            guard b.repeatCount > 1 else { return }
            b.repeatCount -= 1
            let kept = Array((step.sets ?? []).prefix(b.repeatCount))
            step.sets = kept.isEmpty ? nil : kept
        }
    }

    private static func updateStraightSet(_ r: Runsheet, block blockId: String, _ change: (inout Block, inout ExerciseStep) -> Void) -> Runsheet {
        updateBlock(r, id: blockId) { b in
            guard var step = b.straightSetStep else { return }
            change(&b, &step)
            b.steps = b.steps.map { $0.id == step.id ? .exercise(step) : $0 }
        }
    }

    // MARK: - Validation

    /// What is stopping this being saved, in the order a person would fix it.
    /// A workout of your own as Start keeps it: one still without a name gets the web's default, so
    /// the session it runs has a workout to go back to.
    static func namedForStart(_ r: Runsheet) -> Runsheet {
        guard r.title.trimmingCharacters(in: .whitespaces).isEmpty else { return r }
        var out = r
        out.title = "My workout"
        return out
    }

    static func problem(with r: Runsheet) -> String? {
        if r.title.trimmingCharacters(in: .whitespaces).isEmpty { return "Give it a name." }
        if r.exerciseSteps.isEmpty { return "Add at least one exercise." }
        if r.items.compactMap(\.asBlock).contains(where: { $0.steps.isEmpty }) { return "Every block needs a step in it." }
        return nil
    }
}
