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
        #expect(LastTime.lastSessionLabel(odd, for: step, in: Self.sheet()) == "last time 80 × 8, 100 × 8, 115 × 1")
        #expect(LastTime.lastSessionLabel(Self.history(), for: step, in: Self.sheet()) == "last time 100 × 8, 110 × 4 (×2)")
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

    @Test("Finish and save asks only while work is still to come, and says how much")
    @MainActor
    func finishAsks() {
        let r = Self.runner(Self.sheet(), Self.history())
        defer { SessionRunner.clearSaved() }
        #expect(r.leftLine == "2 blocks left.")
        r.tick(at: r.state.startedAt + Runner.leadSec * 1000 + 1)
        r.startBlock()
        for row in r.setRows { r.tickSet(row.slotId) }
        // The press: its gate, then two of three sets.
        #expect(r.leftLine == "3 sets left.")
        if r.state.phase == .ready { r.startBlock() }
        r.tickSet(r.setRows[0].slotId)
        r.tickSet(r.setRows[1].slotId)
        #expect(r.leftLine == "1 set left.")
        // Every set ticked while a rest still runs: nothing to ask about.
        var s = r.state
        for sl in s.slots where sl.kind == .work { s.actuals[sl.id, default: Actual()].doneAt = 1 }
        #expect(SessionRunner.leftLine(s, runsheet: r.runsheet) == nil)
        #expect(SessionRunner.leftLine(Runner.finish(r.state, now: r.state.startedAt + 60_000), runsheet: r.runsheet) == nil)
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

    @Test("Priyanka's seeded week one: the hip thrust starts on 100, 110, 110, 115, not 115 on every set")
    @MainActor
    func seededWeekOne() throws {
        let store = Store()
        store.seedWeekOneIfAsked(["-seedWeekOne"])
        let sheet = try #require(store.workout(id: "seed-week1"))
        let thrust = try #require(store.seeded(sheet).exerciseSteps.first { $0.id == "seed-w1-thrust" })
        #expect(thrust.sets?.map(\.load) == [100, 110, 110, 115])
        #expect(thrust.target == 100)
        #expect(LastTime.lastSessionLabel(store.results, for: thrust, in: sheet) == "last time 100 × 8, 110 × 4 (×2), 115 × 1")
    }
}

/// Review D4 (Nick, 15 Nov 2026, "Written loads win"): a load written on a step beats last
/// session's when the step was edited after its last session, and on any step this workout's own
/// history has no session for. Last time still seeds a step not touched, and stays the hint.
@Suite("written loads win")
struct WrittenLoadsTests {
    typealias P = PlayerSetsTests

    /// Week 1 done as 3 × 100 on the hip thrust.
    static func straight() -> [SessionResult] {
        [P.session(10, [P.row("ht", P.thrust.key, Array(repeating: SetResult(reps: 8, load: 100), count: 3))])]
    }

    static func at(_ day: Int) -> Date { ISO8601.date(String(format: "2026-11-%02dT10:00:00Z", day))! }

    static func seeded(_ sheet: Runsheet, _ history: [SessionResult], _ written: Written.Edits = [:], suggest: SuggestPrefs = SuggestPrefs()) -> Runsheet {
        let targets = Targets.sets(sheet, results: history, suggest: suggest, written: written)
        return ProgressionRules.progressed(Settings.withLastUsed(sheet, results: history, targets: targets, written: written), results: history, kit: nil, written: written)
    }

    @Test("week 1 duplicated into week 2 and the hip thrust raised to 105: the page and the player show 105")
    @MainActor
    func duplicatedWeek() throws {
        var week1 = P.sheet()
        week1 = Edit.updateStep(week1, id: "ht") { $0.target = 100 }
        var week2 = Edit.duplicateForNextWeek(week1, creator: nil)
        let step = try #require(week2.exerciseSteps.first { $0.exercise.key == P.thrust.key })
        week2 = Edit.updateStep(week2, id: step.id) { $0.target = 105 }
        // No session of week 2 yet: what is written runs, whatever week 1 was done at.
        let page = Self.seeded(week2, Self.straight())
        #expect(page.exerciseSteps.first { $0.id == step.id }?.target == 105)
        #expect(page.exerciseSteps.first { $0.id == step.id }?.sets == nil)
        #expect(Targets.sets(week2, results: Self.straight(), written: [:]).isEmpty, "no target from week 1 over a written load")
        let runner = SessionRunner(runsheet: page, history: Self.straight())
        #expect(runner.target == 105)
        // Last time is still the hint.
        #expect(LastTime.lastSessionLabel(Self.straight(), for: step, in: week2) == "last time 100 × 8 (×3)")
    }

    @Test("a coach's 60 / 70 / 80 pyramid runs as written after 3 × 100 of the exercise in another workout")
    @MainActor
    func coachPyramid() throws {
        var coach = Runsheet(id: "w-coach", title: "From your coach", creator: "AI Coach", items: [
            .block(Block(id: "cb", name: "Hip thrust", repeatCount: 3,
                         steps: [Fixtures.work("c-ht", P.thrust, target: 60, forMode: .reps, forValue: 8)], restBetweenSec: 90)),
        ])
        coach = Edit.updateStep(coach, id: "c-ht") { $0.sets = [60, 70, 80].map { SetPlan(reps: 8, load: $0) } }
        let page = Self.seeded(coach, Self.straight())
        #expect(page.exerciseSteps.first?.sets?.map(\.load) == [60, 70, 80])
        let runner = SessionRunner(runsheet: page, history: Self.straight())
        #expect(runner.target == 60)
    }

