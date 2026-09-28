import Foundation
import Testing
@testable import TigerWorkouts

/// Ported one for one from `src/features/timer/gym-floor.test.ts`, plus the success-after-edit and
/// AMRAP-delta cases from `edit-sets.test.ts` and `celebrate.test.ts`, and the iOS-only pieces: the
/// rest notice, the gate cues, the cap warning and a record on a set that completes itself.
enum Floor {
    static let rower = ExerciseRef(key: "cardio_rower", name: "Rower", unit: "m", step: 100)
    static let bench = ExerciseRef(key: "db_incline_press", name: "Incline chest press", unit: "kg", step: 2.5)

    static func ex(_ id: String, _ ref: ExerciseRef, target: Double? = nil, forMode: ForMode = .seconds, forValue: Double = 30, sets: [SetPlan]? = nil) -> Step {
        var e = ExerciseStep(id: id, exercise: ref, target: target, forMode: forMode, forValue: forValue)
        e.sets = sets
        return .exercise(e)
    }

    /// Done on everything until the session ends or parks at a gate.
    static func run(_ given: RunState, from: Double, step: Double = 1_000) -> (s: RunState, t: Double) {
        var s = given
        var t = from
        while s.phase != .done, s.phase != .ready {
            t += step
            s = Runner.advance(s, now: t)
        }
        return (s, t)
    }

    static func slot(_ s: RunState, _ id: String) -> Slot { s.slots.first { $0.id == id }! }
}

@Suite("a gate holds through a swap or a drop")
struct GateHoldsTests {
    static func two() -> Runsheet {
        Runsheet(id: "g2", title: "Two blocks", items: [
            .block(Block(id: "b1", name: "Warm", repeatCount: 1, steps: [Floor.ex("w", Fixtures.squat, forMode: .reps, forValue: 10)])),
            .block(Block(id: "b2", name: "Cindy", repeatCount: 1, mode: .amrap, steps: [
                Floor.ex("row", Floor.rower, forMode: .calories, forValue: 10),
                Floor.ex("p", Fixtures.pushup, forMode: .reps, forValue: 10),
            ], timeCapSec: 300)),
        ])
    }

    static func atGate() -> RunState { Runner.advance(Runner.tick(Runner.start(two(), now: 0), now: 5_000), now: 10_000) }

    @Test("swapping the first exercise at the gate keeps the block parked")
    func swapAtGate() {
        let gate = Self.atGate()
        #expect(gate.phase == .ready)
        let s = Runner.swap(gate, now: 20_000, stepId: "row", to: Fixtures.burpee, target: nil)
        #expect(s.phase == .ready)
        #expect(s.blockStart["b2"] == nil)
        #expect(Runner.current(s)?.exercise?.exercise.key == "bw_burpee")
    }

    @Test("dropping the first exercise at the gate keeps the block parked on the next one")
    func dropAtGate() {
        let s = Runner.drop(Self.atGate(), now: 20_000, stepId: "row")
        #expect(s.phase == .ready)
        #expect(s.blockStart["b2"] == nil)
        #expect(Runner.current(s)?.step.id == "p")
    }

    @Test("a swap on a paused set keeps it paused")
    func swapPaused() {
        var s = Runner.startBlock(Self.atGate(), now: 20_000)
        s = Runner.tick(s, now: 25_000)
        s = Runner.pause(s, now: 30_000)
        s = Runner.swap(s, now: 40_000, stepId: "row", to: Fixtures.burpee, target: nil)
        #expect(s.phase == .paused)
    }
}

@Suite("progression reads what was done")
struct ProgressionTruthTests {
    static func ruled(_ sets: [SetPlan]? = nil, repeatCount: Int = 3) -> Runsheet {
        var r = Runsheet(id: "ss", title: "Bench", items: [.block(Block(
            id: "b", name: "Bench", repeatCount: repeatCount,
            steps: [Floor.ex("pr", Floor.bench, target: 60, forMode: .reps, forValue: 8, sets: sets)]
        ))])
        r.progression = Progression(onSuccessKg: 2.5, deloadPct: 10, failAfter: 3)
        return r
    }

