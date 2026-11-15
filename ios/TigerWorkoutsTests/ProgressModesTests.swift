import Foundation
import Testing
@testable import TigerWorkouts

/// Progress by reps, weight or effort, and suggestions switched off (Priyanka via Nick, 15 Nov 2026).
@Suite("progress modes")
struct ProgressModesTests {
    static let bench = ExerciseRef(key: "bb_bench", name: "Bench press", unit: "kg", step: 2.5)
    static let pushup = ExerciseRef(key: "bw_pushup", name: "Push-ups", unit: "", step: 1)

    static func step(_ ex: ExerciseRef = bench, target: Double? = 60, forValue: Double = 8) -> ExerciseStep {
        ExerciseStep(id: "s-\(ex.key)", exercise: ex, target: target, forMode: .reps, forValue: forValue)
    }

    static func sets(_ load: Double?, _ reps: Double..., rpe: Double? = nil) -> [SetResult] {
        reps.map { var x = SetResult(reps: $0, load: load); x.rpe = rpe; return x }
    }

    static func sheet(id: String = "w", _ steps: [ExerciseStep] = [step()]) -> Runsheet {
        Runsheet(id: id, title: "Work", items: [.block(Block(id: "b1", name: "Main", repeatCount: 3, steps: steps.map { .exercise($0) }))])
    }

    static func session(_ day: Int, _ sets: [SetResult], runsheetId: String = "w", key: String = "bb_bench") -> SessionResult {
        SessionResult(runsheetId: runsheetId, title: nil, startedAt: String(format: "2026-10-%02dT10:00:00Z", day),
                      steps: [StepResult(stepId: "s-\(key)", exerciseKey: key, sets: sets)], id: "r\(day)")
    }

    // MARK: reps (unchanged default)

    @Test("reps mode is the default and matches the target without a mode")
    func repsDefault() {
        let last = Self.sets(60, 8, 8, 8)
        #expect(Targets.set(Self.step(), last: last) == Targets.set(Self.step(), last: last, mode: .reps))
        #expect(Targets.set(Self.step(), last: last)?.text == "60 kg × 9")
    }

    // MARK: weight

    @Test("weight keeps the plan's reps and adds a step once every set made them")
    func weightUp() throws {
        let t = try #require(Targets.set(Self.step(), last: Self.sets(60, 8, 8, 8), mode: .weight))
        #expect(t.text == "62.5 kg × 8")
        #expect(t.jump)
        #expect(t.reason == "8 reps at 60 kg on every set: up to 62.5 kg")
    }

    @Test("weight holds while a set fell short, and restore never moves")
    func weightHold() throws {
        let t = try #require(Targets.set(Self.step(), last: Self.sets(60, 8, 8, 6), mode: .weight))
        #expect(t.text == "60 kg × 8")
        #expect(!t.jump)
        #expect(t.reason == "hold 60 kg until every set makes 8")
        #expect(Targets.set(Self.step(), last: Self.sets(60, 8, 8, 8), intent: .restore, mode: .weight)?.text == "60 kg × 8")
    }

    @Test("weight on overreach adds two steps, snapped to the kit")
    func weightOverreach() {
        #expect(Targets.set(Self.step(), last: Self.sets(60, 8, 8, 8), intent: .overreach, mode: .weight)?.text == "65 kg × 8")
    }

    @Test("weight on a bodyweight lift banks reps as before")
    func weightBodyweight() {
        #expect(Targets.set(Self.step(Self.pushup, target: nil), last: Self.sets(nil, 10, 10), mode: .weight)?.text == "11 reps")
    }

    // MARK: effort

    @Test("effort keeps weight and reps until the RPE comes down, then adds a step at the same reps")
    func effort() throws {
        let hard = try #require(Targets.set(Self.step(), last: Self.sets(60, 8, 8, 7, rpe: 9), mode: .effort))
        #expect(hard.text == "60 kg × 8, 8, 7")
        #expect(!hard.jump)
        #expect(hard.reason == "RPE 9 last time: more weight once it is 7 or less")
        let easy = try #require(Targets.set(Self.step(), last: Self.sets(60, 8, 8, 8, rpe: 7), mode: .effort))
        #expect(easy.text == "62.5 kg × 8")
        #expect(easy.jump)
        #expect(easy.reason == "RPE 7 at 60 kg: up to 62.5 kg, same reps")
    }

