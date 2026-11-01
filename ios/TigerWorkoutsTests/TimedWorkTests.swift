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

    @Test("a rower on the clock set to log metres logs them only when entered")
    func rowerOnTheClock() {
        var step = ExerciseStep(id: "x", exercise: Self.rower, forMode: .minutes, forValue: 2)
        step.log = [.meters]
        let sheet = Runsheet(id: "t", title: "T", items: [.step(.exercise(step))])
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
        #expect(Runner.toResult(s, sheet, now: 150_000).splits == [RoundSplit(blockId: "b", at: [40, 95, 150], from: 5, starts: [5, 40, 95])])
    }
}

/// Ported from "what a step logs" in `src/features/timer/runner.test.ts`.
@Suite("what a step logs")
struct StepLogTests {
    static let row = ExerciseRef(key: "db_row", name: "Chest-supported rows", unit: "kg per arm", step: 2)

    static func one(_ ex: ExerciseRef, _ mode: ForMode, _ value: Double, target: Double? = nil, log: [StepLog] = []) -> Runsheet {
        var step = ExerciseStep(id: "x", exercise: ex, target: target, forMode: mode, forValue: value)
        step.log = log
        return Runsheet(id: "w", title: "W", items: [.step(.exercise(step))])
    }

    static func slot(_ r: Runsheet) -> Slot { Runner.tick(Runner.start(r, now: 0), now: 5000).slots[0] }

    @Test("a timed rower asks for nothing, and logs only its time")
    func timedRower() {
        let r = Self.one(TimedWorkTests.rower, .seconds, 30)
        #expect(Runner.amountField(Self.slot(r)) == nil)
        #expect(Self.slot(r).exercise?.countsReps == false)
        let s = Runner.tick(Runner.tick(Runner.start(r, now: 0), now: 5000), now: 35000)
        let set = Runner.toResult(s, r, now: 40000).steps[0].sets?[0]
        #expect(set?.seconds == 30 && set?.meters == nil && set?.reps == nil && set?.load == nil)
    }

    @Test("a timed rower set to log metres asks for metres")
    func timedRowerLogsMetres() {
        let r = Self.one(TimedWorkTests.rower, .seconds, 30, log: [.meters])
        var s = Runner.tick(Runner.start(r, now: 0), now: 5000)
        #expect(Runner.amountField(s.slots[0]) == .meters)
        s = Runner.setAmount(s, value: 142)
        s = Runner.tick(s, now: 35000)
        let set = Runner.toResult(s, r, now: 40000).steps[0].sets?[0]
        #expect(set?.meters == 142 && set?.seconds == 30)
    }

    @Test("a distance rower keeps its metres, the plan unless changed")
    func distanceRower() {
        let r = Self.one(TimedWorkTests.rower, .meters, 500)
        let s = Runner.tick(Runner.start(r, now: 0), now: 5000)
        #expect(Runner.amountField(s.slots[0]) == .meters)
        #expect(Runner.amountAt(s, s.slots[0]) == 500)
    }

    @Test("timed kettlebell swings ask for reps only when set to log them")
    func timedSwings() {
        #expect(Self.slot(Self.one(Fixtures.swing, .seconds, 30, target: 24)).exercise?.countsReps == false)
        let r = Self.one(Fixtures.swing, .seconds, 30, target: 24, log: [.reps])
        var s = Runner.tick(Runner.start(r, now: 0), now: 5000)
        #expect(s.slots[0].exercise?.countsReps == true)
        #expect(Runner.amountField(s.slots[0]) == nil)
        s = Runner.setReps(s, reps: 21)
        s = Runner.tick(s, now: 35000)
        let set = Runner.toResult(s, r, now: 40000).steps[0].sets?[0]
        #expect(set?.reps == 21 && set?.load == 24 && set?.seconds == 30)
    }

    @Test("chest-supported rows ask for reps and keep their load; a plank asks for nothing")
    func rowsAndPlank() {
        let rows = Self.slot(Self.one(Self.row, .reps, 10, target: 20))
        #expect(rows.exercise?.countsReps == true && Runner.amountField(rows) == nil)
        let plank = Self.slot(Self.one(TimedWorkTests.plankEx, .seconds, 45))
        #expect(plank.exercise?.countsReps == false && Runner.amountField(plank) == nil)
    }

