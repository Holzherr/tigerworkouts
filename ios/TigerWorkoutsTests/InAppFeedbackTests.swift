import Foundation
import Testing
@testable import TigerWorkouts

@Suite("In-app feedback")
struct InAppFeedbackTests {
    private func run() -> RunState {
        let ex = ExerciseRef(key: "bb_thruster", name: "Thrusters", unit: "kg", step: 2.5)
        let step = Step.exercise(ExerciseStep(id: "a", exercise: ex))
        let slot = Slot(id: "s1", kind: .work, step: step, seconds: nil, blockId: "b", blockName: "21-15-9", mode: .fortime, round: 1, rounds: 3, part: 0, parts: 1)
        var s = RunState(runsheetId: "fran", title: "Fran", slots: [slot], i: 0, phase: .running, startedAt: 1_000_000, slotStartedAt: 1_000_000)
        s.pausedMs = 10_000
        return s
    }

    @Test func contextCarriesUserScreenAndRun() throws {
        let c = InAppFeedback.context(user: AuthUser(id: "u1", email: "a@b.c"), screen: "timer", recentScreens: ["workouts", "timer"],
                                      run: run(), info: ["CFBundleShortVersionString": "1.2", "CFBundleVersion": "45"], now: Date(timeIntervalSince1970: 1_130))
        #expect((c["user"] as? [String: Any])?["id"] as? String == "u1")
        #expect((c["screen"] as? [String: Any])?["name"] as? String == "timer")
        let session = try #require(c["session"] as? [String: Any])
        #expect(session["workout_id"] as? String == "fran")
        #expect(session["step"] as? String == "Thrusters")
        #expect(session["block"] as? String == "21-15-9")
        #expect(session["elapsed_s"] as? Int == 120)
        #expect((c["app"] as? [String: Any])?["version"] as? String == "1.2 (45)")
        let json = String(decoding: try JSONSerialization.data(withJSONObject: InAppFeedback.payload(text: " hi ", context: c)), as: UTF8.self)
        #expect(!json.lowercased().contains("token"))
    }

    @Test func signedOutAndIdleSendNulls() {
        let c = InAppFeedback.context(user: nil, screen: "me", recentScreens: [], run: nil)
        #expect(c["user"] is NSNull)
        #expect(c["session"] is NSNull)
        #expect(InAppFeedback.payload(text: "  x  ", context: c)["text"] as? String == "x")
    }
}
