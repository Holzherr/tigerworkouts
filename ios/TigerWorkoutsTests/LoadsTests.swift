import Foundation
import Testing
@testable import TigerWorkouts

/// Ported from `plates.test.ts`, `set-types.test.ts` and the 'set types' suite in `runner.test.ts`.
@Suite("the weights you own")
struct PlatesTests {
    static let kb = ExerciseRef(key: "kb_goblet_squat", name: "Kettlebell goblet squat", unit: "kg", step: 4)
    static let bench = ExerciseRef(key: "bb_bench", name: "Barbell bench press", unit: "kg", step: 2.5)
    static let db = ExerciseRef(key: "db_bench", name: "Dumbbell bench press", unit: "kg per arm", step: 2.5)
    static let home = Equipment(
        barKg: 20,
        plates: [PlateCount(kg: 20, count: 2), PlateCount(kg: 10, count: 2), PlateCount(kg: 5, count: 2), PlateCount(kg: 2.5, count: 2)],
        dumbbells: [10, 12.5, 15, 20],
        kettlebells: [12, 16, 24, 32]
    )

    @Test("which kit: the key, then the group")
    func kit() {
        #expect(Plates.kit(key: "bb_bench") == .barbell)
        #expect(Plates.kit(key: "kb_swing") == .kettlebell)
        #expect(Plates.kit(key: "db_row") == .dumbbell)
        #expect(Plates.kit(key: "lat_raise", group: .dumbbell) == .dumbbell)
        #expect(Plates.kit(key: "machine_leg_press") == nil)
    }

    @Test("a bar is the bar plus a pair of each plate; bells default to 4 kg steps")
    func loads() {
        #expect(Plates.loads(.barbell, Self.home) == [20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95])
        #expect(Array(Plates.loads(.kettlebell, nil)!.prefix(7)) == [4, 8, 12, 16, 20, 24, 28])
        #expect(Plates.loads(.barbell, Equipment()) == nil)
        #expect(Plates.loads(.dumbbell, Equipment()) == nil)
    }

    @Test("snaps nearest, up and down")
    func snap() {
        #expect(Plates.snap(43, Self.bench, Self.home) == 45)
        #expect(Plates.snap(42.5, Self.bench, Self.home) == 40)
        #expect(Plates.snap(41, Self.bench, Self.home, .up) == 45)
        #expect(Plates.snap(44, Self.bench, Self.home, .down) == 40)
        #expect(Plates.snap(26.5, Self.kb, Self.home, .up) == 32)
        #expect(Plates.snap(26.5, Self.kb, nil, .up) == 28)
        #expect(Plates.snap(14, Self.db, Self.home) == 15)
        #expect(Plates.snap(61.3, Self.bench, nil) == 62.5)
        #expect(Plates.snap(200, Self.bench, Self.home) == 95)
        #expect(Plates.nextUp(24, Self.kb, Self.home) == 32)
        #expect(Plates.nextUp(32, Self.kb, Self.home) == nil)
        #expect(Plates.nextUp(60, Self.bench, nil) == 62.5)
    }

    @Test("the plate calculator: per side, heaviest first, closest when it cannot")
    func calculator() {
        let p = Plates.plates(for: 65, Self.home)
        #expect(p == Plates.Load(bar: 20, perSide: [20, 2.5], total: 65, exact: true))
        #expect(Plates.text(p) == "20 kg bar + 20 + 2.5 per side")
        #expect(Plates.text(Plates.plates(for: 100, nil)) == "20 kg bar + 2×20 per side")
        #expect(Plates.text(Plates.plates(for: 20, Self.home)) == "20 kg bar, no plates")
        let odd = Plates.plates(for: 67, Self.home)
        #expect(!odd.exact)
        #expect(odd.total == 65)
    }

    @Test("the target load jump is the next load owned")
    func targetJump() {
        var s = ExerciseStep(id: "s", exercise: Self.kb, target: 24, forMode: .reps, forValue: 8)
        s.forMax = 12
        let t = Targets.set(s, last: [SetResult(reps: 12, load: 24), SetResult(reps: 12, load: 24)], kit: Self.home)
        #expect(t?.load == 32)
        #expect(t?.jump == true)
        let top = Targets.set(s, last: [SetResult(reps: 12, load: 32)], kit: Self.home)
        #expect(top?.jump == false)
        #expect(top?.reason.contains("heaviest you own") == true)
    }