    @Test("the editor offers what the exercise logs, less what the target records")
    func choices() {
        #expect(StepEditorView.logChoices(ExerciseStep(id: "a", exercise: TimedWorkTests.rower, forMode: .seconds, forValue: 30)) == [.meters, .calories])
        #expect(StepEditorView.logChoices(ExerciseStep(id: "a", exercise: TimedWorkTests.rower, forMode: .meters, forValue: 500)) == [.calories])
        #expect(StepEditorView.logChoices(ExerciseStep(id: "a", exercise: Self.row, forMode: .reps, forValue: 10)) == [])
        #expect(StepEditorView.logChoices(ExerciseStep(id: "a", exercise: Fixtures.swing, forMode: .seconds, forValue: 30)) == [.reps])
        #expect(StepEditorView.logChoices(ExerciseStep(id: "a", exercise: TimedWorkTests.plankEx, forMode: .seconds, forValue: 30)) == [])
    }

    @Test("a rower has no setting to dial, even with a target from the editor; a kettlebell has its load")
    func settings() {
        #expect(ExerciseStep(id: "a", exercise: TimedWorkTests.rower, target: 400, forMode: .seconds, forValue: 30).hasSetting == false)
        #expect(ExerciseStep(id: "a", exercise: Fixtures.swing, target: 24, forMode: .seconds, forValue: 30).hasSetting == true)
    }

    @Test("a timed rower set to log metres and calories asks for both and logs both")
    func timedRowerLogsBoth() {
        let r = Self.one(TimedWorkTests.rower, .seconds, 30, log: [.meters, .calories])
        var s = Runner.tick(Runner.start(r, now: 0), now: 5000)
        #expect(Runner.amountFields(s.slots[0]) == [.meters, .calories])
        s = Runner.setAmount(s, value: 142, field: .meters)
        s = Runner.setAmount(s, value: 9, field: .calories)
        s = Runner.tick(s, now: 35000)
        let set = Runner.toResult(s, r, now: 40000).steps[0].sets?[0]
        #expect(set?.meters == 142 && set?.calories == 9 && set?.seconds == 30)
    }

    @Test("a 500 m row set to log calories keeps the plan as its metres; an amount it does not record is refused")
    func distanceLogsCalories() {
        let r = Self.one(TimedWorkTests.rower, .meters, 500, log: [.calories])
        var s = Runner.tick(Runner.start(r, now: 0), now: 5000)
        #expect(Runner.amountFields(s.slots[0]) == [.meters, .calories])
        #expect(Runner.amountAt(s, s.slots[0]) == 500 && Runner.amountAt(s, s.slots[0], field: .calories) == nil)
        s = Runner.setAmount(s, value: 31, field: .calories)
        let set = Runner.toResult(Runner.advance(s, now: 105_000), r, now: 110_000).steps[0].sets?[0]
        #expect(set?.meters == 500 && set?.calories == 31)
        let timed = Runner.tick(Runner.start(Self.one(TimedWorkTests.rower, .seconds, 30, log: [.meters]), now: 0), now: 5000)
        #expect(Runner.setAmount(timed, value: 9, field: .calories).actuals == timed.actuals)
    }

    @Test("the set grid gives a timed row set to log metres its own column; the count stays the time")
    func grid() {
        var step = ExerciseStep(id: "rw", exercise: TimedWorkTests.rower, forMode: .seconds, forValue: 30)
        #expect(TimerView.setColumns(step, inclines: []) == ["SEC"])
        step.log = [.meters]
        #expect(TimerView.setColumns(step, inclines: []) == ["SEC", "M"])
        step.log = [.meters, .calories]
        #expect(TimerView.setColumns(step, inclines: []) == ["SEC", "M", "CAL"])
        step.log = [.meters]
        let before = SessionRunner.SetRow(slotId: "a", number: 1, reps: 30, amount: 140, amounts: [.meters: 140], plan: 30, done: false, current: true, tickable: true)
        #expect(TimerView.countShown(before, step) == 30 && TimerView.loggedShown(before, .meters) == 140)
        var swings = ExerciseStep(id: "sw", exercise: Fixtures.swing, target: 24, forMode: .seconds, forValue: 30)
        swings.log = [.reps]
        // Reps counted on a timed set never show in its seconds column.
        let counted = SessionRunner.SetRow(slotId: "b", number: 1, reps: 21, counted: 21, plan: 30, done: false, current: true, tickable: true)
        #expect(TimerView.countShown(counted, swings) == 30 && TimerView.loggedShown(counted, .reps) == 21)
    }

