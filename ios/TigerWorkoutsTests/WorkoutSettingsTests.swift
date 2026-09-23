import Foundation
import Testing
@testable import TigerWorkouts

/// Mirrors src/features/runsheet/settings.test.ts and the settings half of last-used.test.ts.
@Suite("settings or a new setup")
struct WorkoutSettingsTests {
    static let row = ExerciseRef(key: "cardio_rower", name: "Rowing machine", unit: "", step: 1)
    static let t = "2026-09-23T08:00:00.000Z"

    /// A block of swings, rest, press ×8, then a loose row.
    static func sheet() -> Runsheet {
        Runsheet(id: "fran", title: "Swings & press", items: [
            .block(Block(id: "b1", name: "Pair", repeatCount: 8, steps: [
                Fixtures.work("e1", Fixtures.swing, target: 24, forMode: .reps, forValue: 15),
                Fixtures.rest("r1", 30),
                Fixtures.work("e2", Fixtures.press, target: 15, forMode: .reps, forValue: 10),
            ])),
            .step(Fixtures.work("e3", row, forMode: .seconds, forValue: 60)),
        ])
    }

    static func block(_ r: Runsheet) -> Block { r.items[0].asBlock! }

    @Test("numbers only are settings: weight, reps, rest, rounds, incline")
    func numbers() {
        let r = Self.sheet()
        #expect(Settings.classify(r, Edit.updateStep(r, id: "e2") { $0.target = 17.5 }) == .settings)
        #expect(Settings.classify(r, Edit.updateStep(r, id: "e1") { $0.forValue = 20 }) == .settings)
        #expect(Settings.classify(r, Edit.updateRest(r, id: "r1", seconds: 20)) == .settings)
        #expect(Settings.classify(r, Edit.updateBlock(r, id: "b1") { $0.repeatCount = 6 }) == .settings)
        #expect(Settings.classify(r, Edit.updateStep(r, id: "e3") { $0.incline = 2 }) == .settings)
    }

    @Test("adding, removing, reordering, swapping and renaming are a new setup")
    func structure() {
        let r = Self.sheet()
        #expect(Settings.classify(r, Edit.removeStep(r, stepId: "e3")) == .structure)
        #expect(Settings.classify(r, Edit.moveSteps(r, in: "b1", from: [2], to: 0)) == .structure)
        #expect(Settings.classify(r, Edit.addRest(r, to: nil)) == .structure)
        var swapped = r
        swapped.items[1] = .step(Fixtures.work("e3", ExerciseRef(key: "bike", name: "Bike", unit: "", step: 1), forMode: .seconds, forValue: 60))
        #expect(Settings.classify(r, swapped) == .structure)
        var renamed = r
        renamed.title = "Renamed"
        #expect(Settings.classify(r, renamed) == .structure)
    }

    @Test("an unchanged workout is no edit")
    func unchanged() {
        #expect(Settings.classify(Self.sheet(), Self.sheet()) == .none)
    }

    @Test("records only what changed, by step and block id")
    func change() {
        let r = Self.sheet()
        let next = Edit.updateBlock(Edit.updateStep(r, id: "e2") { $0.target = 17.5 }, id: "b1") { $0.repeatCount = 6 }
        let c = Settings.change(r, next)
        #expect(c.steps == ["e2": StepSetting(target: 17.5)])
        #expect(c.blocks == ["b1": BlockSetting(repeatCount: 6)])
    }

    @Test("settings apply on top of the original and leave it untouched")
    func apply() {
        let r = Self.sheet()
        let ws = Settings.with(nil, SettingsChange(steps: ["e2": StepSetting(target: 17.5), "r1": StepSetting(seconds: 20)], blocks: ["b1": BlockSetting(repeatCount: 6)]), at: Self.t)
        let out = Settings.apply(r, ws)
        #expect(Self.block(out).repeatCount == 6)
        #expect(Self.block(out).steps[1] == Fixtures.rest("r1", 20))
        #expect(Self.block(out).steps[2].asExercise?.target == 17.5)
        #expect(Self.block(out).steps[2].asExercise?.forValue == 10)
        #expect(Self.block(r).steps[2].asExercise?.target == 15)
        #expect(Self.block(r).repeatCount == 8)
    }

    @Test("a second change keeps the first")
    func secondChange() {
        let one = Settings.with(nil, SettingsChange(steps: ["e2": StepSetting(target: 17.5)]), at: Self.t)
        let two = Settings.with(one, SettingsChange(steps: ["e2": StepSetting(forValue: 8)]), at: "2026-09-24T08:00:00.000Z")
        #expect(two.steps["e2"] == StepSetting(target: 17.5, forValue: 8, at: "2026-09-24T08:00:00.000Z"))
        #expect(two.updatedAt == "2026-09-24T08:00:00.000Z")
    }

    @Test("reset to original leaves an empty entry that still wins the merge")
    func reset() {
        let reset = Settings.cleared(at: Self.t)
        #expect(!reset.hasAny)
        #expect(Settings.apply(Self.sheet(), reset) == Self.sheet())
        let older = Settings.with(nil, SettingsChange(steps: ["e2": StepSetting(target: 17.5)]), at: "2026-09-20T08:00:00.000Z")
        #expect(Settings.merge(["fran": older], ["fran": reset])["fran"] == reset)
    }

