import Foundation
import Testing
@testable import TigerWorkouts

/// Ported from 'rest controls', 'last time into the set' and 'set times and round splits' in
/// `runner.test.ts`, and from `pace.test.ts`.
@Suite("rest controls")
struct RestControlTests {
    static func sheet(between: Double? = nil) -> Runsheet {
        Runsheet(id: "g", title: "Grid", items: [.block(Block(
            id: "b", name: "Bench", repeatCount: 3,
            steps: [Fixtures.work("pr", Fixtures.press, target: 20, forMode: .reps, forValue: 8), Fixtures.rest("r", 60)],
            restBetweenSec: between
        ))])
    }

    /// Set 1 done at 20 s, then 60 s of rest.
    static func onRest() -> RunState { Runner.advance(Runner.tick(Runner.start(sheet(), now: 0), now: 5_000), now: 20_000) }

    @Test("+15 s and −15 s move the running rest and its length")
    func moves() {
        var s = Self.onRest()
        #expect(s.slots[s.i].kind == .rest)
        s = Runner.extendRest(s, now: 30_000, by: 15)
        #expect(s.endsAt == 95_000)
        #expect(s.slots[s.i].seconds == 75)
        s = Runner.extendRest(s, now: 31_000, by: -15)
        s = Runner.extendRest(s, now: 32_000, by: -15)
        #expect(s.endsAt == 65_000)
        #expect(s.slots[s.i].seconds == 45)
    }

    @Test("taking more than is left ends the rest at the next tick")
    func endsRest() {
        var s = Runner.extendRest(Self.onRest(), now: 75_000, by: -15) // 5 s left
        #expect(s.endsAt == 75_000)
        s = Runner.tick(s, now: 75_000)
        #expect(s.slots[s.i].step.id == "pr")
    }

    @Test("works on a paused rest")
    func paused() {
        var s = Runner.pause(Self.onRest(), now: 30_000) // 50 s left
        s = Runner.extendRest(s, now: 40_000, by: 15)
        #expect(s.remainingMs == 65_000)
        s = Runner.resume(s, now: 50_000)
        #expect(s.endsAt == 115_000)
    }

    @Test("the rest between rounds takes it too")
    func between() {
        let s = Runner.advance(Runner.tick(Runner.start(Self.sheet(between: 90), now: 0), now: 5_000), now: 20_000) // set 1 done: the rest between rounds
        #expect(s.slots[s.i].step.id == "b:between")
        #expect(Runner.extendRest(s, now: 21_000, by: 15).endsAt == s.endsAt! + 15_000)
    }

    @Test("leaves work and an EMOM wait alone")
    func leavesAlone() {
        let work = Runner.tick(Runner.start(Self.sheet(), now: 0), now: 5_000)
        #expect(Runner.extendRest(work, now: 6_000, by: 15) == work)
        let emom = Runsheet(id: "e", title: "E", items: [.block(Block(
            id: "b", name: "E", repeatCount: 2, mode: .emom,
            steps: [Fixtures.work("x", Fixtures.burpee, forMode: .reps, forValue: 5)], everySec: 60
        ))])
        let wait = Runner.advance(Runner.tick(Runner.start(emom, now: 0), now: 5_000), now: 20_000)
        #expect(wait.slots[wait.i].untilBoundary)
        #expect(Runner.extendRest(wait, now: 21_000, by: 15) == wait)
    }
}

@Suite("last time into the set")
struct LastTimeFillTests {
    static func range() -> Runsheet {
        var step = ExerciseStep(id: "pr", exercise: Fixtures.press, target: 20, forMode: .reps, forValue: 8)
        step.forMax = 12
        return Runsheet(id: "g", title: "Grid", items: [.block(Block(
            id: "b", name: "Bench", repeatCount: 3, steps: [.exercise(step), Fixtures.rest("r", 60)]
        ))])
    }

    static func ids(_ s: RunState) -> [String] { s.slots.filter { $0.kind == .work }.map(\.id) }