    @Test("Edit sets offers the columns the step logs")
    func editColumns() {
        var rower = ExerciseStep(id: "rw", exercise: TimedWorkTests.rower, forMode: .seconds, forValue: 30)
        #expect(LoggedSetsCard.fields([SetResult(reps: nil, load: nil, seconds: 30)], unit: "m", step: rower) == [.seconds])
        rower.log = [.meters]
        #expect(LoggedSetsCard.fields([SetResult(reps: nil, load: nil, seconds: 30)], unit: "m", step: rower) == [.meters, .seconds])
        #expect(LoggedSetsCard.fields([SetResult(reps: nil, load: nil, seconds: 30)], unit: "m") == [.meters, .seconds])
    }

    @Test("log survives a save and an unknown one reads as nothing")
    func codable() throws {
        var step = ExerciseStep(id: "a", exercise: TimedWorkTests.rower, forMode: .seconds, forValue: 30)
        step.log = [.meters]
        let data = try JSONEncoder().encode(step)
        #expect(String(data: data, encoding: .utf8)?.contains("\"log\":\"meters\"") == true)
        #expect(try JSONDecoder().decode(ExerciseStep.self, from: data).log == [.meters])
        let odd = #"{"id":"a","exercise":{"key":"k","name":"K","unit":"","step":1},"forMode":"seconds","forValue":30,"log":"watts"}"#
        #expect(try JSONDecoder().decode(ExerciseStep.self, from: Data(odd.utf8)).log == [])
        // Several are a list, read back in order; junk in a list drops out.
        step.log = [.meters, .calories]
        let both = try JSONEncoder().encode(step)
        #expect(String(data: both, encoding: .utf8)?.contains(#""log":["meters","calories"]"#) == true)
        #expect(try JSONDecoder().decode(ExerciseStep.self, from: both).log == [.meters, .calories])
        let mixed = #"{"id":"a","exercise":{"key":"k","name":"K","unit":"","step":1},"forMode":"seconds","forValue":30,"log":["calories","watts","meters"]}"#
        #expect(try JSONDecoder().decode(ExerciseStep.self, from: Data(mixed.utf8)).log == [.meters, .calories])
        step.log = []
        #expect(String(data: try JSONEncoder().encode(step), encoding: .utf8)?.contains("log") == false)
    }
}

/// Ported from "round times only when they say something" in `src/features/results/rounds.test.ts`.
@Suite("round times only when they say something")
struct RoundRulesTests {
    static func ex(_ id: String, _ e: ExerciseRef, _ mode: ForMode, _ value: Double, target: Double? = nil, log: [StepLog] = []) -> Step {
        var s = ExerciseStep(id: id, exercise: e, target: target, forMode: mode, forValue: value)
        s.log = log
        return .exercise(s)
    }

    static func sheet() -> Runsheet {
        Runsheet(id: "w", title: "W", items: [
            .block(Block(id: "rows", name: "rows", repeatCount: 3, steps: [ex("cs", StepLogTests.row, .reps, 10, target: 20), ex("sw", Fixtures.swing, .reps, 15, target: 24)])),
            .block(Block(id: "sprints", name: "sprints", repeatCount: 3, steps: [ex("rw", TimedWorkTests.rower, .seconds, 30, log: [.meters]), Fixtures.rest("r", 30)])),
            .block(Block(id: "abs", name: "abs", repeatCount: 3, steps: [ex("pl", TimedWorkTests.plankEx, .seconds, 30), ex("sw2", Fixtures.swing, .seconds, 30, target: 16)])),
        ])
    }

