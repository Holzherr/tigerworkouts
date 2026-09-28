import Foundation
import Testing
@testable import TigerWorkouts

/// A record shown the moment a set is ticked, and the stepper's hold-to-speed-up.
@Suite("live records")
struct LiveRecordTests {
    private static func sheet(target: Double) -> Runsheet {
        Runsheet(id: "g", title: "Grid", items: [.block(Block(
            id: "b", name: "Press", repeatCount: 3,
            steps: [Fixtures.work("pr", Fixtures.press, target: target, forMode: .reps, forValue: 8), Fixtures.rest("r", 60)]
        ))])
    }

    private static func past(_ load: Double, day: Int) -> SessionResult {
        SessionResult(runsheetId: "g", title: "Grid", startedAt: String(format: "2026-09-%02dT10:00:00Z", day), steps: [
            StepResult(stepId: "pr", exerciseKey: Fixtures.press.key, target: load, incline: nil, reps: [8], success: true, sets: [SetResult(reps: 8, load: load)]),
        ])
    }

    private static func workIds(_ s: RunState) -> [String] { s.slots.filter { $0.kind == .work }.map(\.id) }

    @Test("a heavier set than any before is a record; the same load is not")
    func heavier() {
        let history = [Self.past(20, day: 1)]
        var s = Runner.tick(Runner.start(Self.sheet(target: 22.5), now: 0), now: 5_000)
        let first = Self.workIds(s)[0]
        s = Runner.completeSet(s, now: 20_000, slotId: first)
        #expect(SessionRunner.liveRecord(s, Self.sheet(target: 22.5), slotId: first, history: history, now: 20_000)?.load == 22.5)

        var same = Runner.tick(Runner.start(Self.sheet(target: 20), now: 0), now: 5_000)
        same = Runner.completeSet(same, now: 20_000, slotId: first)
        #expect(SessionRunner.liveRecord(same, Self.sheet(target: 20), slotId: first, history: history, now: 20_000) == nil)
    }

    @Test("the second set at a record load is not a second record")
    func secondSet() {
        let history = [Self.past(20, day: 1)]
        var s = Runner.tick(Runner.start(Self.sheet(target: 22.5), now: 0), now: 5_000)
        let ids = Self.workIds(s)
        s = Runner.completeSet(s, now: 20_000, slotId: ids[0])
        s = Runner.completeSet(s, now: 100_000, slotId: ids[1])
        #expect(SessionRunner.liveRecord(s, Self.sheet(target: 22.5), slotId: ids[1], history: history, now: 100_000) == nil)
    }

    @Test("the first time an exercise is done sets no record")
    func firstTime() {
        var s = Runner.tick(Runner.start(Self.sheet(target: 22.5), now: 0), now: 5_000)
        let first = Self.workIds(s)[0]
        s = Runner.completeSet(s, now: 20_000, slotId: first)
        #expect(SessionRunner.liveRecord(s, Self.sheet(target: 22.5), slotId: first, history: [], now: 20_000) == nil)
    }

    @Test("a set not done is never a record")
    func notDone() {
        let s = Runner.tick(Runner.start(Self.sheet(target: 30), now: 0), now: 5_000)
        #expect(SessionRunner.liveRecord(s, Self.sheet(target: 30), slotId: Self.workIds(s)[0], history: [Self.past(20, day: 1)], now: 6_000) == nil)
    }

    @Test("taps stay one step; a held button's repeats grow to two, then five")
    func accelerator() {
        var a = Accelerator()
        let t0 = Date(timeIntervalSince1970: 0)
        // A thumb tapping fast: 0.2 s apart.
        #expect((0..<10).map { a.factor(now: t0.addingTimeInterval(Double($0) * 0.2)) }.allSatisfy { $0 == 1 })
        var held = Accelerator()
        let steps = (0..<20).map { held.factor(now: t0.addingTimeInterval(Double($0) * 0.1)) }
        #expect(steps.prefix(6).allSatisfy { $0 == 1 })
        #expect(steps[6] == 2)
        #expect(steps[16] == 5)
    }
}
