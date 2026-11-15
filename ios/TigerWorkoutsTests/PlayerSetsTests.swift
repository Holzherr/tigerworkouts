import Foundation
import Testing
@testable import TigerWorkouts

/// Priyanka's session of 14 Nov 2026: last time is the sets as they were logged, the sets start on
/// them (or on the target the header names), every set is a row, and a set can be added.
@Suite("player sets")
struct PlayerSetsTests {
    static let thrust = ExerciseRef(key: "bb_hip_thrust", name: "Hip thrust", unit: "kg", step: 2.5)

    /// Three sets of hip thrusts, 8 reps at 80 kg as written, 90 s between sets, then a press.
    static func sheet(sets: Int = 3) -> Runsheet {
        Runsheet(id: "w-hip", title: "Hip thrust focus week 1", items: [
            .block(Block(id: "b1", name: "Hip thrust", repeatCount: sets,
                         steps: [Fixtures.work("ht", thrust, target: 80, forMode: .reps, forValue: 8)], restBetweenSec: 90)),
            .block(Block(id: "b2", name: "Press", repeatCount: 3,
                         steps: [Fixtures.work("pr", Fixtures.press, target: 20, forMode: .reps, forValue: 8)], restBetweenSec: 60)),
        ])
    }

    static func session(_ day: Int, _ steps: [StepResult]) -> SessionResult {
        SessionResult(runsheetId: "w-hip", title: "Hip thrust focus week 1", startedAt: String(format: "2026-11-%02dT10:00:00Z", day), steps: steps, id: "s-\(day)")
    }

    static func row(_ id: String, _ key: String, _ sets: [SetResult]) -> StepResult {
        var r = StepResult(stepId: id, exerciseKey: key, target: sets.last?.load, incline: nil, reps: sets.compactMap(\.reps), success: nil)
        r.sets = sets
        return r
    }

    /// 100 × 8, 110 × 4, 110 × 4 on the hip thrust; the press at 25 × 12 on every set.
    static func history(press: [SetResult] = Array(repeating: SetResult(reps: 12, load: 25), count: 3)) -> [SessionResult] {
        [session(10, [
            row("ht", thrust.key, [SetResult(reps: 8, load: 100), SetResult(reps: 4, load: 110), SetResult(reps: 4, load: 110)]),
            row("pr", Fixtures.press.key, press),
        ])]
    }

    @MainActor
    static func runner(_ sheet: Runsheet, _ history: [SessionResult]) -> SessionRunner {
        let targets = Targets.sets(sheet, results: history, intent: .maintain, kit: nil)
        return SessionRunner(runsheet: Settings.withLastUsed(sheet, results: history, targets: targets), history: history)
    }

    // MARK: - Last time, set by set

    @Test("last time is every set in order, never the heaviest alone")
    func compact() throws {
        let step = try #require(Self.sheet().exerciseSteps.first)
        let odd = [Self.session(12, [Self.row("ht", Self.thrust.key, [SetResult(reps: 8, load: 80, type: .warmup), SetResult(reps: 8, load: 100), SetResult(reps: 1, load: 115)])])]
        #expect(LastTime.summary(odd, for: step, in: Self.sheet()) == "last time W 80 × 8, 100 × 8, 115 × 1")
        #expect(LastTime.summary(Self.history(), for: step, in: Self.sheet()) == "last time 100 × 8, 110 × 4, 110 × 4")
        #expect(LastTime.set(Self.history(), for: step, round: 1, in: Self.sheet()) == SetResult(reps: 4, load: 110))
        #expect(LastTime.set(Self.history(), for: step, round: 7, in: Self.sheet()) == SetResult(reps: 4, load: 110))
        #expect(LastTime.compact([], unit: "kg") == nil)
    }

    // MARK: - Seeding