    @Test("a drop set with fewer reps is not a miss")
    func shortDrop() {
        let r = Self.ruled([SetPlan(), SetPlan(), SetPlan(), SetPlan(type: .drop)], repeatCount: 4)
        var s = Runner.tick(Runner.start(r, now: 0), now: 5_000)
        let drop = s.slots.filter { $0.kind == .work }[3].id
        s = Runner.setRepsAt(s, slotId: drop, reps: 6)
        s = Floor.run(s, from: 5_000).s
        #expect(Runner.toResult(s, r, now: 60_000).steps[0].success == true)
    }

    @Test("a planned drop set left undone is not a miss")
    func undoneDrop() {
        let r = Self.ruled([SetPlan(), SetPlan(), SetPlan(), SetPlan(type: .drop)], repeatCount: 4)
        var s = Runner.tick(Runner.start(r, now: 0), now: 5_000)
        for k in 0..<3 { s = Runner.advance(s, now: 6_000 + Double(k) * 1_000) }
        s = Runner.finish(s, now: 20_000)
        #expect(Runner.toResult(s, r, now: 20_000).steps[0].success == true)
    }

    @Test("a lift dropped after two of four sets is a miss")
    func droppedLift() {
        let r = Self.ruled(repeatCount: 4)
        var s = Runner.tick(Runner.start(r, now: 0), now: 5_000)
        s = Runner.advance(Runner.advance(s, now: 6_000), now: 7_000)
        s = Runner.drop(s, now: 8_000, stepId: "pr")
        #expect(s.phase == .done)
        let res = Runner.toResult(s, r, now: 8_000)
        #expect(res.steps[0].sets?.count == 2)
        #expect(res.steps[0].success == false)
    }

    @Test("a warm-up's load does not carry into the working sets")
    func warmupLoad() {
        var s = Runner.tick(Runner.start(Self.ruled(), now: 0), now: 5_000)
        let ids = s.slots.filter { $0.kind == .work }.map(\.id)
        s = Runner.setTypeAt(s, slotId: ids[0], type: .warmup)
        s = Runner.adjustAt(s, now: 6_000, slotId: ids[0], target: 40)
        #expect(Runner.targetOf(s, Floor.slot(s, ids[0])) == 40)
        #expect(Runner.targetOf(s, Floor.slot(s, ids[1])) == 60)
        s = Runner.setTypeAt(s, slotId: ids[1], type: .drop)
        s = Runner.adjustAt(s, now: 6_000, slotId: ids[1], target: 45)
        #expect(Runner.targetOf(s, Floor.slot(s, ids[2])) == 60)
    }
}

@Suite("circuits end cleanly")
struct CircuitEndTests {
    static func circuit(between: Double? = nil) -> Runsheet {
        Runsheet(id: "c", title: "Circuit", items: [.block(Block(
            id: "b", name: "Circuit", repeatCount: 3,
            steps: [Floor.ex("a", Fixtures.swing, forValue: 40), Fixtures.rest("r1", 20), Floor.ex("c", Fixtures.burpee, forValue: 40), Fixtures.rest("r2", 20)],
            restBetweenSec: between
        ))])
    }

    @Test("the last round has no rest after its last exercise")
    func lastRound() {
        let slots = Runner.expand(Self.circuit())
        #expect(slots.last?.step.id == "c")
        #expect(slots.filter { $0.step.id == "r2" }.count == 2)
    }

    @Test("a rest between rounds stands in for the rest after the last exercise")
    func betweenStandsIn() {
        let slots = Runner.expand(Self.circuit(between: 90))
        #expect(slots.map(\.step.id) == ["a", "r1", "c", "b:between", "a", "r1", "c", "b:between", "a", "r1", "c"])
    }

    @Test("straight sets end on the last set")
    func straightSets() {
        let slots = Runner.expand(Runsheet(title: "t", items: [.block(Block(
            id: "b", name: "B", repeatCount: 3,
            steps: [Floor.ex("pr", Floor.bench, forMode: .reps, forValue: 8), Fixtures.rest("r", 90)]
        ))]))
        #expect(slots.map(\.kind) == [.work, .rest, .work, .rest, .work])
    }