    @Test("a converted swap lands on a dumbbell you have")
    func swap() {
        let bb = LibraryExercise(key: "bb_bench", name: "Barbell bench press", unit: "kg", step: 2.5, group: .barbell)
        let dbb = LibraryExercise(key: "db_bench", name: "Dumbbell bench press", unit: "kg per arm", step: 2.5, group: .dumbbell)
        #expect(Alternatives.convert(40, from: bb, to: dbb, kit: Self.home) == 20)
        #expect(Alternatives.convert(30, from: bb, to: dbb, kit: Self.home) == 12.5)
        #expect(Alternatives.convert(60, from: bb, to: dbb) == 27.5)
    }

    @Test("equipment reads back from the web's prefs JSON")
    func prefs() throws {
        let json = try JSONSerialization.jsonObject(with: Data("""
        {"saved":["a"],"bodyweightKg":81.5,"trainingMaxes":{"bb_ohp":61},"equipment":{"barKg":15,"plates":[{"kg":10,"count":4}],"kettlebells":[16,24]},"name":"Nick"}
        """.utf8)) as! [String: Any]
        let p = Supabase.prefs(from: json)
        #expect(p.bodyweightKg == 81.5)
        #expect(p.trainingMaxes == ["bb_ohp": 61])
        #expect(p.equipment == Equipment(barKg: 15, plates: [PlateCount(kg: 10, count: 4)], kettlebells: [16, 24]))
    }
}

@Suite("relative loads and refs")
struct RelativeTests {
    static let ohp = ExerciseRef(key: "bb_ohp", name: "Barbell overhead press", unit: "kg", step: 2.5)

    @Test("a % of a training max resolves to a load the plates make, and × bodyweight to one near it")
    func resolve() {
        var s = ExerciseStep(id: "s", exercise: PlatesTests.bench, forMode: .reps, forValue: 5)
        s.targetPct = 65
        #expect(Relative.target(s, maxes: ["bb_bench": 100], bodyweightKg: nil, kit: PlatesTests.home) == 65)
        #expect(Relative.target(s, maxes: ["bb_bench": 90], bodyweightKg: nil, kit: PlatesTests.home) == 60)
        #expect(Relative.target(s, maxes: [:], bodyweightKg: nil, kit: nil) == nil)
        var o = ExerciseStep(id: "o", exercise: Self.ohp, forMode: .reps, forValue: 5)
        o.targetPct = 65
        #expect(Relative.target(o, maxes: ["bb_ohp": 61], bodyweightKg: nil, kit: nil) == 40)
        var bw = ExerciseStep(id: "b", exercise: PlatesTests.bench, forMode: .reps, forValue: 5)
        bw.loadFactor = 1.5
        #expect(Relative.target(bw, maxes: [:], bodyweightKg: 80, kit: nil) == 120)
    }

    @Test("resolved into target, so the grid shows a load column, labels kept")
    func grid() {
        var s = ExerciseStep(id: "s", exercise: PlatesTests.bench, forMode: .reps, forValue: 5)
        s.targetPct = 65
        #expect(!s.hasSetLoad)
        let r = Relative.resolve(Runsheet(title: "t", items: [.block(Block(id: "b", name: "B", repeatCount: 3, steps: [.exercise(s)]))]), maxes: ["bb_bench": 90], bodyweightKg: nil, kit: PlatesTests.home)
        let e = r.exerciseSteps[0]
        #expect(e.target == 60)
        #expect(e.targetPct == 65)
        #expect(e.hasSetLoad)
        #expect(Runner.effectiveTarget(Runner.start(r, now: 0), 0) == 60)
    }