    @Test("fillSet puts load and reps on a set to come")
    func fills() {
        var s = Runner.tick(Runner.start(Self.range(), now: 0), now: 5_000)
        let second = Self.ids(s)[1]
        s = Runner.fillSet(s, now: 6_000, slotId: second, with: SetResult(reps: 10, load: 22.5))
        #expect(Runner.targetOf(s, s.slots.first { $0.id == second }!) == 22.5)
        #expect(s.actuals[second]?.reps == 10)
    }

    @Test("fillSet leaves a done set alone")
    func done() {
        let s = Runner.advance(Runner.tick(Runner.start(Self.range(), now: 0), now: 5_000), now: 20_000)
        #expect(Runner.fillSet(s, now: 21_000, slotId: Self.ids(s)[0], with: SetResult(reps: 12, load: 30)) == s)
    }

    @Test("a legacy rower row that logged metres as a load reads as metres, so nothing offers it as a load")
    func legacyMeasure() {
        let rower = ExerciseStep(id: "row", exercise: ExerciseRef(key: "cardio_rower", name: "Rowing machine", unit: "m", step: 100), forMode: .meters, forValue: 1000)
        var step = StepResult(stepId: "row", exerciseKey: "cardio_rower")
        step.sets = [SetResult(load: 500)]
        let res = SessionResult(runsheetId: "x", title: nil, startedAt: "2026-09-01", steps: [step])
        let sets = LastTime.sets([res], for: rower)
        #expect(sets?.first?.meters == 500 && sets?.first?.load == nil)
        #expect(LastTime.setLabel(sets?.first) == nil)
    }

    @Test("prefillReps fills a range from last time, set by set")
    func prefill() {
        let last: [Double] = [11, 10, 9]
        let s = Runner.prefillReps(Runner.start(Self.range(), now: 0)) { _, round in last[round] }
        #expect(Self.ids(s).map { s.actuals[$0]?.reps } == [11, 10, 9])
        let done = Runner.advance(Runner.tick(s, now: 5_000), now: 20_000)
        #expect(Runner.toResult(done, Self.range(), now: 21_000).steps[0].sets?.first?.reps == 11)
    }

    @Test("prefillReps leaves fixed reps, prescribed sets and circuits alone")
    func leavesAlone() {
        let fixed = Runsheet(id: "f", title: "F", items: [.block(Block(
            id: "b", name: "B", repeatCount: 2, steps: [Fixtures.work("pr", Fixtures.press, forMode: .reps, forValue: 8)]
        ))])
        let f = Runner.start(fixed, now: 0)
        #expect(Runner.prefillReps(f) { _, _ in 11 } == f)
        let circuit = Runsheet(id: "c", title: "C", items: [.block(Block(
            id: "b", name: "B", repeatCount: 2,
            steps: [Fixtures.work("a", Fixtures.pullup, forMode: .max, forValue: 0), Fixtures.work("b2", Fixtures.pushup, forMode: .reps, forValue: 10)]
        ))])
        let c = Runner.start(circuit, now: 0)
        #expect(Runner.prefillReps(c) { _, _ in 11 } == c)
    }
}

@Suite("set times and round splits")
struct SplitTests {
    static func press() -> Runsheet {
        Runsheet(id: "p", title: "Press", items: [.block(Block(
            id: "b", name: "B", repeatCount: 2, steps: [Fixtures.work("pr", Fixtures.press, target: 20, forMode: .reps, forValue: 8)]
        ))])
    }

    @Test("each set keeps its session time, pauses excluded")
    func setTimes() {
        var s = Runner.tick(Runner.start(Self.press(), now: 0), now: 5_000)
        s = Runner.advance(s, now: 20_000)
        s = Runner.pause(s, now: 25_000)
        s = Runner.resume(s, now: 55_000)
        s = Runner.advance(s, now: 70_000)
        let r = Runner.toResult(s, Self.press(), now: 70_000)
        #expect(r.steps[0].sets?.map(\.at) == [20, 40])
        #expect(r.splits == nil)
    }