    @Test("End this block skips what is left of it and parks at the next gate")
    func endBlock() {
        var r = Self.circuit()
        r.items.append(.block(Block(id: "b2", name: "Next", repeatCount: 1, steps: [Floor.ex("n", Fixtures.squat, forMode: .reps, forValue: 10)])))
        var s = Runner.tick(Runner.start(r, now: 0), now: 5_000)
        s = Runner.tick(s, now: 45_000)
        s = Runner.endBlock(s, now: 50_000)
        #expect(s.phase == .ready)
        #expect(Runner.current(s)?.blockId == "b2")
        s = Floor.run(Runner.startBlock(s, now: 60_000), from: 60_000).s
        let res = Runner.toResult(s, r, now: 70_000)
        #expect(res.steps.first { $0.stepId == "a" }?.sets?.count == 1)
        #expect(!res.steps.contains { $0.stepId == "c" })
        #expect(res.completed == false)
    }

    @Test("End this block on the last block ends the session")
    func endLast() {
        let s = Runner.endBlock(Runner.tick(Runner.start(Self.circuit(), now: 0), now: 5_000), now: 10_000)
        #expect(s.phase == .done)
    }
}

@Suite("EMOM minutes move on by themselves")
struct EmomMinuteTests {
    static func emom(_ n: Int = 2) -> Runsheet {
        Runsheet(id: "e", title: "EMOM", items: [.block(Block(
            id: "b", name: "E", repeatCount: n, mode: .emom,
            steps: [Floor.ex("x", Fixtures.burpee, forMode: .reps, forValue: 5), Floor.ex("y", Fixtures.pushup, forMode: .reps, forValue: 10)],
            everySec: 60
        ))])
    }

    @Test("the work counts down to the minute, so the last three seconds get their tones")
    func countsDown() {
        let s = Runner.tick(Runner.start(Self.emom(), now: 0), now: 5_000)
        #expect(Runner.current(s)?.step.id == "x")
        #expect(s.endsAt == 65_000)
        #expect(Runner.clock(s, now: 62_000).left == 3)
        #expect(Runner.minuteOnly(Runner.current(s)))
    }

    @Test("an untapped minute logs its sets as planned and starts the next minute")
    func untapped() {
        var s = Runner.tick(Runner.start(Self.emom(), now: 0), now: 5_000)
        s = Runner.tick(s, now: 65_000)
        #expect(Runner.current(s)?.step.id == "x")
        #expect(Runner.current(s)?.round == 1)
        #expect(s.phase == .running)
        s = Runner.tick(s, now: 125_000)
        #expect(s.phase == .done)
        #expect(Runner.toResult(s, Self.emom(), now: 125_000).steps.map(\.reps) == [[5, 5], [10, 10]])
    }

    @Test("Done early still waits out the minute")
    func doneEarly() {
        var s = Runner.tick(Runner.start(Self.emom(), now: 0), now: 5_000)
        s = Runner.advance(Runner.advance(s, now: 20_000), now: 35_000)
        #expect(Runner.current(s)?.untilBoundary == true)
        s = Runner.tick(s, now: 65_000)
        #expect(Runner.current(s)?.round == 1)
        #expect(Runner.current(s)?.step.id == "x")
    }

    @Test("a timed EMOM set keeps its own countdown inside the minute")
    func timedSet() {
        let r = Runsheet(id: "t", title: "T", items: [.block(Block(
            id: "b", name: "E", repeatCount: 2, mode: .emom, steps: [Floor.ex("x", Fixtures.swing, forValue: 40)], everySec: 60
        ))])
        let s = Runner.tick(Runner.start(r, now: 0), now: 5_000)
        #expect(s.endsAt == 45_000)
        #expect(!Runner.minuteOnly(Runner.current(s)))
    }
}

@Suite("caps")
struct CapTests {
    static func fran(_ cap: Double?) -> Runsheet {
        Runsheet(id: "f", title: "Fran", items: [.block(Block(
            id: "b", name: "Fran", repeatCount: 3, mode: .fortime,
            steps: [Floor.ex("t", Fixtures.swing, forMode: .reps, forValue: 21), Floor.ex("p", Fixtures.pullup, forMode: .reps, forValue: 21)],
            timeCapSec: cap
        ))], score: .time)
    }

    @Test("a for-time capped before the end is saved as capped with the reps reached, not a finish")
    func capped() {
        var s = Runner.tick(Runner.start(Self.fran(120), now: 0), now: 5_000)
        s = Runner.advance(s, now: 30_000)
        s = Runner.setReps(s, reps: 12)
        s = Runner.tick(s, now: 125_000)
        #expect(s.phase == .done)
        let res = Runner.toResult(s, Self.fran(120), now: 125_000)
        #expect(res.completed == false)
        #expect(res.capped == true)
        #expect(res.capReps == 21)
        #expect(res.scoreText == "Capped · 21 reps")
        #expect(res.score == 120)
        var logged = res
        logged.id = "x"
        #expect(Targets.score(Self.fran(120), results: [logged]) == nil)
    }