    @Test("refs are inlined with the ref's role, unknown ones dropped, as resolveRefs does")
    func refs() {
        let warm = Runsheet(id: "warm", title: "Warm-up", items: [Fixtures.work("j", Fixtures.burpee).asItem, .step(Fixtures.rest("r", 10))])
        let main = Runsheet(id: "m", title: "Main", items: [
            .ref(RefItem(id: "x", runsheetId: "warm", role: .warmup)),
            .ref(RefItem(id: "y", runsheetId: "missing")),
            .block(Block(id: "b", name: "B", repeatCount: 2, steps: [Fixtures.work("p", Fixtures.pushup, forMode: .reps, forValue: 10)])),
        ])
        let r = Relative.resolveRefs(main) { $0 == "warm" ? warm : nil }
        #expect(r.items.map(\.id) == ["x:j", "x:r", "b"])
        #expect(r.items[0].role == .warmup)
        // Resolved, they run like any other item.
        let slots = Runner.expand(r)
        #expect(slots.first?.step.id == "x:j")
        #expect(slots.first?.parts == 3)
    }
}

@Suite("set types")
struct SetTypeTests {
    /// A warm-up at 40, two working sets at 60, then a drop set at 45 straight after the last.
    static func sheet() -> Runsheet {
        var step = ExerciseStep(id: "pr", exercise: Fixtures.press, target: 60, forMode: .reps, forValue: 8)
        step.sets = [SetPlan(load: 40, type: .warmup), SetPlan(load: 60), SetPlan(), SetPlan(load: 45, type: .drop)]
        return Runsheet(id: "t", title: "Types", items: [.block(Block(id: "b", name: "Bench", repeatCount: 4, steps: [.exercise(step), Fixtures.rest("r", 60)]))])
    }

    static func work(_ s: RunState) -> [String] { s.slots.filter { $0.kind == .work }.map(\.id) }

    @Test("numbers the work; W, D and F stand in for the rest")
    func marks() {
        #expect(SetType.marks([.warmup, nil, .normal, .drop, .failure, nil]) == ["W", "1", "2", "D", "F", "3"])
        #expect(SetType.normal.next == .warmup)
        #expect(SetType.warmup.next == .drop)
        #expect(SetType.drop.next == .failure)
        #expect(SetType.failure.next == .normal)
    }

    @Test("each set carries its planned type")
    func planned() {
        let s = Runner.start(Self.sheet(), now: 0)
        #expect(s.slots.indices.filter { s.slots[$0].kind == .work }.map { Runner.typeAt(s, $0) } == [.warmup, .normal, .normal, .drop])
    }

    @Test("no rest before a drop set")
    func dropRest() {
        var s = Runner.tick(Runner.start(Self.sheet(), now: 0), now: 5_000)
        s = Runner.advance(s, now: 10_000)
        #expect(s.slots[s.i].kind == .rest)
        s = Runner.advance(s, now: 20_000)
        s = Runner.advance(s, now: 30_000)
        s = Runner.advance(s, now: 40_000)
        s = Runner.advance(s, now: 50_000)
        #expect(s.slots[s.i].id == Self.work(s)[3])
        #expect(s.phase == .running)
    }

    @Test("a type changed on the grid counts, rest rule included")
    func changed() {
        var s = Runner.tick(Runner.start(Self.sheet(), now: 0), now: 5_000)
        s = Runner.setTypeAt(s, slotId: Self.work(s)[1], type: .drop)
        s = Runner.advance(s, now: 10_000)
        #expect(s.slots[s.i].id == Self.work(s)[1])
    }

    @Test("logs the type on each set; a warm-up stays out of the old target and reps fields")
    func logged() {
        var s = Runner.tick(Runner.start(Self.sheet(), now: 0), now: 5_000)
        var t = 10_000.0
        while s.phase != .done { s = Runner.advance(s, now: t); t += 10_000 }
        let row = Runner.toResult(s, Self.sheet(), now: 200_000).steps[0]
        #expect(row.sets?.map(\.type) == [.warmup, nil, nil, .drop])
        #expect(row.sets?.map(\.load) == [40, 60, 60, 45])
        #expect(row.reps == [8, 8, 8])
    }

    @Test("the editor keeps each set's type through an edit, and normal is left unset")
    func editor() {
        let r = Runsheet(title: "t", items: [.block(Block(id: "b", name: "B", repeatCount: 3, steps: [Fixtures.work("s", PlatesTests.bench, target: 60, forMode: .reps, forValue: 8)]))])
        let warm = Edit.editSet(r, block: "b", round: 0, load: 40, type: .warmup)
        let next = Edit.editSet(warm, block: "b", round: 2, reps: 6)
        #expect(next.exerciseSteps[0].sets?.map(\.type) == [.warmup, nil, nil])
        #expect(Edit.editSet(next, block: "b", round: 0, type: .normal).exerciseSteps[0].sets?[0].type == nil)
    }