    @Test("a step not touched since its last session starts on last time's")
    func untouchedTakesLastTime() throws {
        // Written 80, done at 100: no edit since.
        #expect(Self.seeded(P.sheet(), Self.straight(), suggest: SuggestPrefs(off: true)).exerciseSteps.first?.target == 100)
        // An edit from before the session does not count.
        let before = Written.marked([:], workout: "w-hip", steps: ["ht"], at: Self.at(9))
        #expect(Self.seeded(P.sheet(), Self.straight(), before, suggest: SuggestPrefs(off: true)).exerciseSteps.first?.target == 100)
        #expect(!Targets.sets(P.sheet(), results: Self.straight(), written: before).isEmpty)
    }

    @Test("a step edited after its last session runs as written, until it is done again")
    func editedAfter() throws {
        let sheet = Edit.updateStep(P.sheet(), id: "ht") { $0.target = 105 }
        let edits = Written.marked([:], workout: "w-hip", steps: Written.changed(from: P.sheet(), to: sheet), at: Self.at(11))
        #expect(edits["w-hip"]?.keys.sorted() == ["ht"])
        let page = Self.seeded(sheet, Self.straight(), edits)
        #expect(page.exerciseSteps.first?.target == 105)
        #expect(page.exerciseSteps.first?.sets == nil)
        #expect(Targets.sets(sheet, results: Self.straight(), written: edits).allSatisfy { $0.stepId != "ht" })
        // Done again at 107.5 on the 12th: last time seeds once more.
        let again = Self.straight() + [P.session(12, [P.row("ht", P.thrust.key, Array(repeating: SetResult(reps: 8, load: 107.5), count: 3))])]
        #expect(Self.seeded(sheet, again, edits, suggest: SuggestPrefs(off: true)).exerciseSteps.first?.target == 107.5)
    }

    @Test("a step with no load written still takes last time's incline, and a programme's lift still carries by its rule")
    func leftAlone() throws {
        let walk = ExerciseRef(key: "treadmill_walk", name: "Treadmill walk", unit: "kph", step: 0.5)
        let bare = Runsheet(id: "w-walk", title: "Walk", items: [.step(Fixtures.work("wk", walk))])
        let elsewhere = [SessionResult(runsheetId: "other", title: nil, startedAt: "2026-11-10T10:00:00Z",
                                       steps: [StepResult(stepId: "z", exerciseKey: walk.key, target: 6, incline: 4, reps: nil, success: true)])]
        #expect(Self.seeded(bare, elsewhere).exerciseSteps.first?.incline == 4)
        // Day B of a programme: the squat done on day A, with Made it, goes up by the rule.
        let squat = ExerciseRef(key: "bb_squat", name: "Squat", unit: "kg", step: 2.5)
        var dayB = Runsheet(id: "day-b", title: "Day B", items: [.block(Block(id: "b", name: "Squat", repeatCount: 5, steps: [Fixtures.work("sq", squat, target: 20, forMode: .reps, forValue: 5)]))])
        dayB.progression = Progression(onSuccessKg: 2.5)
        let dayA = [SessionResult(runsheetId: "day-a", title: nil, startedAt: "2026-11-10T10:00:00Z",
                                  steps: [StepResult(stepId: "a-sq", exerciseKey: squat.key, target: 60, incline: nil, reps: [5, 5, 5, 5, 5], success: true)])]
        #expect(Self.seeded(dayB, dayA).exerciseSteps.first?.target == 62.5)
        // Written after: the written load runs.
        let edits = Written.marked([:], workout: "day-b", steps: ["sq"], at: Self.at(11))
        #expect(Self.seeded(dayB, dayA, edits).exerciseSteps.first?.target == 20)
    }

    @Test("only a changed load marks a step; the marks are kept by workout")
    func changed() {
        let base = P.sheet()
        #expect(Written.changed(from: base, to: Edit.updateStep(base, id: "ht") { $0.forValue = 10 }).isEmpty)
        #expect(Written.changed(from: base, to: Edit.updateStep(base, id: "pr") { $0.incline = 2 }) == ["pr"])
        #expect(Written.changed(from: base, to: Edit.updateStep(base, id: "ht") { $0.sets = [SetPlan(reps: 8, load: 90)] }) == ["ht"])
        let defaults = UserDefaults(suiteName: "written-\(UUID().uuidString)")!
        Written.store(Written.marked(Written.current(defaults), workout: "w-hip", steps: ["ht"], at: Self.at(11)), defaults)
        #expect(Written.current(defaults)["w-hip"]?["ht"].flatMap(ISO8601.date) == Self.at(11))
        #expect(Written.current(defaults)["other"] == nil)
    }
}