    @Test("a for-time finished inside its cap is a finish")
    func finished() {
        let s = Floor.run(Runner.tick(Runner.start(Self.fran(600), now: 0), now: 5_000), from: 5_000).s
        let res = Runner.toResult(s, Self.fran(600), now: 20_000)
        #expect(res.completed == true)
        #expect(res.capped == nil)
    }

    @Test("a cap of 0 is no cap")
    func zeroCap() {
        #expect(Runner.expand(Self.fran(0))[0].capSec == nil)
        let amrap = Runsheet(title: "a", items: [.block(Block(
            id: "b", name: "A", repeatCount: 1, mode: .amrap, steps: [Floor.ex("p", Fixtures.pushup, forMode: .reps, forValue: 10)], timeCapSec: 0
        ))])
        #expect(Runner.expand(amrap)[0].capSec == nil)
        #expect(Block(id: "b", name: "A", mode: .amrap, timeCapSec: 0).modeLabel == "AMRAP")
        #expect(Block(id: "b", name: "A", mode: .amrap, timeCapSec: 90).modeLabel == "AMRAP 1:30")
    }
}

@Suite("Get ready before a block on a clock")
struct GateLeadTests {
    static func sheet(_ second: Block) -> Runsheet {
        Runsheet(id: "g", title: "G", items: [
            .block(Block(id: "b1", name: "One", repeatCount: 1, steps: [Floor.ex("w", Fixtures.squat, forMode: .reps, forValue: 10)])),
            .block(second),
        ])
    }

    static func gate(_ r: Runsheet) -> RunState { Runner.advance(Runner.tick(Runner.start(r, now: 0), now: 5_000), now: 10_000) }

    @Test("an AMRAP starts after five seconds, its clock from then")
    func amrap() {
        let r = Self.sheet(Block(id: "b2", name: "A", repeatCount: 1, mode: .amrap, steps: [Floor.ex("p", Fixtures.pushup, forMode: .reps, forValue: 10)], timeCapSec: 300))
        var s = Runner.startBlock(Self.gate(r), now: 20_000)
        #expect(s.phase == .lead)
        #expect(Runner.clock(s, now: 21_000).left == 4)
        s = Runner.tick(s, now: 25_000)
        #expect(s.phase == .running)
        #expect(s.blockStart["b2"] == 25_000)
    }

    @Test("Skip on the Get ready starts the block at once")
    func skipLead() {
        let r = Self.sheet(Block(id: "b2", name: "E", repeatCount: 2, mode: .emom, steps: [Floor.ex("p", Fixtures.pushup, forMode: .reps, forValue: 10)], everySec: 60))
        let s = Runner.advance(Runner.startBlock(Self.gate(r), now: 20_000), now: 21_000, skipped: true)
        #expect(s.phase == .running)
        #expect(s.blockStart["b2"] == 21_000)
    }

    @Test("straight sets start on the tap")
    func straight() {
        let r = Self.sheet(Block(id: "b2", name: "Bench", repeatCount: 3, steps: [Floor.ex("pr", Floor.bench, forMode: .reps, forValue: 8)]))
        #expect(Runner.startBlock(Self.gate(r), now: 20_000).phase == .running)
    }

    @Test("starting after the Get ready is work starting, not a block ending")
    func cue() {
        let r = Self.sheet(Block(id: "b2", name: "A", repeatCount: 1, mode: .amrap, steps: [Floor.ex("p", Fixtures.pushup, forMode: .reps, forValue: 10)], timeCapSec: 300))
        let gate = Self.gate(r)
        let lead = Runner.startBlock(gate, now: 20_000)
        let running = Runner.tick(lead, now: 25_000)
        let cued = gate.slots[0].id
        #expect(SessionRunner.transitionCue(running, cuedSlot: cued, cuedPhase: .lead) == .work)
    }
}