    static func session(_ day: String, _ sets: [SetResult]) -> SessionResult {
        SessionResult(runsheetId: "w", title: "Push", startedAt: "\(day)T10:00:00Z",
                      steps: [StepResult(stepId: "a", exerciseKey: "bench", target: nil, incline: nil, reps: nil, success: nil, sets: sets)], id: "s-\(day)")
    }

    @Test("a warm-up is never a record, a best or volume")
    func records() {
        let all = [Self.session("2026-09-01", [SetResult(reps: 5, load: 60)]),
                   Self.session("2026-09-08", [SetResult(reps: 5, load: 100, type: .warmup), SetResult(reps: 5, load: 60)])]
        let latest = Logbook.history(all, exerciseKey: "bench")[0]
        #expect(latest.prs == [false, false])
        #expect(Logbook.records(all, exerciseKey: "bench").heaviest?.value == 60)
        #expect(Logbook.volume(latest.sets) == 300)
    }

    @Test("a stall reads the working sets only")
    func stall() {
        let days = ["2026-08-20", "2026-08-27", "2026-09-03", "2026-09-10", "2026-09-17"]
        let all = days.enumerated().map { i, d in Self.session(d, [SetResult(reps: 5, load: 20 + Double(i) * 10, type: .warmup), SetResult(reps: 5, load: 60)]) }
        let found = Stall.exercise(all, exercise: ExerciseRef(key: "bench", name: "Bench", unit: "kg", step: 2.5), now: ISO8601.date("2026-09-20T00:00:00Z")!)
        #expect(found?.best == "60 kg × 5")
    }

    @Test("targets skip warm-ups and drop sets, and so does the timer pill")
    func targets() {
        var s = ExerciseStep(id: "s", exercise: PlatesTests.bench, target: 60, forMode: .reps, forValue: 8)
        s.forMax = 10
        s.sets = [SetPlan(load: 40, type: .warmup), SetPlan(load: 60), SetPlan()]
        let t = Targets.set(s, last: [SetResult(reps: 8, load: 40, type: .warmup), SetResult(reps: 8, load: 60), SetResult(reps: 8, load: 60), SetResult(reps: 6, load: 45, type: .drop)])
        #expect(t?.text == "60 kg × 9")
        let today = Targets.Today(text: "", detail: "", score: nil, sets: t.map { [$0] } ?? [])
        let r = Runsheet(title: "t")
        #expect(Targets.timer(today, blockId: nil, stepId: "s", round: 0, runsheet: r, type: .warmup) == nil)
        #expect(Targets.timer(today, blockId: nil, stepId: "s", round: 1, runsheet: r, set: 0) == "Target 60 × 9")
    }

    @Test("effort counts neither warm-ups nor drop sets as sets, and leaves warm-ups out of the tonnage")
    func effort() {
        let r = Self.session("2026-09-01", [SetResult(reps: 10, load: 40, type: .warmup), SetResult(reps: 5, load: 60), SetResult(reps: 8, load: 40, type: .drop)])
        let worked = EffortModel.workedFrom(r, runsheet: nil)
        #expect(worked.count == 3)
        let e = EffortModel.effort(r, worked: worked, bodyweightKg: 80)
        #expect(e.sets == 1)
        #expect(e.tonnage == 60 * 5 + 40 * 8)
    }

    @Test("a result written by the web with set types decodes and encodes back")
    func codable() throws {
        let json = #"{"reps":8,"load":40,"type":"warmup"}"#
        let x = try JSONDecoder().decode(SetResult.self, from: Data(json.utf8))
        #expect(x.type == .warmup)
        let plan = try JSONDecoder().decode(SetPlan.self, from: Data(#"{"load":45,"type":"drop"}"#.utf8))
        #expect(plan.type == .drop)
        #expect(String(data: try JSONEncoder().encode(SetPlan(reps: 5)), encoding: .utf8)?.contains("type") == false)
    }
}

private extension Step {
    var asItem: Item { .step(self) }
}
