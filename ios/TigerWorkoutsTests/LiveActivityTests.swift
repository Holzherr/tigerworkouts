import Foundation
import Testing
@testable import TigerWorkouts

/// iOS throttles an app that updates its Live Activity too often, and the controller pushes
/// whenever this state changes — so it has to hold still for the length of a slot.
@Suite("live activity")
struct LiveActivityTests {
    @Test("the Lock Screen state holds still within a slot")
    func stableWithinSlot() {
        let sheet = Fixtures.interval()
        let s = Runner.tick(Runner.start(sheet, now: 0), now: 5_000) // swings, 30 s from 5 s
        let early = SessionRunner.activityState(s, runsheet: sheet, now: 6_000)
        let late = SessionRunner.activityState(s, runsheet: sheet, now: 30_000)
        // This is the bug it guards: progress crept every tick, and 10 updates a second got the
        // transition that mattered dropped.
        #expect(early == late)
    }

    @Test("it changes on a transition, and says what comes next")
    func changesOnTransition() {
        let sheet = Fixtures.interval()
        let working = Runner.tick(Runner.start(sheet, now: 0), now: 5_000)
        let resting = Runner.tick(working, now: 35_000)
        let before = SessionRunner.activityState(working, runsheet: sheet, now: 34_000)
        let after = SessionRunner.activityState(resting, runsheet: sheet, now: 36_000)
        #expect(before != after)
        #expect(before.headline == "Kettlebell swings")
        #expect(before.detail == "Exercise 1 of 2")
        #expect(after.headline == "Rest")
        #expect(after.detail == "Next: Incline chest press")
        #expect(after.isRest)
        #expect(after.progress > before.progress)
    }

    @Test("the countdown goes over as the instant it ends")
    func countdownIsAnInstant() {
        let sheet = Fixtures.interval()
        let s = Runner.tick(Runner.start(sheet, now: 0), now: 5_000)
        let state = SessionRunner.activityState(s, runsheet: sheet, now: 6_000)
        #expect(state.endsAt == Date(timeIntervalSince1970: 35))
        #expect(state.countsDown)
    }

    @Test("a paused session shows as paused, and the lead-in as getting ready")
    func pausedAndLead() {
        let sheet = Fixtures.interval()
        let lead = Runner.start(sheet, now: 0)
        #expect(SessionRunner.activityState(lead, runsheet: sheet, now: 1_000).headline == "Get ready")

        let paused = Runner.pause(Runner.tick(lead, now: 5_000), now: 10_000)
        let state = SessionRunner.activityState(paused, runsheet: sheet, now: 11_000)
        #expect(state.isPaused)
        #expect(state.detail.hasPrefix("Paused"))
    }

    @Test("a finished session stops the clock instead of counting up")
    func finishedHoldsStill() {
        let sheet = Fixtures.interval()
        let running = Runner.tick(Runner.start(sheet, now: 0), now: 5_000)
        let finished = Runner.finish(running, now: 100_000)
        let state = SessionRunner.activityState(finished, runsheet: sheet, now: 120_000)
        #expect(state.isDone)
        #expect(state.headline == "Done")
        #expect(state.progress == 1)
        // Without this the card has no end to count down to, so it counts up from the last slot
        // and reads as a workout still running — what Nick saw on the Lock Screen.
        #expect(state.endsAt == nil)
        #expect(SessionRunner.activityState(finished, runsheet: sheet, now: 200_000) == state)
    }
}
