import Foundation
import Testing
@testable import TigerWorkouts

/// Ported from 'per-set prescription', 'the set grid' and 'cap clock' in `runner.test.ts`, and
/// 'straight sets' in `model.test.ts`.
@Suite("per-set prescription")
struct SetPlanTests {
    /// Bench 60 / 70 / 80 kg for 10 / 8 / 6, 60 s rest between sets; the step itself says 50 × 10.
    static func pyramid(_ sets: [SetPlan]? = nil) -> Runsheet {
        var step = ExerciseStep(id: "pr", exercise: Fixtures.press, target: 50, forMode: .reps, forValue: 10)
        step.sets = sets
        return Runsheet(id: "py", title: "Pyramid", items: [.block(Block(
            id: "b", name: "Bench", repeatCount: 3, steps: [.exercise(step), Fixtures.rest("r", 60)]
        ))])
    }

    static let full = [SetPlan(reps: 10, load: 60), SetPlan(reps: 8, load: 70), SetPlan(reps: 6, load: 80)]

    static func work(_ s: RunState) -> [Int] { s.slots.indices.filter { s.slots[$0].kind == .work } }
    static func reps(_ s: RunState) -> [Double] { work(s).map { s.slots[$0].exercise?.forValue ?? 0 } }
    static func loads(_ s: RunState) -> [Double?] { work(s).map { Runner.effectiveTarget(s, $0) } }

    @Test("each round runs its own reps and load")
    func ownValues() {
        let s = Runner.start(Self.pyramid(Self.full), now: 0)
        #expect(Self.reps(s) == [10, 8, 6])
        #expect(Self.loads(s) == [60, 70, 80])
    }

    @Test("without sets, every round is the step as before")
    func oldData() {
        let s = Runner.start(Self.pyramid(), now: 0)
        #expect(Self.reps(s) == [10, 10, 10])
        #expect(Self.loads(s) == [50, 50, 50])
        #expect(s.slots.allSatisfy { $0.plan == nil })
    }

    @Test("a set with no values of its own carries the one before it")
    func carries() {
        let s = Runner.start(Self.pyramid([SetPlan(load: 60), SetPlan(reps: 8)]), now: 0)
        #expect(Self.reps(s) == [10, 8, 8])
        #expect(Self.loads(s) == [60, 60, 60])
    }

    @Test("an adjustment carries forward until a round that prescribes its own load")
    func adjustmentCarries() {
        var s = Runner.tick(Runner.start(Self.pyramid([SetPlan(load: 60), SetPlan(), SetPlan(load: 80)]), now: 0), now: 5_000)
        s = Runner.adjust(s, now: 6_000, target: 62.5)
        #expect(Self.loads(s) == [62.5, 62.5, 80])
    }

    @Test("an adjustment never overrides a later prescribed set")
    func prescribedWins() {
        var s = Runner.tick(Runner.start(Self.pyramid(Self.full), now: 0), now: 5_000)
        s = Runner.adjust(s, now: 6_000, target: 65)
        #expect(Self.loads(s) == [65, 70, 80])
    }

    @Test("logs each set at its prescribed load and reps")
    func logs() {
        var s = Runner.tick(Runner.start(Self.pyramid(Self.full), now: 0), now: 5_000)
        var t: Double = 10_000
        while s.phase != .done {
            s = Runner.advance(s, now: t)
            t += 10_000
        }
        let sets = Runner.toResult(s, Self.pyramid(Self.full), now: 100_000).steps[0].sets
        #expect(sets == [SetResult(reps: 10, load: 60, at: 10), SetResult(reps: 8, load: 70, at: 30), SetResult(reps: 6, load: 80, at: 50)])
    }

    @Test("a swap drops the planned loads for the swap target, keeping the reps")
    func swap() {
        var s = Runner.tick(Runner.start(Self.pyramid(Self.full), now: 0), now: 5_000)
        s = Runner.swap(s, now: 6_000, stepId: "pr", to: Fixtures.pushup, target: 0)
        #expect(Self.loads(s) == [0, 0, 0])
        #expect(Self.reps(s) == [10, 8, 6])
    }

    @Test("sets round-trip through JSON, and a step without them writes none")
    func codable() throws {
        let data = try JSONEncoder().encode(Self.pyramid([SetPlan(load: 60), SetPlan()]))
        let json = String(decoding: data, as: UTF8.self)
        #expect(json.contains("\"sets\":[{\"load\":60},{}]"))
        let back = try JSONDecoder().decode(Runsheet.self, from: data)
        #expect(back.items[0].asBlock?.straightSetStep?.sets == [SetPlan(load: 60), SetPlan()])
        let plain = String(decoding: try JSONEncoder().encode(Self.pyramid()), as: UTF8.self)
        #expect(!plain.contains("\"sets\""))
    }
}

