import Foundation
import Testing
@testable import TigerWorkouts

/// The watch only mirrors the phone: what crosses between them, and what a tap does on arrival.
@Suite("watch link")
@MainActor
struct WatchLinkTests {
    private func sample() -> WatchState {
        WatchState(
            title: "Pyramid", headline: "Back squat", detail: "Exercise 1 of 2", setLine: "60 kg × 10",
            isRest: false, isPaused: false, isDone: false,
            endsAt: Date(timeIntervalSince1970: 1_700_000_090), startedAt: Date(timeIntervalSince1970: 1_700_000_000),
            pausedLeft: nil, action: .done, token: "running:s1"
        )
    }

    @Test("a state and an empty state survive the round trip")
    func stateRoundTrip() {
        let at = Date(timeIntervalSince1970: 1_700_000_005)
        #expect(WatchMessage.decode(WatchMessage.state(sample(), sentAt: at).encoded()) == .state(sample(), sentAt: at))
        #expect(WatchMessage.decode(WatchMessage.state(nil, sentAt: at).encoded()) == .state(nil, sentAt: at))
    }

    @Test("every command survives the round trip")
    func commandRoundTrip() {
        for command in WatchCommand.allCases {
            #expect(WatchMessage.decode(WatchMessage.command(command, token: "rest:r1").encoded()) == .command(command, token: "rest:r1"))
        }
    }

    @Test("the encoded message holds only property-list values")
    func propertyList() {
        let encoded = WatchMessage.state(sample(), sentAt: Date()).encoded()
        #expect(PropertyListSerialization.propertyList(encoded, isValidFor: .binary))
    }

    @Test("malformed or newer messages are dropped")
    func malformed() {
        #expect(WatchMessage.decode([:]) == nil)
        #expect(WatchMessage.decode(["v": 1, "kind": "command", "command": "explode", "token": "x"]) == nil)
        #expect(WatchMessage.decode(["v": 1, "kind": "command", "command": "done"]) == nil)
        #expect(WatchMessage.decode(["v": 1, "kind": "state", "sentAt": 1.0, "state": Data("{}".utf8)]) == nil)
        #expect(WatchMessage.decode(["v": 99, "kind": "command", "command": "done", "token": "x"]) == nil)
    }

    @Test("the phone runs a watch tap as the matching session control, with its token")
    func handler() {
        var got: [(SessionControl, String?)] = []
        for command in WatchCommand.allCases {
            #expect(WatchSync.handle(WatchMessage.command(command, token: "t").encoded()) { got.append(($0, $1)) })
        }
        #expect(got.map(\.0) == [.done, .skipRest, .extendRest, .pause, .resume])
        #expect(got.allSatisfy { $0.1 == "t" })
        // A state is not a command.
        #expect(!WatchSync.handle(WatchMessage.state(nil, sentAt: Date()).encoded()) { _, _ in Issue.record("ran a state") })
    }

    @Test("a tap from the watch drives the running session, and a stale one does nothing")
    func drivesRunner() {
        SessionRunner.$savedName.withValue("test-\(UUID().uuidString).json") {
            let runner = SessionRunner(runsheet: SetPlanTests.pyramid(SetPlanTests.full))
            let send = { (dict: [String: Any]) in _ = WatchSync.handle(dict) { runner.control($0, token: $1) } }
            let token = SessionRunner.watchState(runner.state, runsheet: runner.runsheet, now: 1_000).token
            send(WatchMessage.command(.done, token: token).encoded()) // Start, from the lead-in
            #expect(runner.state.phase == .running)
            #expect(runner.slot?.kind == .work)

            // The lead-in's token is behind the session now.
            send(WatchMessage.command(.done, token: token).encoded())
            #expect(runner.slot?.kind == .work)
            #expect(!runner.state.actuals.values.contains { $0.doneAt != nil })

            let working = SessionRunner.watchState(runner.state, runsheet: runner.runsheet, now: 2_000)
            #expect(working.action == .done)
            send(WatchMessage.command(.done, token: working.token).encoded())
            #expect(runner.slot?.kind == .rest)

            let resting = SessionRunner.watchState(runner.state, runsheet: runner.runsheet, now: 3_000)
            #expect(resting.action == .rest)
            #expect(resting.isRest)
            #expect(resting.endsAt != nil)
            send(WatchMessage.command(.skipRest, token: resting.token).encoded())
            #expect(runner.slot?.kind == .work)
            #expect(runner.slot?.round == 1)
        }
    }

    @Test("the watch state is the Lock Screen card's, with the time left while paused")
    func matchesCard() {
        let sheet = Fixtures.interval()
        let s = Runner.tick(Runner.start(sheet, now: 0), now: 5_000)
        let card = SessionRunner.lockScreenState(s, runsheet: sheet, now: 6_000)
        let watch = SessionRunner.watchState(s, runsheet: sheet, now: 6_000)
        #expect(watch.headline == card.headline)
        #expect(watch.setLine == card.setLine)
        #expect(watch.endsAt == card.endsAt)
        #expect(watch.token == card.token)
        #expect(watch.action == .pause)
        #expect(watch.pausedLeft == nil)
        // Holds still within a slot, so the phone does not send on every tick.
        #expect(watch == SessionRunner.watchState(s, runsheet: sheet, now: 9_000))

        let paused = Runner.pause(s, now: 10_000)
        let held = SessionRunner.watchState(paused, runsheet: sheet, now: 11_000)
        #expect(held.isPaused)
        #expect(held.action == .resume)
        #expect(held.pausedLeft == paused.remainingMs.map { $0 / 1000 })
        #expect(held.pausedLeft != nil)
    }
}