@Suite("success follows the edit, as the timer would judge it")
struct EditSuccessTests {
    static func sheet(_ sets: [SetPlan]? = nil) -> Runsheet {
        var r = Runsheet(id: "w", title: "W", items: [.block(Block(
            id: "b", name: "B", repeatCount: 3,
            steps: [Floor.ex("a", ExerciseRef(key: "bench", name: "Bench", unit: "kg", step: 2.5), target: 60, forMode: .reps, forValue: 8, sets: sets)]
        ))])
        r.progression = Progression(onSuccessKg: 2.5, deloadPct: 10, failAfter: 3)
        return r
    }

    static func logged(_ sets: [SetResult], success: Bool = false) -> SessionResult {
        SessionResult(runsheetId: "w", title: "W", startedAt: "2026-09-01T10:00:00Z", steps: [
            StepResult(stepId: "a", exerciseKey: "bench", target: 60, incline: nil, reps: nil, success: success, sets: sets),
        ])
    }

    static let warm = SetResult(reps: 10, load: 40, type: .warmup)
    static let eight = SetResult(reps: 8, load: 60)

    @Test("a skipped set stays a miss when a short set is put right")
    func skipped() {
        let miss = Self.logged([Self.warm, Self.eight, SetResult(reps: 6, load: 60)])
        let r = EditSets.edit(miss, row: "a|bench", index: 2, plan: EditSets.plannedFor(Self.sheet(), stepId: "a")) { $0.reps = 8 }
        #expect(r.steps[0].success == false)
    }

    @Test("the set added back clears it, and one taken off makes it a miss again")
    func addBack() {
        let plan = EditSets.plannedFor(Self.sheet(), stepId: "a")
        let back = EditSets.addSet(Self.logged([Self.warm, Self.eight, Self.eight]), row: "a|bench", plan: plan)
        #expect(back.steps[0].success == true)
        #expect(EditSets.removeSet(back, row: "a|bench", index: 3, plan: plan).steps[0].success == false)
    }

    @Test("a working set marked a warm-up is one working set fewer")
    func markedWarmup() {
        let ok = Self.logged([Self.warm, Self.eight, Self.eight, Self.eight], success: true)
        let r = EditSets.edit(ok, row: "a|bench", index: 3, plan: EditSets.plannedFor(Self.sheet(), stepId: "a")) { $0.type = .warmup }
        #expect(r.steps[0].success == false)
    }

    @Test("a drop set short of the reps is not a miss")
    func shortDrop() {
        let ok = Self.logged([Self.warm, Self.eight, Self.eight, Self.eight, SetResult(reps: 6, load: 40, type: .drop)], success: true)
        let r = EditSets.edit(ok, row: "a|bench", index: 4, plan: EditSets.plannedFor(Self.sheet(), stepId: "a")) { $0.reps = 5 }
        #expect(r.steps[0].success == true)
    }

    @Test("the plan counts working sets, set by set for a per-set plan")
    func plan() {
        #expect(EditSets.plannedFor(Self.sheet(), stepId: "a") == EditSets.StepPlan(reps: 8, sets: 3))
        #expect(EditSets.plannedFor(Self.sheet([SetPlan(type: .warmup), SetPlan(reps: 5), SetPlan(reps: 3)]), stepId: "a") == EditSets.StepPlan(setReps: [5, 3], sets: 2))
        var e = ExerciseStep(id: "x", exercise: ExerciseRef(key: "bench", name: "Bench", unit: "kg", step: 2.5), forMode: .reps, forValue: 8)
        e.sets = [SetPlan(reps: 5)]
        let loose = Runsheet(id: "l", title: "L", items: [.step(.exercise(e))])
        // A loose step runs once at its own reps, whatever sets it carries: the timer runs it so.
        #expect(EditSets.plannedFor(loose, stepId: "x") == EditSets.StepPlan(reps: 8, sets: 1))
        #expect(EditSets.plannedReps(loose, stepId: "x") == 8)
    }
}

@Suite("an AMRAP and a capped for-time against last time")
struct DeltaTests {
    static func s(_ id: String, _ at: String, _ runsheetId: String, _ score: Double) -> SessionResult {
        SessionResult(runsheetId: runsheetId, title: runsheetId, startedAt: at, score: score, id: id)
    }