@Suite("the set grid")
struct SetGridTests {
    static func sheet() -> Runsheet {
        Runsheet(id: "g", title: "Grid", items: [.block(Block(
            id: "b", name: "Bench", repeatCount: 3,
            steps: [Fixtures.work("pr", Fixtures.press, target: 20, forMode: .reps, forValue: 8), Fixtures.rest("r", 60)]
        ))])
    }

    static func ids(_ s: RunState) -> [String] { s.slots.filter { $0.kind == .work }.map(\.id) }

    @Test("the tick on the running set is Done")
    func tickIsDone() {
        var s = Runner.tick(Runner.start(Self.sheet(), now: 0), now: 5_000)
        s = Runner.completeSet(s, now: 20_000, slotId: Self.ids(s)[0])
        #expect(s.i == 1)
        #expect(s.actuals[Self.ids(s)[0]]?.doneAt == 20_000)
    }

    @Test("a set still to come takes its load ahead, and a later set inherits it")
    func ahead() {
        var s = Runner.tick(Runner.start(Self.sheet(), now: 0), now: 5_000)
        s = Runner.adjustAt(s, now: 6_000, slotId: Self.ids(s)[1], target: 25)
        let loads = Self.ids(s).map { id in Runner.targetOf(s, s.slots.first { $0.id == id }!) }
        #expect(loads == [20, 25, 25])
    }

    @Test("a done set is locked until it is un-ticked, then logs the corrected weight")
    func untick() {
        var s = Runner.tick(Runner.start(Self.sheet(), now: 0), now: 5_000)
        let first = Self.ids(s)[0]
        s = Runner.advance(s, now: 20_000)
        s = Runner.adjustAt(s, now: 21_000, slotId: first, target: 22.5)
        #expect(Runner.effectiveTarget(s, 0) == 20)
        s = Runner.reopenSet(s, slotId: first)
        #expect(s.actuals[first]?.doneAt == nil)
        s = Runner.adjustAt(s, now: 22_000, slotId: first, target: 22.5)
        s = Runner.setRepsAt(s, slotId: first, reps: 7)
        s = Runner.completeSet(s, now: 23_000, slotId: first)
        #expect(s.i == 1) // the cursor did not move
        #expect(Runner.toResult(s, Self.sheet(), now: 30_000).steps[0].sets == [SetResult(reps: 7, load: 22.5, at: 23)])
    }

    @Test("a skipped set can be ticked afterwards")
    func skipped() {
        var s = Runner.tick(Runner.start(Self.sheet(), now: 0), now: 5_000)
        let first = Self.ids(s)[0]
        s = Runner.advance(s, now: 20_000, skipped: true)
        #expect(Runner.toResult(s, Self.sheet(), now: 21_000).steps.isEmpty)
        s = Runner.completeSet(s, now: 21_000, slotId: first)
        #expect(Runner.toResult(s, Self.sheet(), now: 22_000).steps[0].sets == [SetResult(reps: 8, load: 20, at: 21)])
        #expect(s.blockDone["b"] == 1)
    }

    @Test("ticking the next set during the rest ends the rest and logs the set in one tap")
    func tickDuringRest() {
        var s = Runner.tick(Runner.start(Self.sheet(), now: 0), now: 5_000)
        s = Runner.advance(s, now: 20_000) // set 1 done, rest running
        #expect(s.slots[s.i].kind == .rest)
        s = Runner.completeSet(s, now: 50_000, slotId: Self.ids(s)[1])
        #expect(s.actuals[Self.ids(s)[1]]?.doneAt == 50_000)
        #expect(s.slots[s.i].kind == .rest) // on to the rest after set 2
        #expect(s.blockDone["b"] == 2)
        #expect(Runner.toResult(s, Self.sheet(), now: 51_000).steps[0].sets?.count == 2)
    }

    @Test("a set not reached yet cannot be ticked")
    func notYet() {
        let s = Runner.tick(Runner.start(Self.sheet(), now: 0), now: 5_000)
        #expect(Runner.completeSet(s, now: 6_000, slotId: Self.ids(s)[2]) == s)
    }
}

@Suite("cap clock")
struct CapClockTests {
    @Test("counts down the block cap and ignores uncapped blocks")
    func capLeft() {
        var s = Runner.tick(Runner.start(Fixtures.cindy(), now: 0), now: 5_000)
        #expect(Runner.capLeft(s, now: 5_000) == 60)
        #expect(Runner.capLeft(s, now: 25_000) == 40)
        s = Runner.pause(s, now: 25_000)
        #expect(Runner.capLeft(s, now: 90_000) == 40)
        let plain = Runner.tick(Runner.start(Fixtures.interval(), now: 0), now: 5_000)
        #expect(Runner.capLeft(plain, now: 6_000) == nil)
    }
}

