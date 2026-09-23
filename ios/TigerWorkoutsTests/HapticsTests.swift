import SwiftUI
import Testing
@testable import TigerWorkouts

/// The simulator has no haptic hardware, so these prove the plumbing rather than the buzz: the
/// status says so, nothing crashes, and the button and the foreground handler call what they should.
@Suite("haptics")
struct HapticsTests {
    @Test("the simulator has no engine, and playing there is harmless")
    @MainActor
    func unsupportedOnSimulator() {
        #expect(Haptics.shared.status == .unsupported)
        Haptics.shared.play(.work)
        Haptics.shared.restart()
        #expect(Haptics.shared.status == .unsupported)
    }

    @Test("the status reads in words")
    func statusLabels() {
        #expect(Haptics.Status.ready.label == "ready")
        #expect(Haptics.Status.unsupported.label == "not on this device")
        #expect(Haptics.Status.stopped("audio session interrupted").label == "stopped — audio session interrupted")
    }

    @Test("Test buzz plays work, then the finish")
    @MainActor
    func testBuzzPlaysWorkThenFinish() async {
        var played: [Haptics.Cue] = []
        await MeView.testBuzz { played.append($0) }
        #expect(played == [.work, .finish])
    }

    @Test("coming to the foreground restarts the engine, and nothing else does")
    @MainActor
    func activeRestarts() {
        var restarts = 0
        RootView.scenePhaseChanged(to: .background, restart: { restarts += 1 })
        RootView.scenePhaseChanged(to: .inactive, restart: { restarts += 1 })
        #expect(restarts == 0)
        RootView.scenePhaseChanged(to: .active, restart: { restarts += 1 })
        #expect(restarts == 1)
    }
}