    @Test("a pyramid comes back set by set: loads on the sheet, reps on the sets, no target over it")
    @MainActor
    func pyramidCarriesOver() throws {
        let seeded = Settings.withLastUsed(Self.sheet(), results: Self.history())
        let thrust = try #require(seeded.exerciseSteps.first { $0.id == "ht" })
        #expect(thrust.sets?.map(\.load) == [100, 110, 110])
        let r = Self.runner(Self.sheet(), Self.history())
        defer { SessionRunner.clearSaved() }
        let rows = r.state.slots.indices.filter { r.state.slots[$0].step.id == "ht" }
        #expect(rows.map { Runner.effectiveTarget(r.state, $0) } == [100, 110, 110])
        #expect(rows.map { r.state.actuals[r.state.slots[$0].id]?.reps } == [8, 4, 4])
        r.tick(at: r.state.startedAt + Runner.leadSec * 1000 + 1)
        r.startBlock()
        #expect(r.goal == nil) // a target for straight sets would not be what the sets say
    }

    @Test("the press starts on the header's target: 27.5 × 8, as the Target line says")
    @MainActor
    func targetFills() throws {
        let r = Self.runner(Self.sheet(), Self.history())
        defer { SessionRunner.clearSaved() }
        let press = r.state.slots.indices.filter { r.state.slots[$0].step.id == "pr" }
        #expect(press.map { Runner.effectiveTarget(r.state, $0) } == [27.5, 27.5, 27.5])
        #expect(press.map { r.state.actuals[r.state.slots[$0].id]?.reps } == [8, 8, 8])
        #expect(Targets.timer(r.today, blockId: "b2", stepId: "pr", round: 0, runsheet: r.runsheet) == "Target 27.5 × 8")
    }

    @Test("a lighter last set no longer becomes every set's load (the 12.5 kg)")
    @MainActor
    func backOffSetStaysOnItsSet() throws {
        let history = Self.history(press: [SetResult(reps: 12, load: 25), SetResult(reps: 12, load: 25), SetResult(reps: 12, load: 12.5)])
        let r = Self.runner(Self.sheet(), history)
        defer { SessionRunner.clearSaved() }
        let press = r.state.slots.indices.filter { r.state.slots[$0].step.id == "pr" }
        #expect(press.map { Runner.effectiveTarget(r.state, $0) } == [25, 25, 12.5])
        #expect(Targets.timer(r.today, blockId: "b2", stepId: "pr", round: 0, runsheet: r.runsheet) == nil)
    }

    @Test("a session that only ran the seeded sets has no version")
    func seededSetsAreNotAVersion() {
        let base = Self.sheet()
        let auto = Settings.withLastUsed(base, results: Self.history())
        #expect(Versions.of(run: auto, auto: auto, base: base) == nil)
    }

    // MARK: - Every set a row

    @Test("every set still to do is its own row with its own weight and reps")
    @MainActor
    func everySetARow() {
        let r = Self.runner(Self.sheet(), Self.history())
        defer { SessionRunner.clearSaved() }
        r.tick(at: r.state.startedAt + Runner.leadSec * 1000 + 1)
        r.startBlock()
        #expect(r.setRows.map(\.load) == [100, 110, 110])
        #expect(r.setRows.map(\.reps) == [8, 4, 4])
        r.setSetLoad(r.setRows[2].slotId, 112.5)
        r.setSetReps(r.setRows[2].slotId, 3)
        #expect(r.setRows.map(\.load) == [100, 110, 112.5])
        #expect(r.setRows[2].reps == 3)
    }

    // MARK: - Add set

    @Test("+ Add set copies the last set and the session keeps it")
    @MainActor
    func addSet() throws {
        let r = Self.runner(Self.sheet(), Self.history())
        defer { SessionRunner.clearSaved() }
        r.tick(at: r.state.startedAt + Runner.leadSec * 1000 + 1)
        r.startBlock()
        #expect(r.addableBlock?.id == "b1")
        r.addSet(blockId: "b1")
        #expect(r.setRows.count == 4)
        #expect(r.setRows[3].load == 110)
        #expect(r.setRows[3].reps == 4)
        #expect(r.addedSets == ["b1": 1])
        #expect(r.runsheet.items.first?.asBlock?.repeatCount == 4)
        for row in r.setRows { r.tickSet(row.slotId) }
        let sets = try #require(r.result().steps.first { $0.stepId == "ht" }?.sets)
        #expect(sets.count == 4)
    }

