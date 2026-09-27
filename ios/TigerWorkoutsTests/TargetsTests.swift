import Foundation
import Testing
@testable import TigerWorkouts

/// Ported one for one from `src/features/runsheet/targets.test.ts`.
@Suite("targets")
struct TargetsTests {
    static let kb = ExerciseRef(key: "kb_swing", name: "Kettlebell swings", unit: "kg", step: 4)
    static let bench = ExerciseRef(key: "bb_bench", name: "Bench press", unit: "kg", step: 2.5)
    static let pushup = ExerciseRef(key: "bw_pushup", name: "Push-ups", unit: "", step: 1)

    static func step(_ ex: ExerciseRef, target: Double? = 24, forValue: Double = 8, forMode: ForMode = .reps, _ tweak: (inout ExerciseStep) -> Void = { _ in }) -> ExerciseStep {
        var s = ExerciseStep(id: "s-\(ex.key)", exercise: ex, target: target, forMode: forMode, forValue: forValue)
        tweak(&s)
        return s
    }

    static func block(mode: BlockMode? = nil, repeatCount: Int = 3, timeCapSec: Double? = nil, steps: [ExerciseStep] = [step(kb)]) -> Item {
        .block(Block(id: "b1", name: "Main", repeatCount: repeatCount, mode: mode, steps: steps.map { .exercise($0) }, timeCapSec: timeCapSec))
    }

    static func sheet(_ items: [Item], id: String = "w") -> Runsheet { Runsheet(id: id, title: "Work", items: items) }

    static func scored(_ day: Int, _ score: Double, completed: Bool = true, runsheetId: String = "w") -> SessionResult {
        SessionResult(runsheetId: runsheetId, title: nil, startedAt: String(format: "2026-09-%02dT10:00:00Z", day), completed: completed, score: score, id: "r\(day)")
    }

    static func sets(_ load: Double?, _ reps: Double...) -> [SetResult] { reps.map { SetResult(reps: $0, load: load) } }

    // MARK: density

    let amrap = sheet([block(mode: .amrap, repeatCount: 1, timeCapSec: 600)])
    let history = [scored(1, 6), scored(8, 7), scored(15, 7), scored(22, 8)]

    @Test("aims at the best of the last three rounds, in the workout's own terms")
    func rounds() throws {
        let t = try #require(Targets.score(amrap, results: history))
        #expect(t.text == "Aim for 8+ rounds")
        #expect(t.detail == "Last 3 times: 7, 7, 8 rounds")
        #expect(t.pace == 75)
    }

    @Test("scales with intent: restore holds the middle, overreach adds a round")
    func intent() {
        #expect(Targets.score(amrap, results: history, intent: .restore)?.aim == 7)
        #expect(Targets.score(amrap, results: history, intent: .overreach)?.aim == 9)
    }

    @Test("reads a part round as reps and aims to finish the round")
    func partRound() throws {
        let t = try #require(Targets.score(amrap, results: [Self.scored(1, 7.005)]))
        #expect(t.detail == "Last time: 7+5 rounds")
        #expect(t.aim == 8)
    }

    @Test("times aim under the best finished run, and a stopped run does not count")
    func times() throws {
        let fortime = Self.sheet([Self.block(mode: .fortime, repeatCount: 5)])
        let t = try #require(Targets.score(fortime, results: [Self.scored(1, 730), Self.scored(8, 715), Self.scored(15, 700), Self.scored(20, 500, completed: false)]))
        #expect(t.text == "Finish in under 11:40")
        #expect(t.detail == "Last 3 times: 12:10, 11:55, 11:40")
        #expect(t.pace == 140)
        #expect(Targets.score(fortime, results: [Self.scored(1, 700)], intent: .overreach)?.aim == 680)
    }

    @Test("is nothing for an unscored workout or one with no scored history")
    func nothing() {
        #expect(Targets.score(Self.sheet([Self.block()]), results: history) == nil)
        #expect(Targets.score(amrap, results: [Self.scored(1, 8, runsheetId: "other")]) == nil)
    }

    // MARK: load × reps

    @Test("banks reps until the set at the next bell is no harder")
    func bankTop() {
        // 28 × 8 by Epley is 24 × 14.3: bank to 15 at 24 kg before the jump.
        #expect(Targets.bankTop(load: 24, step: 4, reps: 8) == 15)
        #expect(Targets.bankTop(load: 60, step: 2.5, reps: 5) == 7)
        #expect(Targets.bankTop(load: 4, step: 4, reps: 8) == 16) // never past double
    }