    static func session(_ splits: [RoundSplit], steps: [StepResult] = []) -> SessionResult {
        var r = SessionResult(runsheetId: "w", title: nil, startedAt: "2026-10-18", steps: steps)
        r.splits = splits
        return r
    }

    @Test("a block is fixed-time when every exercise in it runs on the clock")
    func fixed() {
        let blocks = Self.sheet().items.compactMap(\.asBlock)
        #expect(blocks.map(Rounds.fixedTime) == [false, true, true])
        var abs = blocks[2]
        abs.mode = .emom
        #expect(Rounds.fixedTime(abs))
        abs.mode = .fortime
        #expect(!Rounds.fixedTime(abs))
        abs.mode = .amrap
        #expect(!Rounds.fixedTime(abs))
    }

    @Test("an all-timed workout has no round times")
    func allTimed() {
        let r = Self.session([RoundSplit(blockId: "abs", at: [121, 241, 362], starts: [0, 121, 241])])
        #expect(Rounds.rows(r, runsheet: Self.sheet()).isEmpty)
        let row = Rounds.rows(r)[0]
        #expect(row.times == [121, 120, 121] && row.fastest == nil && row.slowest == nil)
        #expect(Rounds.prs(r, all: [Self.session([RoundSplit(blockId: "abs", at: [130], starts: [0])]), r], runsheet: Self.sheet()).isEmpty)
    }

    @Test("a rep-based for-time workout badges rounds really apart")
    func repBased() {
        let row = Rounds.rows(Self.session([RoundSplit(blockId: "rows", at: [95, 205, 290], starts: [0, 100, 210])]), runsheet: Self.sheet())[0]
        #expect(row.times == [95, 105, 80] && row.fastest == 2 && row.slowest == 1)
        #expect(Rounds.rows(Self.session([RoundSplit(blockId: "rows", at: [80, 164], starts: [0, 80])]))[0].fastest == nil)
        #expect(Rounds.rows(Self.session([RoundSplit(blockId: "rows", at: [200, 406], starts: [0, 200])]))[0].fastest == nil)
    }

    @Test("a mixed workout: round times for the rep block, metres per round for the sprints, nothing for abs")
    func mixed() {
        let sets = [142.0, 138, 145].map { SetResult(reps: nil, load: nil, seconds: 30, meters: $0) }
        let r = Self.session(
            [RoundSplit(blockId: "rows", at: [95, 205, 290], starts: [0, 100, 210]), RoundSplit(blockId: "abs", at: [600, 720, 841], starts: [480, 600, 720])],
            steps: [StepResult(stepId: "rw", exerciseKey: "cardio_rower", sets: sets)]
        )
        #expect(Rounds.rows(r, runsheet: Self.sheet()).map(\.blockId) == ["rows"])
        #expect(Rounds.amountRows(r, runsheet: Self.sheet()) == [Rounds.AmountRow(blockId: "sprints", stepId: "rw", exerciseKey: "cardio_rower", field: .meters, values: [142, 138, 145], best: 2)])
    }

    @Test("logged amounts: any difference is a best, none when all match or under two rounds")
    func amounts() {
        func steps(_ m: [Double?]) -> [StepResult] { [StepResult(stepId: "rw", exerciseKey: "cardio_rower", sets: m.map { SetResult(reps: nil, load: nil, seconds: 30, meters: $0) })] }
        #expect(Rounds.amountRows(Self.session([], steps: steps([140, 141])), runsheet: Self.sheet())[0].best == 1)
        #expect(Rounds.amountRows(Self.session([], steps: steps([140, 140])), runsheet: Self.sheet())[0].best == nil)
        #expect(Rounds.amountRows(Self.session([], steps: steps([140, nil])), runsheet: Self.sheet()).isEmpty)
        #expect(Rounds.amountRows(Self.session([], steps: steps([140, 141])), runsheet: nil).isEmpty)
        #expect(Rounds.amount(142, .meters) == "142 m" && Rounds.amount(1, .reps) == "1 rep")
    }
}