    @Test("two devices merge per workout, newest write wins")
    func merge() {
        let a = ["fran": Settings.with(nil, SettingsChange(steps: ["e2": StepSetting(target: 17.5)]), at: "2026-09-20T08:00:00.000Z"), "cindy": Settings.cleared(at: Self.t)]
        let b = ["fran": Settings.with(nil, SettingsChange(steps: ["e2": StepSetting(target: 20)]), at: "2026-09-21T08:00:00.000Z")]
        #expect(Settings.merge(a, b)["fran"]?.steps["e2"]?.target == 20)
        #expect(Settings.merge(a, b)["cindy"] == a["cindy"])
        #expect(Settings.merge(b, a)["fran"]?.steps["e2"]?.target == 20)
    }

    @Test("settings written by the web app decode, and round-trip")
    func webShape() throws {
        let json = #"{"fran":{"updatedAt":"2026-09-23T08:00:00.000Z","steps":{"e2":{"target":17.5,"at":"2026-09-23T08:00:00.000Z"},"r1":{"seconds":20,"at":"2026-09-23T08:00:00.000Z"}},"blocks":{"b1":{"repeat":6}}}}"#
        let decoded = PrefsSettings.decode(try JSONSerialization.jsonObject(with: Data(json.utf8)))
        #expect(decoded["fran"]?.steps["e2"]?.target == 17.5)
        #expect(decoded["fran"]?.blocks["b1"]?.repeatCount == 6)
        #expect(PrefsSettings.decode(try PrefsSettings.encode(decoded)) == decoded)
    }
}

@Suite("saved settings against what you used last time")
struct SettingsPrecedenceTests {
    static func settings(_ at: String, _ target: Double) -> WorkoutSettings {
        WorkoutSettings(updatedAt: at, steps: ["e2": StepSetting(target: target, at: at)])
    }

    static func session(_ runsheetId: String, _ at: String, _ stepId: String, _ target: Double) -> SessionResult {
        SessionResult(runsheetId: runsheetId, title: nil, startedAt: at,
                      steps: [StepResult(stepId: stepId, exerciseKey: "db_incline_press", target: target, incline: nil, reps: nil, success: true)])
    }

    static func press(_ r: Runsheet) -> Double? { WorkoutSettingsTests.block(r).steps[2].asExercise?.target }

    @Test("a setting beats a session done before it was saved")
    func settingWins() {
        let out = Settings.withLastUsed(WorkoutSettingsTests.sheet(), results: [Self.session("fran", "2026-09-10T10:00:00.000Z", "e2", 20)], settings: Self.settings("2026-09-12T08:00:00.000Z", 22.5))
        #expect(Self.press(out) == 22.5)
    }

    @Test("a session of this workout done after the setting moves the number on")
    func newerSessionWins() {
        let out = Settings.withLastUsed(WorkoutSettingsTests.sheet(), results: [Self.session("fran", "2026-09-14T10:00:00.000Z", "e2", 25)], settings: Self.settings("2026-09-12T08:00:00.000Z", 22.5))
        #expect(Self.press(out) == 25)
    }

    @Test("a newer session of a different workout never overrides a setting")
    func otherWorkoutLoses() {
        let out = Settings.withLastUsed(WorkoutSettingsTests.sheet(), results: [Self.session("other", "2026-09-14T10:00:00.000Z", "x9", 30)], settings: Self.settings("2026-09-12T08:00:00.000Z", 22.5))
        #expect(Self.press(out) == 22.5)
    }

    @Test("a step from another workout that shares its id is not taken")
    func sharedIdsDoNotLeak() {
        var s = Self.session("someone-else", "2026-09-10T10:00:00.000Z", "e2", 32)
        s.steps[0].exerciseKey = "kb_curl"
        let out = Settings.withLastUsed(WorkoutSettingsTests.sheet(), results: [s])
        #expect(Self.press(out) == 15)
    }

    @Test("reps, rests and rounds come from the settings")
    func countsFromSettings() {
        let ws = WorkoutSettings(updatedAt: WorkoutSettingsTests.t, steps: ["e2": StepSetting(forValue: 45, at: WorkoutSettingsTests.t), "r1": StepSetting(seconds: 20, at: WorkoutSettingsTests.t)], blocks: ["b1": BlockSetting(repeatCount: 6)])
        let out = Settings.withLastUsed(WorkoutSettingsTests.sheet(), results: [], settings: ws)
        let b = WorkoutSettingsTests.block(out)
        #expect(b.repeatCount == 6)
        #expect(b.steps[1] == Fixtures.rest("r1", 20))
        #expect(b.steps[2].asExercise?.forValue == 45)
        #expect(b.steps[2].asExercise?.target == 15)
    }
}

@Suite("workout rows")
struct WorkoutRowTests {
    @Test("a new workout goes up without a visibility, so the column's private default applies")
    func newIsPrivate() throws {
        var r = Runsheet(id: "u-1", title: "Mine")
        #expect(try WorkoutRowCodec.encode(r, owner: "o")["public"] == nil)
        r.isPublic = false
        #expect(try WorkoutRowCodec.encode(r, owner: "o")["public"] as? Bool == false)
        r.isPublic = true
        let row = try WorkoutRowCodec.encode(r, owner: "o")
        #expect(row["public"] as? Bool == true)
        #expect((row["data"] as? [String: Any])?["public"] as? Bool == true)
    }

    @Test("reads visibility from the column, not the copy inside data")
    func columnWins() {
        let row: [String: Any] = ["id": "u-1", "public": false, "data": ["title": "Mine", "items": [], "public": true]]
        #expect(WorkoutRowCodec.decode(row, decoder: JSONDecoder())?.isPublic == false)
    }
}