    @Test("effort without an RPE holds and says how to get one; overreach moves at 8")
    func effortNoRPE() {
        #expect(Targets.set(Self.step(), last: Self.sets(60, 8, 8, 8), mode: .effort)?.reason == "same as last time · rate how hard it was at the finish")
        #expect(Targets.set(Self.step(), last: Self.sets(60, 8, 8, 8, rpe: 8), intent: .overreach, mode: .effort)?.jump == true)
        #expect(Targets.set(Self.step(), last: Self.sets(60, 8, 8, 8, rpe: 8), mode: .effort)?.jump == false)
    }

    @Test("effort on a bodyweight lift adds a rep once it felt easy")
    func effortBodyweight() {
        #expect(Targets.set(Self.step(Self.pushup, target: nil), last: Self.sets(nil, 10, 10, rpe: 6), mode: .effort)?.text == "11 reps")
        #expect(Targets.set(Self.step(Self.pushup, target: nil), last: Self.sets(nil, 10, 10, rpe: 9), mode: .effort)?.text == "10 reps")
    }

    // MARK: prefs

    @Test("an exercise's own mode wins over the account's")
    func perExercise() {
        let p = SuggestPrefs(mode: .weight).setting(exercise: "bb_bench", mode: .effort)
        #expect(p.mode(for: "bb_bench") == .effort)
        #expect(p.mode(for: "bb_squat") == .weight)
        #expect(SuggestPrefs().mode(for: "bb_bench") == .reps)
        #expect(p.setting(exercise: "bb_bench", mode: nil).exercises == nil)
        let r = Self.sheet()
        let history = [Self.session(1, Self.sets(60, 8, 8, 8))]
        #expect(Targets.sets(r, results: history, suggest: SuggestPrefs(mode: .weight)).first?.text == "62.5 kg × 8")
    }

    @Test("off for the account or the workout: no Today, no Next time, no stall")
    func off() {
        let r = Self.sheet()
        let history = [Self.session(1, Self.sets(60, 8, 8, 8))]
        #expect(Targets.today(r, results: history, suggest: SuggestPrefs()) != nil)
        #expect(Targets.today(r, results: history, suggest: SuggestPrefs(off: true)) == nil)
        let offHere = SuggestPrefs().setting(workout: r, on: false)
        #expect(Targets.today(r, results: history, suggest: offHere) == nil)
        #expect(Targets.nextTime(r, done: history[0], history: [], suggest: offHere).isEmpty)
        #expect(Stall.workout(r, results: history, suggest: SuggestPrefs(off: true)) == nil)
        #expect(Stall.exercise(history, key: "bb_bench", suggest: SuggestPrefs(off: true)) == nil)
        #expect(offHere.setting(workout: r, on: true).offWorkouts == nil)
    }

    @Test("a workout turned off stays off on its edited copy")
    func offLineage() {
        var copy = Self.sheet(id: "copy")
        copy.copyOf = "w"
        #expect(!SuggestPrefs(offWorkouts: ["w"]).on(for: copy))
        #expect(SuggestPrefs(offWorkouts: ["w"]).on(for: Self.sheet(id: "x")))
    }

    @Test("the setup question: once, only for a workout with a loaded lift; No turns suggestions off")
    func setup() {
        #expect(SuggestPrefs().shouldAsk(Self.sheet()))
        #expect(!SuggestPrefs().shouldAsk(Self.sheet(id: "bw", [Self.step(Self.pushup, target: nil)])))
        let no = SuggestPrefs().answered(yes: false)
        #expect(no.off == true && no.asked == true && !no.shouldAsk(Self.sheet()))
        let yes = SuggestPrefs().answered(yes: true, mode: .weight)
        #expect(yes.enabled && yes.mode == .weight && !yes.shouldAsk(Self.sheet()))
    }

    @Test("prefs JSON round-trips, tolerates unknown modes and fields, and the default writes nothing")
    func json() throws {
        #expect(SuggestPrefs().json == nil)
        let p = SuggestPrefs(off: nil, mode: .effort, asked: true, exercises: ["bb_dl": .weight], offWorkouts: ["w"])
        #expect(SuggestPrefs.from(json: p.json) == p)
        let odd: [String: Any] = ["mode": "tempo", "asked": true, "exercises": ["a": "weight", "b": "tempo"], "later": 1]
        let read = SuggestPrefs.from(json: odd)
        #expect(read.mode == nil && read.asked == true && read.exercises == ["a": .weight])
        #expect(SuggestPrefs.from(json: nil) == SuggestPrefs())
        let prefs = Supabase.prefs(from: ["suggestions": ["off": true]])
        #expect(prefs.suggestions.off == true)
    }