    @Test("sets rounds and reps apart, never the encoded numbers")
    func rounds() {
        let a = Self.s("a", "2026-09-01T10:00:00Z", "cindy", 6.015)
        let b = Self.s("b", "2026-09-08T10:00:00Z", "cindy", 7.003)
        #expect(Celebrate.deltaLines(Celebrate.celebrate(b, all: [a, b]), type: .rounds).first == Celebrate.DeltaLine(label: "Score", text: "+1 round − 12 reps", better: true))
        let c = Self.s("c", "2026-09-15T10:00:00Z", "cindy", 7.01)
        #expect(Celebrate.deltaLines(Celebrate.celebrate(c, all: [a, b, c]), type: .rounds).first == Celebrate.DeltaLine(label: "Score", text: "+7 reps", better: true))
    }

    @Test("a capped for-time is not set against a finish time")
    func capped() {
        let a = Self.s("a", "2026-09-01T10:00:00Z", "fran", 420)
        var b = Self.s("b", "2026-09-08T10:00:00Z", "fran", 720)
        b.capped = true
        b.capReps = 57
        b.completed = false
        #expect(Celebrate.celebrate(b, all: [a, b]).deltas.score == nil)
    }
}

@Suite("on the phone")
struct PhoneCueTests {
    @Test("the rest notice skips short rests, EMOM waits and a rest before another rest")
    func restNotice() {
        // 60 s rest between sets: worth a notice.
        let long = RestControlTests.onRest()
        #expect(RestNotice.restEnd(long) != nil)
        // A circuit's 20 s rests are not.
        let c = Runner.tick(Runner.tick(Runner.start(CircuitEndTests.circuit(), now: 0), now: 5_000), now: 45_000)
        #expect(Runner.current(c)?.step.id == "r1")
        #expect(RestNotice.restEnd(c) == nil)
        // An EMOM's wait is the minute's clock, not a rest.
        let wait = Runner.advance(Runner.advance(Runner.tick(Runner.start(EmomMinuteTests.emom(), now: 0), now: 5_000), now: 20_000), now: 30_000)
        #expect(Runner.current(wait)?.untilBoundary == true)
        #expect(RestNotice.restEnd(wait) == nil)
        // A long rest that runs into another rest: only the last one says it is over.
        let twoRests = Runsheet(id: "t", title: "T", items: [
            .step(Floor.ex("a", Fixtures.squat, forMode: .reps, forValue: 10)), .step(Fixtures.rest("r1", 60)), .step(Fixtures.rest("r2", 60)), .step(Floor.ex("b", Fixtures.squat, forMode: .reps, forValue: 10)),
        ])
        var s = Runner.advance(Runner.tick(Runner.start(twoRests, now: 0), now: 5_000), now: 10_000)
        #expect(Runner.current(s)?.step.id == "r1")
        #expect(RestNotice.restEnd(s) == nil)
        s = Runner.tick(s, now: 70_000)
        #expect(Runner.current(s)?.step.id == "r2")
        #expect(RestNotice.restEnd(s) != nil)
    }

    @Test("a gate buzzes three times locked, work twice, and is cued again at 30 s and 90 s")
    func gate() {
        #expect(Haptics.buzzes(.block) == 3)
        #expect(Haptics.buzzes(.work) == 2)
        #expect(Haptics.buzzes(.block) != Haptics.buzzes(.finish))
        #expect(!SessionRunner.gateRecue(parkedFor: 29, cued: 0))
        #expect(SessionRunner.gateRecue(parkedFor: 30, cued: 0))
        #expect(!SessionRunner.gateRecue(parkedFor: 60, cued: 1))
        #expect(SessionRunner.gateRecue(parkedFor: 90, cued: 1))
        #expect(!SessionRunner.gateRecue(parkedFor: 600, cued: 2))
    }

    @Test("a cap warns a minute out and ten seconds out, on crossing only")
    func capWarning() {
        #expect(SessionRunner.capWarning(was: 60.1, now: 59.9) == 60)
        #expect(SessionRunner.capWarning(was: 10.05, now: 9.95) == 10)
        #expect(SessionRunner.capWarning(was: 45, now: 44.9) == nil)
        #expect(SessionRunner.capWarning(was: nil, now: 50) == nil)
    }

    @Test("a timed set that runs out on its own is newly done, so it can take the record medal")
    func newlyDone() {
        let before = Runner.tick(Runner.start(Fixtures.interval(), now: 0), now: 5_000)
        let after = Runner.tick(before, now: 35_000)
        #expect(SessionRunner.newlyDone(before, after) == [before.slots[0].id])
        #expect(SessionRunner.newlyDone(after, after).isEmpty)
    }
}