@Suite("straight sets")
struct StraightSetTests {
    static func bench() -> Runsheet { SetGridTests.sheet() }
    static func block(_ r: Runsheet) -> Block { r.items[0].asBlock! }
    static func step(_ r: Runsheet) -> ExerciseStep { block(r).straightSetStep! }

    @Test("is one exercise in a rounds block; circuits and timed modes are not")
    func detect() {
        #expect(Self.block(Self.bench()).straightSetStep?.id == "pr")
        var amrap = Self.block(Self.bench())
        amrap.mode = .amrap
        #expect(amrap.straightSetStep == nil)
        #expect(Self.block(Fixtures.interval()).straightSetStep == nil)
        let tabata = Block(id: "t", name: "Tabata", repeatCount: 8, steps: [Fixtures.work("sq", Fixtures.squat, forMode: .seconds, forValue: 20), Fixtures.rest("r", 10)])
        #expect(tabata.straightSetStep == nil)
    }

    @Test("editing one set changes that row and no other")
    func edit() {
        let r = Edit.editSet(Self.bench(), block: "b", round: 1, load: 25)
        #expect(Self.step(r).sets == [SetPlan(reps: 8, load: 20), SetPlan(reps: 8, load: 25), SetPlan(reps: 8, load: 20)])
        let planned = (0..<3).map { Self.step(r).plannedSet($0) }
        #expect(planned.map(\.reps) == [8, 8, 8])
        #expect(planned.map(\.load) == [20, 25, 20])
    }

    @Test("add set copies the last set and repeats once more; remove set drops it")
    func addRemove() {
        let r = Edit.addSet(Edit.editSet(Self.bench(), block: "b", round: 2, reps: 5, load: 30), block: "b")
        #expect(Self.block(r).repeatCount == 4)
        #expect(Self.step(r).plannedSet(3).reps == 5)
        #expect(Self.step(r).plannedSet(3).load == 30)
        let c = Edit.removeSet(Edit.removeSet(r, block: "b"), block: "b")
        #expect(Self.block(c).repeatCount == 2)
        #expect(Self.step(c).sets == [SetPlan(reps: 8, load: 20), SetPlan(reps: 8, load: 20)])
        var one = Self.bench()
        one = Edit.updateBlock(one, id: "b") { $0.repeatCount = 1 }
        #expect(Self.block(Edit.removeSet(one, block: "b")).repeatCount == 1)
    }
}

@Suite("set table incline")
@MainActor
struct SetInclineTests {
    /// 2 rounds of 30 s Treadmill sprints at 14.5 kph and 10% incline.
    static func sprints() -> Runsheet {
        Edit.updateStep(SessionRunnerTests.sprints(), id: "s1") { $0.target = 14.5; $0.incline = 10 }
    }

    @Test("sprints read KPH / INCL / SEC, a Run in metres KPH / INCL / M with −/+ under the row, a dumbbell no INCL")
    func columns() {
        SessionRunner.$savedName.withValue("test-\(UUID().uuidString).json") {
            let runner = SessionRunner(runsheet: Self.sprints())
            guard let step = runner.straightSetStep else { Issue.record("sprints are not a set table"); return }
            #expect(TimerView.setColumns(step, inclines: runner.setRows.map(\.incline)) == ["KPH", "INCL", "SEC"])
            #expect(!TimerView.inclineWraps(step))
            // + on a later set tapped open changes that set, not set 1, the current one.
            runner.nudgeSetIncline(runner.setRows.last?.slotId ?? "", -2)
            #expect(runner.setRows.map(\.incline) == [10, 9])
        }
        let run = ExerciseStep(id: "r", exercise: ExerciseRef(key: "cardio_run", name: "Run", unit: "kph", step: 0.5), target: 12, forMode: .meters, forValue: 400, incline: 2)
        #expect(TimerView.setColumns(run, inclines: [2, 2]) == ["KPH", "INCL", "M"] && TimerView.inclineWraps(run))
        let press = ExerciseStep(id: "pr", exercise: Fixtures.press, target: 20, forMode: .reps, forValue: 10)
        #expect(TimerView.setColumns(press, inclines: [nil, nil, nil]) == ["KG", "REPS"])
    }

    @Test("+ on the current sprint set takes 10 to 10.5, for the next set and in the log")
    func raise() {
        SessionRunner.$savedName.withValue("test-\(UUID().uuidString).json") {
            let runner = SessionRunner(runsheet: Self.sprints())
            runner.control(.done, token: SessionRunner.token(runner.state)) // Start, from the lead-in
            guard let first = runner.setRows.first else { Issue.record("no set rows"); return }
            #expect(first.current && first.incline == 10)
            runner.nudgeSetIncline(first.slotId, 1)
            #expect(runner.setRows.map(\.incline) == [10.5, 10.5])
            runner.done()
            #expect(runner.setRows.last?.current == true && runner.setRows.last?.incline == 10.5)
            #expect(runner.result().steps.first?.incline == 10.5)
        }
    }
}