    @Test("a written prefs row keeps the stamps of fields this app does not know")
    func keepsStamps() {
        let m = PrefsMerge.merge(local: PrefsMerge.Side(values: ["suggestions": ["off": true]], updatedAt: ["suggestions": "2026-11-15T10:00:00.000Z"]),
                                 remote: PrefsMerge.Side())
        let row = PrefsMerge.row(existing: ["future": 1, "updatedAt": ["future": "2026-11-01T00:00:00.000Z", "saved": "2026-01-01T00:00:00.000Z"]], m)
        let stamps = row["updatedAt"] as? [String: String]
        #expect(stamps?["future"] == "2026-11-01T00:00:00.000Z")
        #expect(stamps?["suggestions"] == "2026-11-15T10:00:00.000Z")
        #expect(stamps?["saved"] == nil)
        #expect(row["future"] as? Int == 1)
    }

    @Test("per-lift RPE goes on every working set of that exercise, and a warm-up keeps none")
    func liftRPE() {
        var warm = SetResult(reps: 10, load: 40)
        warm.type = .warmup
        let r = Self.session(1, [warm] + Self.sets(60, 8, 8))
        let rated = LiftEffortCard.rated(r, key: "bb_bench", rpe: 8)
        #expect(rated.steps[0].sets?.map(\.rpe) == [nil, 8, 8])
        #expect(LiftEffortCard.value(rated, key: "bb_bench") == 8)
        #expect(LiftEffortCard.lifts(Self.sheet(), result: r, suggest: SuggestPrefs(mode: .effort)).map(\.key) == ["bb_bench"])
        #expect(LiftEffortCard.lifts(Self.sheet(), result: r, suggest: SuggestPrefs()).isEmpty)
    }

    @Test("Priyanka's week one: Today is the shoulder press at 27.5 × 8, the press starts on it, and off stops the prefill")
    @MainActor
    func seededWeekOne() throws {
        let store = Store()
        store.seedWeekOneIfAsked(["-seedWeekOne"])
        let sheet = try #require(store.workout(id: "seed-week1"))
        let today = try #require(Targets.today(store.prepared(sheet), results: store.results, kit: store.equipment, suggest: SuggestPrefs()))
        #expect(today.sets.map(\.exerciseKey) == ["db_shoulder_press"])
        #expect(today.sets.first?.load == 27.5)
        #expect(today.sets.first?.reps.first == 8)
        let on = try #require(store.seeded(sheet).exerciseSteps.first { $0.id == "seed-w1-press" })
        #expect(on.target == 27.5)
        // The player fills each press set with the target, reps too (a range's last time was 12).
        let run = store.prepared(store.seeded(sheet))
        let state = SessionRunner.prefilled(Runner.start(run, now: 0), runsheet: run, history: store.results,
                                            today: Targets.today(run, results: store.results, kit: store.equipment, suggest: SuggestPrefs()))
        let press = state.slots.filter { $0.kind == .work && $0.exercise?.id == "seed-w1-press" }
        #expect(press.map { state.actuals[$0.id]?.reps } == [8, 8, 8])
        #expect(run.exerciseSteps.first { $0.id == "seed-w1-press" }?.sets?.map(\.load) == [27.5, 27.5, 27.5])
        // Off, as Store.seeded builds it (not set on the store: its UserDefaults mirror is shared
        // with tests running alongside): last time's 25 kg carries over, no target prefill.
        let none = Targets.sets(sheet, results: store.results, kit: store.equipment, suggest: SuggestPrefs(off: true))
        #expect(none.isEmpty)
        let off = try #require(Settings.withLastUsed(sheet, results: store.results, targets: none).exerciseSteps.first { $0.id == "seed-w1-press" })
        #expect(off.target == 25)
    }

    @Test("an old set row without rpe still decodes")
    func setDecodes() throws {
        let x = try JSONDecoder().decode(SetResult.self, from: Data(#"{"reps":8,"load":60}"#.utf8))
        #expect(x.rpe == nil)
        let y = try JSONDecoder().decode(SetResult.self, from: Data(#"{"reps":8,"load":60,"rpe":7.5}"#.utf8))
        #expect(y.rpe == 7.5)
    }
}
