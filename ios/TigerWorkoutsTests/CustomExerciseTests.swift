import Foundation
import Testing
@testable import TigerWorkouts

/// A machine the catalogue does not have: made on the phone, it has to behave like a bundled one
/// and arrive on the web in the shape the web writes.
@Suite("your own exercises")
struct CustomExerciseTests {
    @Test("the key and step follow the web picker")
    func keyAndStep() {
        let e = LibraryExercise.custom(name: "  Hammer Strength chest press ", unit: "kg", group: .barbell)
        #expect(e.key == "u_hammer_strength_chest_press")
        #expect(e.name == "Hammer Strength chest press")
        #expect(e.step == 2.5)
        #expect(e.isCustom)
        #expect(LibraryExercise.custom(name: "Assault bike", unit: "kph", group: .bike).step == 0.5)
        #expect(LibraryExercise.custom(name: "Muscle-up!", unit: "", group: .body).key == "u_muscle_up")
        #expect(LibraryExercise.custom(name: "Muscle-up!", unit: "", group: .body).step == 1)
    }

    @Test("it encodes the fields the web reads, and reads a web row back")
    func roundTrip() throws {
        let e = LibraryExercise.custom(name: "Pec deck", unit: "kg", group: .barbell)
        let obj = try #require(try JSONSerialization.jsonObject(with: JSONEncoder().encode(e)) as? [String: Any])
        #expect(obj["key"] as? String == "u_pec_deck")
        #expect(obj["unit"] as? String == "kg")
        #expect(obj["group"] as? String == "barbell")
        #expect(obj["step"] as? Double == 2.5)

        // What `sync.ts` upserts: the key column plus the exercise as `data`.
        let rows = #"[{"key":"u_sled_push","data":{"key":"u_sled_push","name":"Sled push","unit":"kg","step":10,"group":"gym","cue":""}}]"#
        let decoded = Supabase.decodeExercises(Data(rows.utf8))
        #expect(decoded.map(\.name) == ["Sled push"])
        #expect(decoded.first?.group == .gym)
        #expect(decoded.first?.step == 10)
    }

    @Test("added to the library it is found by name, group and alternatives, and never replaces a bundled one")
    func library() {
        let library = Library.shared
        let machine = LibraryExercise.custom(name: "Hammer Strength chest press", unit: "kg", group: .barbell)
        library.addCustom([machine, LibraryExercise(key: "bb_bench", name: "Not the bench")])
        #expect(library.name(machine.key) == "Hammer Strength chest press")
        #expect(library.group(machine.key) == .barbell)
        #expect(library.name("bb_bench") == "Barbell bench press")

        let bench = library.exercise("db_bench")!
        let step = ExerciseStep(id: "s1", exercise: bench.ref, target: 20, forMode: .reps, forValue: 8)
        #expect(Alternatives.options(for: step, limit: 50).map(\.exercise.key).contains(machine.key))

        // Health types the workout from the group, which comes from the library.
        let result = SessionResult(runsheetId: "w", title: "Push", startedAt: ISO8601.string(Date()), durationSec: 600,
                                   steps: [StepResult(stepId: "a", exerciseKey: machine.key, target: 40, incline: nil, reps: [10], success: nil)])
        #expect(EffortModel.workedFrom(result, runsheet: nil).first?.group == .barbell)
    }
}