    @Test("a circuit logs when each round finished")
    func circuit() {
        var s = Runner.tick(Runner.start(Fixtures.interval(), now: 0), now: 5_000)
        var t: Double = 5_000
        while t <= 200_000, s.phase != .done {
            s = Runner.tick(s, now: t)
            t += 1_000
        }
        #expect(Runner.toResult(s, Fixtures.interval(), now: 200_000).splits == [RoundSplit(blockId: "b", at: [75, 155], from: 5, starts: [5, 85])])
    }

    @Test("an amrap's half round at the cap is not a split")
    func amrapCap() {
        var s = Runner.tick(Runner.start(Fixtures.cindy(), now: 0), now: 5_000)
        s = Runner.advance(s, now: 15_000)
        s = Runner.advance(s, now: 25_000)
        s = Runner.advance(s, now: 35_000)
        s = Runner.tick(s, now: 65_000)
        #expect(Runner.toResult(s, Fixtures.cindy(), now: 65_000).splits == [RoundSplit(blockId: "b", at: [25], from: 5, starts: [5])])
    }

    @Test("a round with a skipped exercise still closes when the next begins")
    func skipped() {
        var s = Runner.tick(Runner.start(Fixtures.cindy(), now: 0), now: 5_000)
        s = Runner.advance(s, now: 15_000)
        s = Runner.advance(s, now: 25_000, skipped: true)
        s = Runner.advance(s, now: 35_000)
        s = Runner.advance(s, now: 45_000)
        #expect(Runner.toResult(s, Fixtures.cindy(), now: 46_000).splits == [RoundSplit(blockId: "b", at: [15, 45], from: 5, starts: [5, 25])])
    }

    @Test("un-ticking a set drops its time")
    func untick() {
        var s = Runner.advance(Runner.tick(Runner.start(Self.press(), now: 0), now: 5_000), now: 20_000)
        let first = s.slots[0].id
        s = Runner.reopenSet(s, slotId: first)
        #expect(s.actuals[first]?.at == nil)
        s = Runner.completeSet(s, now: 30_000, slotId: first)
        #expect(s.actuals[first]?.at == 30)
    }