    @Test("after the last set, a set added at the next block's gate goes back to it")
    @MainActor
    func addSetAtTheGate() {
        let r = Self.runner(Self.sheet(), Self.history())
        defer { SessionRunner.clearSaved() }
        r.tick(at: r.state.startedAt + Runner.leadSec * 1000 + 1)
        r.startBlock()
        for row in r.setRows { r.tickSet(row.slotId) }
        #expect(r.state.phase == .ready)
        #expect(r.slot?.blockId == "b2")
        #expect(r.addableBlock?.id == "b1")
        r.addSet(blockId: "b1")
        #expect(r.state.phase == .running)
        #expect(r.slot?.blockId == "b1")
        #expect(r.setRows.count == 4)
        #expect(r.setRows.last?.current == true)
    }

    @Test("Update workout puts the added set on the workout at what was logged")
    func updateWorkout() {
        var result = Self.session(15, [Self.row("ht", Self.thrust.key, [
            SetResult(reps: 8, load: 100), SetResult(reps: 4, load: 110), SetResult(reps: 4, load: 110), SetResult(reps: 3, load: 115),
        ])])
        result.runsheetId = "w-hip"
        let next = SessionRunner.withAddedSets(Self.sheet(), added: ["b1": 1], result: result)
        let block = next.items.first?.asBlock
        #expect(block?.repeatCount == 4)
        let step = block?.straightSetStep
        #expect(step?.plannedSet(3).load == 115)
        #expect(step?.plannedSet(3).reps == 3)
        #expect(step?.plannedSet(0).load == 80) // the sets written before stay as written
    }

    // MARK: - Up next

    @Test("what is left, block by block, from the set in hand")
    @MainActor
    func remaining() {
        let r = Self.runner(Self.sheet(), Self.history())
        defer { SessionRunner.clearSaved() }
        r.tick(at: r.state.startedAt + Runner.leadSec * 1000 + 1)
        r.startBlock()
        r.tickSet(r.setRows[0].slotId)
        let parts = SessionRunner.remaining(r.state, runsheet: r.runsheet)
        #expect(parts.map(\.name) == ["Hip thrust", "Press"])
        #expect(parts[0].sets.map(\.detail) == ["Set 2 · 110 kg × 4", "Set 3 · 110 kg × 4"])
        #expect(parts[1].sets.count == 3)
        #expect(r.upNext?.name == "Incline chest press")
    }

    // MARK: - Typed numbers and steps

    @Test("a typed number takes a point or a comma")
    func parse() {
        #expect(NumberEntry.parse("27.5") == 27.5)
        #expect(NumberEntry.parse(" 27,5 ") == 27.5)
        #expect(NumberEntry.parse("20") == 20)
        #expect(NumberEntry.parse("abc") == nil)
        #expect(NumberEntry.parse("-5") == nil)
        #expect(StepSizes.text(1.25) == "1.25")
        #expect(StepSizes.text(2.5) == "2.5")
    }

    @Test("a step picked for an exercise is what − and + move by")
    func stepSizes() throws {
        let defaults = try #require(UserDefaults(suiteName: "step-sizes-test"))
        defaults.removePersistentDomain(forName: "step-sizes-test")
        #expect(StepSizes.load(Self.thrust, defaults: defaults) == 2.5)
        StepSizes.set(5, for: Self.thrust.key, .load, defaults: defaults)
        #expect(StepSizes.load(Self.thrust, defaults: defaults) == 5)
        let track = ExerciseRef(key: "run_track", name: "Track", unit: "", step: 1)
        StepSizes.set(20, for: track.key, .meters, defaults: defaults)
        #expect(StepSizes.meters(track, fallback: 10, defaults: defaults) == 20)
        #expect(StepSizes.load(track, defaults: defaults) == 1)
        StepSizes.set(nil, for: Self.thrust.key, .load, defaults: defaults)
        #expect(StepSizes.load(Self.thrust, defaults: defaults) == 2.5)
    }
}