    @Test("adds a rep a set at the current load while banking")
    func banking() throws {
        let t = try #require(Targets.set(Self.step(Self.kb), last: Self.sets(24, 9, 9, 8)))
        #expect(t.text == "24 kg × 10, 10, 9")
        #expect(!t.jump)
        #expect(t.reason == "bank reps: 28 kg once every set reaches 15")
    }

    @Test("jumps a bell once every set reached the top, back to the bottom of the range")
    func jump() throws {
        let t = try #require(Targets.set(Self.step(Self.kb) { $0.forMax = 12 }, last: Self.sets(24, 12, 12, 12)))
        #expect(t.load == 28 && t.reps == [8, 8, 8] && t.jump && t.text == "28 kg × 8")
    }

    @Test("does not bank past the top of a range")
    func ceiling() {
        #expect(Targets.set(Self.step(Self.kb) { $0.forMax = 12 }, last: Self.sets(24, 12, 11, 12))?.reps == [12, 12, 12])
    }

    @Test("reads the working sets at the top load, not warm-ups")
    func working() {
        #expect(Targets.set(Self.step(Self.bench, forValue: 5), last: Self.sets(40, 10) + Self.sets(60, 5, 5))?.text == "60 kg × 6")
    }

    @Test("restore repeats last time; overreach adds two")
    func intents() {
        #expect(Targets.set(Self.step(Self.kb) { $0.forMax = 12 }, last: Self.sets(24, 12, 12), intent: .restore)?.text == "24 kg × 12")
        #expect(Targets.set(Self.step(Self.kb), last: Self.sets(24, 9, 8), intent: .overreach)?.text == "24 kg × 11, 10")
    }

    @Test("bodyweight gets reps")
    func bodyweight() {
        #expect(Targets.set(Self.step(Self.pushup, target: nil), last: Self.sets(nil, 12, 10))?.text == "13, 11 reps")
    }

    @Test("leaves alone what it should not move")
    func leavesAlone() {
        #expect(Targets.set(Self.step(Self.kb), last: nil) == nil)
        #expect(Targets.set(Self.step(Self.kb) { $0.targetPct = 70 }, last: Self.sets(24, 8)) == nil)
        #expect(Targets.set(Self.step(Self.kb) { $0.sets = [SetPlan(load: 20), SetPlan(load: 24)] }, last: Self.sets(24, 8)) == nil)
        #expect(Targets.set(Self.step(Self.kb, forMode: .seconds), last: Self.sets(24, 8)) == nil)
        #expect(Targets.set(Self.step(ExerciseRef(key: "sprint", name: "Sprints", unit: "kph", step: 0.5)), last: Self.sets(14, 1)) == nil)
    }

    // MARK: where it shows

    let s = step(kb)
    var strength: Runsheet { Self.sheet([Self.block(steps: [s])]) }
    var done: SessionResult {
        SessionResult(runsheetId: "w", title: nil, startedAt: "2026-09-20T10:00:00Z",
                      steps: [StepResult(stepId: s.id, exerciseKey: "kb_swing", sets: Self.sets(24, 9, 9, 8))], id: "r1")
    }

    @Test("today names the exercise and the sets when the workout is not scored")
    func today() {
        #expect(Targets.today(strength, results: [done])?.text == "Kettlebell swings 24 kg × 10, 10, 9")
    }

    @Test("the timer shows the set for the round it is on")
    func timer() {
        let t = Targets.today(strength, results: [done])
        #expect(Targets.timer(t, blockId: "b1", stepId: s.id, round: 2, runsheet: strength) == "Target 24 × 9")
        #expect(Targets.timer(Targets.today(amrap, results: [Self.scored(1, 8)]), blockId: "b1", stepId: s.id, round: 0, runsheet: amrap) == "Target 8+ · 1:15 a round")
    }

    @Test("next time reads the session just done as the newest, and stands aside for programme rules")
    func nextTime() {
        var now = done
        now.id = "r2"
        now.startedAt = "2026-09-27T10:00:00Z"
        now.steps = [StepResult(stepId: s.id, exerciseKey: "kb_swing", sets: Self.sets(24, 10, 10, 10))]
        #expect(Targets.nextTime(strength, done: now, history: [done]).map(\.text) == ["24 kg × 11"])
        #expect(Targets.nextTime(strength, done: now, history: [done], covered: ["kb_swing"]).isEmpty)
    }
}
