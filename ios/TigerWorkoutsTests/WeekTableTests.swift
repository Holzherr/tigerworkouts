import Foundation
import Testing
@testable import TigerWorkouts

@Suite("week table")
struct WeekTableTests {
    static let hip = ExerciseRef(key: "bb_hip_thrust", name: "Hip thrust", unit: "kg", step: 2.5)
    static let press = ExerciseRef(key: "db_shoulder_press", name: "Shoulder press", unit: "kg per arm", step: 2.5)

    static func sheet(_ id: String, duplicateOf: String? = nil, copyOf: String? = nil) -> Runsheet {
        var r = Runsheet(id: id, title: id, items: [.block(Block(id: "b1", name: "Main", repeatCount: 3, steps: [
            .exercise(ExerciseStep(id: "s1", exercise: hip, target: 100, forMode: .reps, forValue: 8)),
            .exercise(ExerciseStep(id: "s2", exercise: press, target: 12.5, forMode: .reps, forValue: 8)),
        ]))])
        r.duplicateOf = duplicateOf
        r.copyOf = copyOf
        return r
    }

    static func session(_ date: String, _ runsheetId: String, hip: [(Double, Double)], press: [(Double, Double)] = []) -> SessionResult {
        var steps = [StepResult(stepId: "s1", exerciseKey: "bb_hip_thrust", sets: hip.map { SetResult(reps: $0.1, load: $0.0) })]
        if !press.isEmpty { steps.append(StepResult(stepId: "s2", exerciseKey: "db_shoulder_press", sets: press.map { SetResult(reps: $0.1, load: $0.0) })) }
        return SessionResult(runsheetId: runsheetId, title: nil, startedAt: "\(date)T10:00:00Z", steps: steps, id: "\(runsheetId)@\(date)")
    }

    static func table(_ r: Runsheet, _ results: [SessionResult], _ workouts: [Runsheet]) -> WeekTable.Table {
        WeekTable.table(r, results: results, workouts: workouts, name: { $0 }, unit: { $0 == "db_shoulder_press" ? "kg per arm" : "kg" })
    }

    @Test("follows duplicates both ways and edited copies, and nothing else")
    func family() {
        let w1 = Self.sheet("w1")
        let w2 = Self.sheet("w2", duplicateOf: "w1")
        let w3 = Self.sheet("w3", duplicateOf: "w2")
        let other = Self.sheet("other")
        let copy = Self.sheet("c1", copyOf: "w1")
        let all = [w1, w2, w3, other, copy]
        #expect(WeekTable.family(w3, in: all) == ["w1", "w2", "w3"])
        #expect(WeekTable.family(w1, in: all) == ["w1", "w2", "w3"])
        #expect(WeekTable.family(copy, in: all) == ["c1", "w1", "w2", "w3"])
        #expect(WeekTable.family(other, in: all) == ["other"])
    }

    @Test("a column per session, weeks counted from the first, the newest marked latest")
    func columns() {
        let w1 = Self.sheet("w1")
        let w2 = Self.sheet("w2", duplicateOf: "w1")
        // Mon 2 Nov 2026, Wed 4 Nov (same week), Mon 9 Nov, Sun 22 Nov.
        let results = [
            Self.session("2026-11-02", "w1", hip: [(100, 8)]),
            Self.session("2026-11-04", "w1", hip: [(100, 8)]),
            Self.session("2026-11-09", "w2", hip: [(105, 8)]),
            Self.session("2026-11-22", "w2", hip: [(105, 9)]),
            Self.session("2026-11-10", "elsewhere", hip: [(200, 1)]),
        ]
        let t = Self.table(w2, results, [w1, w2])
        #expect(t.columns.map(\.label) == ["Wk 1", "Wk 1", "Wk 2", "Wk 3"])
        #expect(t.columns.map(\.latest) == [false, false, false, true])
    }

    @Test("rows are exercise × set in workout order; cells say what was done and what changed")
    func cells() throws {
        let w = Self.sheet("w")
        let results = [
            Self.session("2026-11-02", "w", hip: [(100, 8), (110, 4), (110, 4)], press: [(12.5, 8)]),
            Self.session("2026-11-09", "w", hip: [(105, 8), (110, 5), (105, 4)], press: [(12.5, 8)]),
        ]
        let t = Self.table(w, results, [w])
        #expect(t.rows.map(\.id) == ["bb_hip_thrust#0", "bb_hip_thrust#1", "bb_hip_thrust#2", "db_shoulder_press#0"])
        let set1 = try #require(t.rows[0].cells[1])
        #expect(set1.text == "105 × 8")
        #expect(set1.delta == "+5 kg")
        #expect(set1.better == true)
        #expect(t.rows[1].cells[1]?.delta == "+1 rep")
        #expect(t.rows[2].cells[1]?.delta == "−5 kg")
        #expect(t.rows[2].cells[1]?.better == false)
        #expect(t.rows[3].cells[1]?.delta == nil)
        #expect(t.rows[0].cells[0]?.delta == nil)
        #expect(t.rows[0].name == "Hip thrust")
    }

    @Test("a set missing in one week is a gap, and the next week compares with the last one that had it")
    func gaps() {
        let w = Self.sheet("w")
        let results = [
            Self.session("2026-11-02", "w", hip: [(100, 8), (110, 4)]),
            Self.session("2026-11-09", "w", hip: [(100, 8)]),
            Self.session("2026-11-16", "w", hip: [(100, 8), (112.5, 4)]),
        ]
        let t = Self.table(w, results, [w])
        #expect(t.rows[1].cells[1] == nil)
        #expect(t.rows[1].cells[2]?.delta == "+2.5 kg")
    }

    @Test("warm-ups are left out, and no history is an empty table")
    func warmups() {
        let w = Self.sheet("w")
        var r = Self.session("2026-11-02", "w", hip: [(100, 8)])
        var warm = SetResult(reps: 10, load: 60)
        warm.type = .warmup
        r.steps[0].sets = [warm] + (r.steps[0].sets ?? [])
        #expect(Self.table(w, [r], [w]).rows.count == 1)
        #expect(Self.table(w, [], [w]).isEmpty)
    }

    @Test("deltas in kg and reps together, and in metres")
    func deltas() {
        #expect(WeekTable.delta(from: SetResult(reps: 8, load: 100), to: SetResult(reps: 6, load: 110)).text == "+10 kg · −2 reps")
        var a = SetResult(reps: nil, load: nil); a.meters = 400
        var b = a; b.meters = 420
        #expect(WeekTable.delta(from: a, to: b).text == "+20 m")
    }
}
