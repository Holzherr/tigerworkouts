import Testing
@testable import TigerWorkouts

/// A workout wears the same colours on the phone as on the web. The reference values come from
/// running `hash()` in `src/features/workouts/icon.ts` itself.
@Suite("workout icon")
struct WorkoutIconTests {
    @Test("the hash matches the web app's, byte for byte")
    func hashParity() {
        #expect(WorkoutIcon.hash("cf-girls-fran") == 143_604_182)
        #expect(WorkoutIcon.hash("proto-tabata-this") == 2_001_117_116)
        // Non-ASCII punctuation is where a UTF-8 port would drift from JavaScript's UTF-16.
        #expect(WorkoutIcon.hash("Swings, incline press & sprints") == 2_924_709_820)
    }

    @Test("monograms read like the web's")
    func monograms() {
        #expect(WorkoutIcon.monogram("Swings, incline press & sprints") == "SI")
        #expect(WorkoutIcon.monogram("StrongLifts 5×5 A") == "S5")
        #expect(WorkoutIcon.monogram("Fran") == "F")
    }
}