    @Test("times and splits round-trip through JSON, and old rows still read")
    func codable() throws {
        var r = SessionResult(runsheetId: "w", title: "W", startedAt: "2026-09-20T10:00:00Z")
        r.steps = [StepResult(stepId: "pr", exerciseKey: "k", sets: [SetResult(reps: 8, load: 60, at: 40)])]
        r.splits = [RoundSplit(blockId: "b", at: [75, 155])]
        let back = try JSONDecoder().decode(SessionResult.self, from: JSONEncoder().encode(r))
        #expect(back.splits == r.splits)
        #expect(back.steps[0].sets?.first?.at == 40)
        let old = try JSONDecoder().decode(SessionResult.self, from: Data(#"{"runsheetId":"w","startedAt":"2026-09-20T10:00:00Z","steps":[{"stepId":"pr","exerciseKey":"k","sets":[{"reps":8,"load":60}]}]}"#.utf8))
        #expect(old.splits == nil)
        #expect(old.steps[0].sets?.first?.at == nil)
    }
}

@Suite("pace against last time")
struct PaceTests {
    static func session(_ over: (inout SessionResult) -> Void) -> SessionResult {
        var r = SessionResult(runsheetId: "w", title: "W", startedAt: "2026-09-20T10:00:00Z")
        over(&r)
        return r
    }

    static func circuit(_ at: [Double], startedAt: String = "2026-09-20T10:00:00Z") -> SessionResult {
        session {
            $0.startedAt = startedAt
            $0.splits = [RoundSplit(blockId: "b", at: at)]
            $0.steps = [StepResult(stepId: "sw", exerciseKey: "kb", sets: at.map { SetResult(reps: 10, at: $0 - 5) })]
        }
    }

    static let inBlock: (String) -> String? = { $0 == "sw" ? "b" : nil }

    @Test("is ahead when the same round comes sooner")
    func ahead() {
        let g = Pace.ghost(Self.circuit([70, 150, 230, 300]), against: Self.circuit([75, 160, 250, 312, 400]), blockOf: Self.inBlock)
        #expect(g?.label == "Round 4")
        #expect(g?.delta == 12)
        #expect(g?.text == "Round 4 — 12 s ahead")
        #expect(g?.short == "12 s ahead")
    }

    @Test("is behind when it comes later")
    func behind() {
        #expect(Pace.ghost(Self.circuit([83]), against: Self.circuit([75]), blockOf: Self.inBlock)?.text == "Round 1 — 8 s behind")
    }

    @Test("reads minutes past a minute, and level as on pace")
    func formats() {
        #expect(Pace.ghost(Self.circuit([200]), against: Self.circuit([125]), blockOf: Self.inBlock)?.short == "1:15 behind")
        #expect(Pace.ghost(Self.circuit([75]), against: Self.circuit([75]), blockOf: Self.inBlock)?.short == "on pace")
    }

    @Test("uses the latest round both sessions reached")
    func latest() {
        #expect(Pace.ghost(Self.circuit([70, 150, 230, 300, 380]), against: Self.circuit([75, 160, 250]), blockOf: Self.inBlock)?.label == "Round 3")
    }

    @Test("is nothing without a last time or before the first mark")
    func nothing() {
        #expect(Pace.ghost(Self.circuit([70]), against: nil) == nil)
        #expect(Pace.ghost(Self.session { _ in }, against: Self.circuit([75]), blockOf: Self.inBlock) == nil)
    }

    @Test("compares straight sets set by set")
    func sets() {
        func sets(_ at: [Double]) -> SessionResult {
            Self.session { $0.steps = [StepResult(stepId: "pr", exerciseKey: "bench", sets: at.map { SetResult(reps: 8, load: 60, at: $0) })] }
        }
        #expect(Pace.ghost(sets([30, 150]), against: sets([35, 170, 300]))?.text == "Set 2 — 20 s ahead")
    }

    @Test("leaves the sets of a block with round splits to the rounds")
    func roundsOnly() {
        #expect(Pace.marks(Self.circuit([70]), blockOf: Self.inBlock).map(\.key) == ["round:b:0"])
    }

    @Test("lastTimed is the newest session of this workout with times")
    func lastTimed() {
        let untimed = Self.session {
            $0.startedAt = "2026-09-25T10:00:00Z"
            $0.steps = [StepResult(stepId: "sw", exerciseKey: "kb", sets: [SetResult(reps: 10)])]
        }
        let old = Self.circuit([80], startedAt: "2026-09-10T10:00:00Z")
        let newer = Self.circuit([75], startedAt: "2026-09-20T10:00:00Z")
        var other = Self.circuit([60], startedAt: "2026-09-26T10:00:00Z")
        other.runsheetId = "x"
        #expect(Pace.lastTimed([old, untimed, other, newer], runsheetId: "w") == newer)
        var mine = old
        mine.id = "me"
        #expect(Pace.lastTimed([mine], runsheetId: "w", excluding: "me") == nil)
    }

    @Test("the Lock Screen gets the short form, and none once done")
    func activity() {
        let s = Runner.tick(Runner.start(Fixtures.interval(), now: 0), now: 5_000)
        let state = SessionRunner.activityState(s, runsheet: Fixtures.interval(), now: 6_000, ghost: "Round 2 · 12 s ahead")
        #expect(state.ghost == "Round 2 · 12 s ahead")
        let done = Runner.finish(s, now: 10_000)
        #expect(SessionRunner.activityState(done, runsheet: Fixtures.interval(), now: 10_000, ghost: "x").ghost == nil)
        #expect(SessionRunner.activityState(s, runsheet: Fixtures.interval(), now: 6_000).ghost == nil)
    }
}
