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

/// A real session with every countdown let run out, nobody touching it: what a locked phone in a
/// pocket feels at each change, counted on a fake vibrator.
@Suite("buzz with the phone locked")
@MainActor
struct LockedBuzzTests {
    final class FakeVibrator: Vibrator {
        var calls: [Int] = []
        func buzz(_ times: Int) { calls.append(times) }
    }

    struct Change: Equatable {
        var to: String
        var buzzes: [Int]
        var felt: [Haptics.Cue]
    }

    /// Two rounds of 30 s work and 10 s rest, each change made by the clock alone.
    static func changes(app: UIApplication.State, hapticsOn: Bool = true) -> [Change] {
        let vibrator = FakeVibrator()
        var felt: [Haptics.Cue] = []
        let haptics = Haptics(appState: { app }, vibrator: vibrator, foreground: { felt.append($0) })
        haptics.enabled = hapticsOn
        let runner = SessionRunner(runsheet: Fixtures.interval())
        runner.haptics = haptics
        var out: [Change] = []
        while runner.state.phase != .done, let end = runner.state.endsAt {
            let (buzzed, played) = (vibrator.calls.count, felt.count)
            runner.tick(at: end)
            let to = runner.state.phase == .done ? "finish" : runner.slot?.kind == .rest ? "rest" : "work"
            out.append(Change(to: to, buzzes: Array(vibrator.calls[buzzed...]), felt: Array(felt[played...])))
        }
        SessionRunner.clearSaved() // every change wrote a crash-safety copy; leave none behind
        return out
    }

    @Test("locked, each automatic change to work, rest and finish calls the vibrator once")
    func lockedBuzzesOnce() {
        for app in [UIApplication.State.background, .inactive] {
            let changes = Self.changes(app: app)
            #expect(Set(changes.map(\.to)) == ["work", "rest", "finish"])
            #expect(changes.last?.to == "finish")
            // Work two buzzes, rest one, the finish three — one call each, nothing through Core Haptics.
            let times = ["work": 2, "rest": 1, "finish": 3]
            #expect(changes.map(\.buzzes) == changes.map { [times[$0.to]!] })
            #expect(changes.allSatisfy { $0.felt.isEmpty })
        }
    }

    @Test("on screen, an automatic change never calls the vibrator and plays its cue as before")
    func activeFeelsInstead() {
        let changes = Self.changes(app: .active)
        #expect(!changes.isEmpty)
        let cues: [String: Haptics.Cue] = ["work": .work, "rest": .rest, "finish": .finish]
        #expect(changes.allSatisfy { $0.buzzes.isEmpty })
        #expect(changes.map(\.felt) == changes.map { [cues[$0.to]!] })
    }

    @Test("haptics off, a locked phone is never buzzed")
    func hapticsOffNeverBuzzes() {
        let changes = Self.changes(app: .background, hapticsOn: false)
        #expect(!changes.isEmpty)
        #expect(changes.allSatisfy { $0.buzzes.isEmpty && $0.felt.isEmpty })
    }

    @Test("the sound switch does not change what a locked phone feels")
    func soundSwitchHasNoEffect() {
        let was = Cues.shared.enabled
        defer { Cues.shared.enabled = was }
        Cues.shared.enabled = true
        let withSound = Self.changes(app: .background)
        Cues.shared.enabled = false
        let silent = Self.changes(app: .background)
        #expect(!silent.isEmpty)
        #expect(silent == withSound)
    }
}
