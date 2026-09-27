import Foundation
import Testing
@testable import TigerWorkouts

/// Ported one for one from `src/features/results/stall.test.ts` (the alternatives port is covered
/// by AlternativesTests).
@Suite("stalls")
struct StallTests {
    static let now = ISO8601.date("2026-09-27T12:00:00Z")!
    static func daysAgo(_ d: Double) -> String { ISO8601.string(now.addingTimeInterval(-d * 86_400)) }
    static let kb = ExerciseRef(key: "kb_goblet_squat", name: "Goblet squat", unit: "kg", step: 4)

    static func did(_ d: Double, _ key: String, _ sets: [SetResult]) -> SessionResult {
        SessionResult(runsheetId: "w", title: nil, startedAt: daysAgo(d), steps: [StepResult(stepId: "a", exerciseKey: key, sets: sets)], id: "r\(Int(d))")
    }

    static func x(_ load: Double?, _ reps: Double) -> SetResult { SetResult(reps: reps, load: load) }

    static func pts(_ vs: (Double, Double)...) -> [Stall.Point] { vs.map { Stall.Point(at: daysAgo($0.0), value: $0.1) } }

    // MARK: plateau

    @Test("is the record session and three or more after it, three weeks apart")
    func plateau() throws {
        let p = try #require(Stall.plateau(Self.pts((42, 28), (35, 30), (28, 30), (21, 29), (14, 30)), now: Self.now))
        #expect(p.sessions == 4 && p.weeks == 5 && p.index == 1)
    }

    @Test("a tie is not progress, a new best resets it")
    func newBest() {
        #expect(Stall.plateau(Self.pts((35, 30), (28, 30), (21, 30), (7, 31)), now: Self.now) == nil)
    }

    @Test("needs the sessions, the weeks and a recent session")
    func needs() {
        #expect(Stall.plateau(Self.pts((35, 30), (28, 29), (21, 29)), now: Self.now) == nil)
        #expect(Stall.plateau(Self.pts((14, 30), (10, 29), (7, 29), (3, 29)), now: Self.now) == nil)
        #expect(Stall.plateau(Self.pts((90, 30), (80, 29), (70, 29), (60, 29)), now: Self.now) == nil)
    }

    @Test("reads lower as better for a time")
    func lower() {
        #expect(Stall.plateau(Self.pts((35, 700), (28, 710), (21, 705), (14, 701)), now: Self.now, lowerIsBetter: true)?.sessions == 4)
    }

    // MARK: exercise stalls

    static let stuck = [
        did(35, kb.key, [x(24, 8), x(24, 8)]), did(28, kb.key, [x(24, 8), x(24, 7)]),
        did(21, kb.key, [x(24, 7)]), did(14, kb.key, [x(24, 8)]),
    ]

    @Test("names the best that stands and offers two ways out")
    func twoWays() throws {
        let s = try #require(Stall.exercise(Self.stuck, exercise: Self.kb, now: Self.now, swap: .init(key: "db_squat", name: "Dumbbell squat", target: 12, unit: "kg")))
        #expect(s.line == "At 24 kg × 8 for 5 weeks")
        #expect(s.options.map(\.title) == ["Drop to 20 kg and build to 12 reps", "Swap to Dumbbell squat for three weeks"])
        #expect(s.options[1].exerciseKey == "db_squat")
        #expect(s.options[1].detail == "Start around 12 kg. Then come back to Goblet squat.")
        #expect(s.id == "x:\(Self.kb.key)@\(Self.daysAgo(35))")
    }

    @Test("without an alternative the second way out is heavier for fewer reps")
    func heavier() {
        #expect(Stall.exercise(Self.stuck, exercise: Self.kb, now: Self.now)?.options[1].title == "Go heavier for three weeks: 28 kg × 5")
    }

    @Test("banking reps past 10 is progress, not a stall")
    func banking() {
        let banking = [Self.did(35, Self.kb.key, [Self.x(24, 10)]), Self.did(28, Self.kb.key, [Self.x(24, 11)]), Self.did(21, Self.kb.key, [Self.x(24, 12)]), Self.did(14, Self.kb.key, [Self.x(24, 13)])]
        #expect(Stall.exercise(banking, exercise: Self.kb, now: Self.now) == nil)
    }

    @Test("bodyweight stalls on reps")
    func bodyweight() throws {
        let pu = ExerciseRef(key: "bw_pushup", name: "Push-ups", unit: "", step: 1)
        let s = try #require(Stall.exercise([Self.did(35, pu.key, [Self.x(nil, 20)]), Self.did(28, pu.key, [Self.x(nil, 18)]), Self.did(21, pu.key, [Self.x(nil, 20)]), Self.did(14, pu.key, [Self.x(nil, 19)])], exercise: pu, now: Self.now))
        #expect(s.line == "At 20 reps for 5 weeks")
        #expect(s.options[0].title == "Do 5 sets of 12 for three weeks")
    }

    @Test("bodyweight reps that never vary are a circuit's count, not a stall")
    func prescribed() {
        let pu = ExerciseRef(key: "bw_pushup", name: "Push-ups", unit: "", step: 1)
        let same = [35.0, 28, 21, 14].map { Self.did($0, pu.key, [Self.x(nil, 10), Self.x(nil, 10)]) }
        #expect(Stall.exercise(same, exercise: pu, now: Self.now) == nil)
    }

    // MARK: workout stalls

    @Test("rounds that stopped going up get an even pace and a break")
    func workout() throws {
        let amrap = Runsheet(id: "cindy", title: "Cindy", items: [.block(Block(id: "b", name: "AMRAP", repeatCount: 1, mode: .amrap, timeCapSec: 1200))])
        func score(_ d: Double, _ s: Double) -> SessionResult {
            SessionResult(runsheetId: "cindy", title: nil, startedAt: Self.daysAgo(d), score: s, id: "c\(Int(d))")
        }
        let s = try #require(Stall.workout(amrap, results: [score(35, 14), score(28, 14), score(21, 13.01), score(14, 14)], now: Self.now))
        #expect(s.line == "At 14 rounds for 5 weeks")
        #expect(s.options[0].title == "Even pace: 1:20 a round")
        #expect(s.options[1].title.hasPrefix("Park it for three weeks, retest on "))
    }

    @Test("the swap comes from the alternatives data")
    func swapFromLibrary() {
        let key = "kb_goblet_squat"
        guard Library.shared.exercise(key) != nil else { return }
        let stuck = Self.stuck.map { r -> SessionResult in var r = r; r.startedAt = ISO8601.string(ISO8601.date(r.startedAt)!.addingTimeInterval(Date().timeIntervalSince(Self.now))); return r }
        let s = Stall.exercise(stuck, key: key)
        #expect(s?.options.count == 2)
    }
}
