import Foundation
import Testing
import UIKit
@testable import TigerWorkouts

/// Ported from 'only what was done is logged', 'for time is scored on the scored block', 'pause',
/// 'emom' and 'previous step' in `runner.test.ts`, and 'ghost on the block clock' in `pace.test.ts`.
@Suite("only what was done is logged")
struct LoggedOnlyWhatWasDoneTests {
    static func ruled() -> Runsheet {
        var r = Fixtures.interval()
        r.progression = Progression(onSuccessKg: 2.5, deloadPct: 10, failAfter: 3)
        return r
    }

    @Test("a step with sets left undone is not a success")
    func undoneIsMissed() {
        var s = Runner.tick(Runner.start(Self.ruled(), now: 0), now: 5_000)
        s = Runner.advance(s, now: 20_000)
        var t: Double = 21_000
        while s.phase != .done {
            s = Runner.advance(s, now: t, skipped: true)
            t += 1_000
        }
        let r = Runner.toResult(s, Self.ruled(), now: 40_000)
        #expect(r.steps.map(\.stepId) == ["sw"])
        #expect(r.steps.first?.success == false)
    }

    @Test("every set done is a success")
    func allDone() {
        var s = Runner.tick(Runner.start(Self.ruled(), now: 0), now: 5_000)
        var t: Double = 6_000
        while s.phase != .done {
            s = Runner.advance(s, now: t)
            t += 1_000
        }
        #expect(Runner.toResult(s, Self.ruled(), now: 20_000).steps.allSatisfy { $0.success == true })
    }

    @Test("a set short of its reps is a miss")
    func shortIsMissed() {
        var b = Block(id: "b", name: "B", repeatCount: 2, steps: [Fixtures.work("q1", Fixtures.squat, target: 60, forMode: .reps, forValue: 5)])
        b.progression = Progression(onSuccessKg: 2.5, deloadPct: 10, failAfter: 3)
        let r = Runsheet(id: "q", title: "Squat", items: [.block(b)])
        var s = Runner.tick(Runner.start(r, now: 0), now: 5_000)
        s = Runner.advance(s, now: 20_000)
        s = Runner.setReps(s, reps: 3)
        s = Runner.advance(s, now: 40_000)
        let row = Runner.toResult(s, r, now: 40_000).steps[0]
        #expect(row.reps == [5, 3])
        #expect(row.success == false)
    }

    @Test("a step with no progression rule says nothing about success")
    func unruledHasNoSuccess() {
        var s = Runner.tick(Runner.start(Fixtures.interval(), now: 0), now: 5_000)
        var t: Double = 6_000
        while s.phase != .done {
            s = Runner.advance(s, now: t)
            t += 1_000
        }
        #expect(Runner.toResult(s, Fixtures.interval(), now: 20_000).steps.map(\.success) == [nil, nil])
    }
}

@Suite("for time is scored on the scored block")
struct ForTimeScoreTests {
    static func forTime() -> Runsheet {
        var warm = ExerciseStep(id: "wu", exercise: Fixtures.squat, forMode: .seconds, forValue: 30)
        warm.role = .warmup
        return Runsheet(id: "ft", title: "Warm-up then for time", items: [
            .step(.exercise(warm)),
            .block(Block(id: "b", name: "For time", repeatCount: 2, mode: .fortime, steps: [
                Fixtures.work("pu", Fixtures.pullup, forMode: .reps, forValue: 5),
                Fixtures.work("pp", Fixtures.pushup, forMode: .reps, forValue: 10),
            ])),
        ])
    }

    static func run(pauseInBlock: Double = 0) -> SessionResult {
        var s = Runner.tick(Runner.start(forTime(), now: 0), now: 5_000)
        s = Runner.tick(s, now: 35_000)
        #expect(s.phase == .ready)
        s = Runner.startBlock(s, now: 95_000)
        s = Runner.advance(s, now: 105_000)
        if pauseInBlock > 0 { s = Runner.resume(Runner.pause(s, now: 106_000), now: 106_000 + pauseInBlock) }
        let t = 105_000 + pauseInBlock
        s = Runner.advance(s, now: t + 10_000)
        s = Runner.advance(s, now: t + 20_000)
        s = Runner.advance(s, now: t + 30_000)
        #expect(s.phase == .done)
        return Runner.toResult(s, forTime(), now: t + 30_000)
    }

    @Test("leaves out the lead-in, the gate and the warm-up")
    func scoredBlockOnly() {
        let r = Self.run()
        #expect(r.durationSec == 135)
        #expect(r.score == 40)
    }

    @Test("leaves out a pause inside the block")
    func pauseInside() {
        #expect(Self.run(pauseInBlock: 20_000).score == 40)
    }

    @Test("splits carry when the block began, for the race against last time")
    func splitsFrom() {
        #expect(Self.run().splits == [RoundSplit(blockId: "b", at: [115, 135], from: 95, starts: [95, 115])])
    }

    @Test("a loose main step counts, as in Murph")
    func murph() {
        let murph = Runsheet(id: "m", title: "Murph", items: [
            .step(Fixtures.work("run1", Fixtures.squat, forMode: .reps, forValue: 1)),
            .block(Block(id: "b", name: "B", repeatCount: 1, mode: .fortime, steps: [Fixtures.work("pu", Fixtures.pullup, forMode: .reps, forValue: 5)])),
        ])
        var s = Runner.tick(Runner.start(murph, now: 0), now: 5_000)
        s = Runner.advance(s, now: 65_000)
        s = Runner.startBlock(s, now: 125_000)
        s = Runner.advance(s, now: 155_000)
        #expect(Runner.toResult(s, murph, now: 155_000).score == 90)
    }
}

@Suite("pause")
struct PauseTests {
    @Test("pausing the lead-in twice still resumes into the lead-in, and logs nothing")
    func leadTwice() {
        var s = Runner.start(Fixtures.interval(), now: 0)
        s = Runner.resume(Runner.pause(s, now: 1_000), now: 2_000)
        s = Runner.resume(Runner.pause(s, now: 3_000), now: 13_000)
        #expect(s.phase == .lead)
        s = Runner.tick(s, now: 16_000)
        #expect(s.phase == .running)
        #expect(s.i == 0)
        #expect(!s.actuals.values.contains { $0.doneAt != nil })
    }

    @Test("Done on a paused lead-in starts the first step without logging it")
    func doneOnPausedLead() {
        var s = Runner.pause(Runner.start(Fixtures.interval(), now: 0), now: 1_000)
        s = Runner.advance(s, now: 2_000)
        #expect(s.phase == .running)
        #expect(s.i == 0)
        #expect(s.actuals[s.slots[0].id]?.doneAt == nil)
    }

    @Test("Done while paused does not count the pause as workout time")
    func doneWhilePaused() {
        var s = Runner.tick(Runner.start(Fixtures.interval(), now: 0), now: 5_000)
        s = Runner.pause(s, now: 10_000)
        s = Runner.advance(s, now: 70_000)
        #expect(s.phase == .running)
        #expect(s.i == 1)
        #expect(s.pausedMs == 60_000)
        #expect(s.actuals[s.slots[0].id]?.at == 10)
        #expect(Runner.elapsed(s, now: 70_000) == 10)
    }

    @Test("a set ticked on a paused timer does not count the pause either")
    func tickWhilePaused() {
        var s = Runner.tick(Runner.start(Fixtures.interval(), now: 0), now: 5_000)
        s = Runner.pause(s, now: 10_000)
        s = Runner.completeSet(s, now: 70_000, slotId: s.slots[0].id)
        #expect(s.pausedMs == 60_000)
        #expect(Runner.elapsed(s, now: 70_000) == 10)
    }

    @Test("finishing while paused does not count the pause")
    func finishWhilePaused() {
        var s = Runner.tick(Runner.start(Fixtures.interval(), now: 0), now: 5_000)
        s = Runner.finish(Runner.pause(s, now: 10_000), now: 70_000)
        #expect(Runner.toResult(s, Fixtures.interval(), now: 70_000).durationSec == 10)
    }
}

@Suite("emom")
struct EmomTests {
    static func emom() -> Runsheet {
        Runsheet(id: "e", title: "EMOM", items: [.block(Block(
            id: "b", name: "E", repeatCount: 3, mode: .emom,
            steps: [Fixtures.work("x", Fixtures.burpee, forMode: .reps, forValue: 5)], everySec: 60
        ))])
    }

    @Test("shows what is left of the minute on the work")
    func minuteLeft() {
        let s = Runner.tick(Runner.start(Self.emom(), now: 0), now: 5_000)
        #expect(Runner.minuteLeft(s, now: 25_000) == 40)
        #expect(Runner.minuteLeft(Runner.tick(Runner.start(Fixtures.interval(), now: 0), now: 5_000), now: 25_000) == nil)
    }

    @Test("an overrun minute does not add a minute")
    func overrun() {
        var s = Runner.tick(Runner.start(Self.emom(), now: 0), now: 5_000)
        s = Runner.advance(s, now: 75_000)
        #expect(Runner.current(s)?.kind == .work)
        #expect(Runner.current(s)?.round == 1)
        s = Runner.advance(s, now: 80_000)
        #expect(s.endsAt == 125_000)
        s = Runner.tick(s, now: 125_000)
        s = Runner.advance(s, now: 130_000)
        s = Runner.tick(s, now: 185_000)
        #expect(s.phase == .done)
    }
}

@Suite("previous step")
struct PreviousStepTests {
    static func two(cap: Double? = nil) -> Runsheet {
        Runsheet(id: "two", title: "Two for time", items: [
            .block(Block(id: "a", name: "A", repeatCount: 1, mode: .fortime, steps: [Fixtures.work("pa", Fixtures.pullup, forMode: .reps, forValue: 5)], timeCapSec: cap)),
            .block(Block(id: "b", name: "B", repeatCount: 1, mode: .fortime, steps: [Fixtures.work("pb", Fixtures.pushup, forMode: .reps, forValue: 10)])),
        ])
    }

    @Test("back and forth across blocks counts the time once")
    func backAcrossBlocks() {
        var s = Runner.tick(Runner.start(Self.two(), now: 0), now: 5_000)
        s = Runner.advance(s, now: 65_000)
        s = Runner.startBlock(s, now: 65_000)
        s = Runner.back(s, now: 95_000)
        #expect(s.i == 0)
        s = Runner.advance(s, now: 100_000)
        s = Runner.startBlock(s, now: 100_000)
        s = Runner.advance(s, now: 130_000)
        #expect(s.phase == .done)
        #expect(Runner.toResult(s, Self.two(), now: 130_000).score == 125)
    }

    @Test("back at a gate does not reopen a capped block whose cap has passed")
    func backPastCap() {
        var s = Runner.tick(Runner.start(Self.two(cap: 60), now: 0), now: 5_000)
        s = Runner.advance(s, now: 20_000)
        #expect(s.phase == .ready)
        let back = Runner.back(s, now: 100_000)
        #expect(back.i == s.i)
        #expect(back.phase == .ready)
        #expect(back.actuals[s.slots[0].id]?.doneAt == 20_000)
        #expect(Runner.toResult(back, Self.two(cap: 60), now: 100_000).steps.map(\.stepId) == ["pa"])
    }

    @Test("back at a gate into a capped block with time left reopens its last set")
    func backBeforeCap() {
        var s = Runner.tick(Runner.start(Self.two(cap: 60), now: 0), now: 5_000)
        s = Runner.advance(s, now: 20_000)
        s = Runner.back(s, now: 30_000)
        #expect(s.i == 0)
        #expect(s.phase == .running)
        #expect(s.actuals[s.slots[0].id]?.doneAt == nil)
    }

    @Test("going back un-logs the step, so an amrap round is not counted twice")
    func backUnlogs() {
        var s = Runner.tick(Runner.start(Fixtures.cindy(), now: 0), now: 5_000)
        s = Runner.advance(s, now: 10_000)
        #expect(s.blockDone["b"] == 1)
        s = Runner.back(s, now: 11_000)
        #expect(s.i == 0)
        #expect(s.blockDone["b"] == 0)
        #expect(s.actuals[s.slots[0].id]?.doneAt == nil)
        s = Runner.advance(s, now: 12_000)
        #expect(s.blockDone["b"] == 1)
    }

    @Test("a run saved before these fields existed still decodes")
    func oldRunDecodes() throws {
        let s = Runner.tick(Runner.start(Fixtures.interval(), now: 0), now: 5_000)
        var json = try #require(try JSONSerialization.jsonObject(with: JSONEncoder().encode(s)) as? [String: Any])
        json["pausedFrom"] = nil
        json["partAt"] = nil
        json["partOut"] = nil
        let old = try JSONDecoder().decode(RunState.self, from: JSONSerialization.data(withJSONObject: json))
        #expect(old.slots == s.slots)
    }
}

@Suite("ghost on the block clock")
struct GhostBlockClockTests {
    static func split(_ at: [Double], from: Double?) -> SessionResult {
        var r = SessionResult(runsheetId: "w", title: "W", startedAt: "2026-09-20T10:00:00Z")
        r.splits = [RoundSplit(blockId: "b", at: at, from: from)]
        return r
    }

    @Test("compares rounds from the start of the block when both sessions have it")
    func relative() {
        #expect(Pace.ghost(Self.split([95], from: 20), against: Self.split([160], from: 80))?.text == "Round 1 — 5 s ahead")
    }

    @Test("falls back to session time against a session logged before")
    func fallback() {
        #expect(Pace.ghost(Self.split([95], from: 20), against: Self.split([160], from: nil))?.text == "Round 1 — 1:05 ahead")
    }
}

@Suite("finished session lets go")
@MainActor
struct FinishReleaseTests {
    @Test("done releases the screen, the tick and the audio without waiting for the screen to close")
    func releasesAtDone() {
        SessionRunner.$savedName.withValue("test-\(UUID().uuidString).json") {
            let runner = SessionRunner(runsheet: Fixtures.interval())
            runner.begin()
            #expect(runner.holding)
            #expect(UIApplication.shared.isIdleTimerDisabled)
            runner.finish()
            #expect(!runner.holding)
            #expect(!UIApplication.shared.isIdleTimerDisabled)
            #expect(SessionControls.active == nil)
            runner.end()
            SessionRunner.clearSaved()
        }
    }
}

@Suite("lock screen clocks and resume")
@MainActor
struct LockScreenClockTests {
    @Test("an amrap's card carries its cap; EMOM work carries its minute")
    func capClock() {
        let cindy = Runner.tick(Runner.start(Fixtures.cindy(), now: 0), now: 5_000)
        let card = SessionRunner.lockScreenState(cindy, runsheet: Fixtures.cindy(), now: 6_000)
        #expect(card.capEndsAt == Date(timeIntervalSince1970: 65))
        #expect(card.capLabel == "left in the block")

        let emom = Runner.tick(Runner.start(EmomTests.emom(), now: 0), now: 5_000)
        let minute = SessionRunner.lockScreenState(emom, runsheet: EmomTests.emom(), now: 6_000)
        #expect(minute.capEndsAt == Date(timeIntervalSince1970: 65))
        #expect(minute.capLabel == "left in the minute")

        let plain = Runner.tick(Runner.start(Fixtures.interval(), now: 0), now: 5_000)
        #expect(SessionRunner.lockScreenState(plain, runsheet: Fixtures.interval(), now: 6_000).capEndsAt == nil)
    }

    @Test("a paused card offers Resume, and Resume resumes")
    func resume() {
        SessionRunner.$savedName.withValue("test-\(UUID().uuidString).json") {
            let runner = SessionRunner(runsheet: Fixtures.interval())
            runner.control(.done, token: SessionRunner.token(runner.state))
            runner.pauseOrResume()
            #expect(runner.state.phase == .paused)
            #expect(SessionRunner.lockScreenState(runner.state, runsheet: runner.runsheet, now: 0).action == .resume)
            runner.control(.resume, token: SessionRunner.token(runner.state))
            #expect(runner.state.phase == .running)
            SessionRunner.clearSaved()
        }
    }
}

@Suite("discarding a finished session")
@MainActor
struct DiscardTests {
    private final class Gate {
        var waiting: CheckedContinuation<DeviceSummary?, Never>?
        var asked = false
    }

    @Test("Discard takes it off the phone and out of the queue")
    func discard() async {
        let store = Store()
        store.cacheName = "test-cache-\(UUID().uuidString).json"
        store.healthOverride = false
        store.deviceSummary = { _, _ in nil }
        let result = SessionResult(runsheetId: "w", title: "W", startedAt: "2026-09-27T10:00:00.000Z", durationSec: 600, id: "s-discard")
        await store.save(result)
        #expect(store.results.contains { $0.rowId == "s-discard" })
        await store.discard(result)
        #expect(!store.results.contains { $0.rowId == "s-discard" })
        #expect(store.unsyncedCount == 0)
    }

    @Test("a save still asking Health for the heart rate does not bring a discarded session back")
    func discardDuringSave() async throws {
        let store = Store()
        store.cacheName = "test-cache-\(UUID().uuidString).json"
        store.healthOverride = false
        let gate = Gate()
        store.deviceSummary = { _, _ in
            gate.asked = true
            return await withCheckedContinuation { gate.waiting = $0 }
        }
        let result = SessionResult(runsheetId: "w", title: "W", startedAt: "2026-09-27T11:00:00.000Z",
                                   endedAt: "2026-09-27T11:10:00.000Z", durationSec: 600, id: "s-late")
        let saving = Task { await store.save(result) }
        for _ in 0..<200 where !gate.asked { try await Task.sleep(for: .milliseconds(10)) }
        await store.discard(result)
        gate.waiting?.resume(returning: DeviceSummary(avgHr: 130))
        await saving.value
        #expect(!store.results.contains { $0.rowId == "s-late" })
        #expect(store.unsyncedCount == 0)
        // Saved again (a recovery after a kill), it stays discarded.
        await store.save(result)
        #expect(!store.results.contains { $0.rowId == "s-late" })
    }
}

@Suite("recovering a session after the app was killed")
@MainActor
struct RecoveryTests {
    static func oneSetDone() -> RunState {
        Runner.advance(Runner.tick(Runner.start(Fixtures.interval(), now: 0), now: 5_000), now: 20_000)
    }

    @Test("a session whose workout is not on the phone is kept, under the title it ran with")
    func missingWorkout() throws {
        let state = Self.oneSetDone()
        let r = SessionRunner.recovery(of: state, savedAt: Date(), lookup: { _ in nil })
        #expect(!r.canResume)
        #expect(r.sheet.id == "i" && r.sheet.title == "Interval")
        let partial = try #require(r.partial)
        #expect(partial.runsheetId == "i" && partial.title == "Interval")
        #expect(partial.steps.map(\.stepId) == ["sw"])
    }

    @Test("a session left for more than six hours can still be saved, not resumed")
    func stale() {
        let state = Self.oneSetDone()
        let old = SessionRunner.recovery(of: state, savedAt: Date(timeIntervalSinceNow: -7 * 3600), lookup: { _ in Fixtures.interval() })
        #expect(!old.canResume && old.partial != nil)
        let fresh = SessionRunner.recovery(of: state, savedAt: Date(timeIntervalSinceNow: -60), lookup: { _ in Fixtures.interval() })
        #expect(fresh.canResume && fresh.partial != nil)
    }

    @Test("only rests done is nothing to save")
    func onlyRests() {
        var s = Runner.tick(Runner.start(Fixtures.interval(), now: 0), now: 5_000)
        s = Runner.advance(s, now: 20_000, skipped: true)
        s = Runner.advance(s, now: 30_000)
        #expect(s.actuals.values.contains { $0.doneAt != nil })
        #expect(SessionRunner.partialResult(of: s, savedAt: Date(), runsheet: Fixtures.interval()) == nil)
    }

    @Test("where a session was started from survives the app being killed: resumed, recovered or saved as it stood")
    func keepsOrigin() throws {
        try SessionRunner.$savedName.withValue("test-\(UUID().uuidString).json") {
            let runner = SessionRunner(runsheet: Fixtures.interval(), startedFrom: .recommended)
            runner.done()
            runner.done()
            let saved = try #require(SessionRunner.readSaved())
            #expect(saved.startedFrom == .recommended)
            #expect(SessionRunner.recovery(of: saved.state, savedAt: saved.savedAt, startedFrom: saved.startedFrom, lookup: { _ in Fixtures.interval() }).partial?.startedFrom == "recommended")
            let resumed = try #require(SessionRunner(resuming: Fixtures.interval()))
            #expect(resumed.result().startedFrom == "recommended")
            // A copy written before the origin was kept reads back with none.
            let url = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent(SessionRunner.savedName)
            try JSONEncoder().encode(saved.state).write(to: url)
            #expect(try #require(SessionRunner.readSaved()).startedFrom == nil)
            SessionRunner.clearSaved()
        }
    }

    @Test("a run older than six hours with a set done is still read back")
    func readsOldWork() throws {
        try SessionRunner.$savedName.withValue("test-\(UUID().uuidString).json") {
            let url = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent(SessionRunner.savedName)
            try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            try JSONEncoder().encode(Self.oneSetDone()).write(to: url)
            try FileManager.default.setAttributes([.modificationDate: Date(timeIntervalSinceNow: -7 * 3600)], ofItemAtPath: url.path)
            #expect(SessionRunner.readSaved() != nil)
            try JSONEncoder().encode(Runner.tick(Runner.start(Fixtures.interval(), now: 0), now: 5_000)).write(to: url)
            try FileManager.default.setAttributes([.modificationDate: Date(timeIntervalSinceNow: -7 * 3600)], ofItemAtPath: url.path)
            #expect(SessionRunner.readSaved() == nil)
            SessionRunner.clearSaved()
        }
    }
}

@Suite("block gates")
struct BlockGateTests {
    @Test("a loose step runs straight on with no gate; a block still waits for Start block")
    func looseNoGate() {
        let r = Runsheet(id: "g", title: "Gates", items: [
            .step(Fixtures.work("l1", Fixtures.squat, forMode: .reps, forValue: 10)),
            .step(Fixtures.work("l2", Fixtures.pushup, forMode: .reps, forValue: 10)),
            .block(Block(id: "b", name: "B", repeatCount: 1, steps: [Fixtures.work("pb", Fixtures.pullup, forMode: .reps, forValue: 5)])),
        ])
        var s = Runner.tick(Runner.start(r, now: 0), now: 5_000)
        s = Runner.advance(s, now: 20_000)
        #expect(s.phase == .running)
        #expect(s.slots[s.i].step.id == "l2")
        s = Runner.advance(s, now: 30_000)
        #expect(s.phase == .ready)
        #expect(s.slots[s.i].step.id == "pb")
    }

    @Test("one round reads as one round")
    func oneRound() {
        #expect(Celebrate.formatScore(.rounds, 1.002) == "1 round + 2 reps")
        #expect(Celebrate.formatScore(.rounds, 12.007) == "12 rounds + 7 reps")
    }
}

@Suite("cues at a block gate")
struct GateCueTests {
    static func twoBlocks() -> Runsheet {
        Runsheet(id: "two", title: "Two", items: [
            .block(Block(id: "a", name: "A", repeatCount: 1, steps: [Fixtures.work("pa", Fixtures.swing, forMode: .seconds, forValue: 30)])),
            .block(Block(id: "b", name: "B", repeatCount: 1, steps: [Fixtures.work("pb", Fixtures.pushup, forMode: .reps, forValue: 10)])),
        ])
    }

    @Test("a block that ends at a gate cues then, and Start gets the work cue")
    func cueAtGate() {
        var s = Runner.tick(Runner.start(Self.twoBlocks(), now: 0), now: 5_000)
        let first = s.slots[0].id
        #expect(SessionRunner.transitionCue(s, cuedSlot: nil, cuedPhase: .lead) == .work)
        s = Runner.tick(s, now: 35_000) // the countdown runs out with the phone in a pocket
        #expect(s.phase == .ready)
        #expect(SessionRunner.transitionCue(s, cuedSlot: first, cuedPhase: .running) == .block)
        #expect(SessionRunner.transitionCue(s, cuedSlot: first, cuedPhase: .ready) == nil)
        s = Runner.startBlock(s, now: 60_000)
        #expect(SessionRunner.transitionCue(s, cuedSlot: first, cuedPhase: .ready) == .work)
    }
}

@Suite("discarding from the timer")
@MainActor
struct TimerDiscardTests {
    @Test("Discard stops the session, logs nothing and leaves nothing to resume")
    func discard() {
        SessionRunner.$savedName.withValue("test-\(UUID().uuidString).json") {
            let runner = SessionRunner(runsheet: Fixtures.interval())
            var delivered: [SessionResult] = []
            runner.onFinished = { delivered.append($0) }
            runner.begin()
            runner.done()
            runner.done()
            #expect(SessionRunner.readSaved() != nil)
            runner.discard()
            #expect(!runner.holding)
            #expect(SessionRunner.readSaved() == nil)
            runner.finish()
            #expect(delivered.isEmpty)
            SessionRunner.clearSaved()
        }
    }
}

/// Ported from 'a countdown skipped earlier and ticked later…' in `runner.test.ts` (review D14).
@Suite("a timed set ticked after it was passed")
struct PassedCountdownTests {
    /// 3 × 30 s plank with 10 s between, then a block of push-ups.
    static func holds() -> Runsheet {
        Runsheet(id: "p", title: "P", items: [
            .block(Block(id: "b", name: "B", repeatCount: 3, steps: [Fixtures.work("h", Fixtures.squat, forMode: .seconds, forValue: 30)], restBetweenSec: 10)),
            .block(Block(id: "c", name: "C", repeatCount: 1, steps: [Fixtures.work("q", Fixtures.pushup, forMode: .reps, forValue: 10)])),
        ])
    }

    @Test("a countdown skipped earlier and ticked later runs, is logged with its time, and the timer goes back")
    func runsThenReturns() {
        var s = Runner.tick(Runner.start(Self.holds(), now: 0), now: 5_000)
        let first = s.slots[0].id
        s = Runner.advance(s, now: 7_000, skipped: true)
        s = Runner.tick(s, now: 17_000) // the rest ran out: set 2 is running
        #expect(s.i == 2)
        s = Runner.completeSet(s, now: 20_000, slotId: first)
        #expect(s.i == 0)
        #expect(s.phase == .running)
        #expect(s.endsAt == 50_000)
        #expect(s.actuals[first]?.doneAt == nil)
        s = Runner.tick(s, now: 50_000)
        #expect(s.i == 2) // back on set 2, from its start
        #expect(s.endsAt == 80_000)
        #expect(s.detour == nil)
        let sets = Runner.toResult(s, Self.holds(), now: 50_000).steps.first?.sets
        #expect(sets?.map(\.seconds) == [30])
        #expect(sets?.map(\.at) == [50])
        #expect(s.blockDone["b"] == 1)
    }

    @Test("a countdown un-ticked after it ran is logged with the time it ran")
    func untickedKeepsItsTime() {
        var s = Runner.tick(Runner.start(Self.holds(), now: 0), now: 5_000)
        let first = s.slots[0].id
        s = Runner.tick(s, now: 35_000)
        s = Runner.reopenSet(s, slotId: first)
        #expect(Runner.toResult(s, Self.holds(), now: 36_000).steps.isEmpty)
        s = Runner.completeSet(s, now: 37_000, slotId: first)
        #expect(s.i == 1)
        let sets = Runner.toResult(s, Self.holds(), now: 38_000).steps.first?.sets
        #expect(sets?.map(\.seconds) == [30])
        #expect(sets?.map(\.at) == [37])
    }

    @Test("a countdown that never ran cannot be ticked from another block")
    func notFromAnotherBlock() {
        var s = Runner.tick(Runner.start(Self.holds(), now: 0), now: 5_000)
        let first = s.slots[0].id
        for k in 0..<5 { s = Runner.advance(s, now: 7_000 + Double(k) * 100, skipped: true) }
        #expect(s.phase == .ready)
        #expect(Runner.completeSet(s, now: 9_000, slotId: first) == s)
        s = Runner.startBlock(s, now: 9_000)
        #expect(Runner.completeSet(s, now: 10_000, slotId: first) == s)
    }
}

/// review D14: resuming after the app was killed lost sets added with "+ Add set" and a
/// "Just this time" version.
@Suite("a resumed session keeps its own sheet")
@MainActor
struct ResumedSheetTests {
    static func straight() -> Runsheet {
        Runsheet(id: "k", title: "K", items: [.block(Block(id: "b", name: "B", repeatCount: 2, steps: [Fixtures.work("sw", Fixtures.swing, target: 28, forMode: .reps, forValue: 8)], restBetweenSec: 30))])
    }

    @Test("sets added with + Add set come back, on the sheet and in the count the finish screen asks about")
    func addedSets() throws {
        try SessionRunner.$savedName.withValue("test-\(UUID().uuidString).json") {
            let runner = SessionRunner(runsheet: Self.straight())
            runner.begin()
            runner.tick(at: runner.state.startedAt + 5_000)
            runner.addSet(blockId: "b")
            #expect(runner.addedSets == ["b": 1])
            let slots = runner.state.slots.map(\.id)
            let sheet = runner.runsheet
            runner.end()
            // The app is killed; the workout in the store is still the one with two sets.
            let back = try #require(SessionRunner(resuming: Self.straight()))
            #expect(back.state.slots.map(\.id) == slots)
            #expect(back.runsheet == sheet)
            #expect(back.runsheet.items.first?.asBlock?.repeatCount == 3)
            #expect(back.addedSets == ["b": 1])
            SessionRunner.clearSaved()
        }
    }

    @Test("a Just this time version comes back with its plan")
    func justThisTime() throws {
        try SessionRunner.$savedName.withValue("test-\(UUID().uuidString).json") {
            var once = Self.straight()
            once.items.append(.step(Fixtures.work("pr", Fixtures.press, target: 20, forMode: .reps, forValue: 10)))
            let runner = SessionRunner(runsheet: once)
            runner.planned = SessionVersion(items: once.items)
            runner.begin()
            runner.tick(at: runner.state.startedAt + 5_000)
            runner.done()
            runner.end()
            let saved = try #require(SessionRunner.readSaved())
            #expect(saved.sheet == once)
            #expect(saved.planned == SessionVersion(items: once.items))
            let back = try #require(SessionRunner(resuming: Self.straight()))
            #expect(back.runsheet == once)
            #expect(back.planned == SessionVersion(items: once.items))
            // Saved as it stands, the result is read against the sheet it ran.
            let found = SessionRunner.recovery(of: saved.state, savedAt: saved.savedAt, ran: saved.sheet, lookup: { _ in Self.straight() })
            #expect(found.sheet == once)
            #expect(found.canResume)
            SessionRunner.clearSaved()
        }
    }

    @Test("a copy from before the sheet was kept resumes on the workout")
    func oldCopy() throws {
        try SessionRunner.$savedName.withValue("test-\(UUID().uuidString).json") {
            let url = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent(SessionRunner.savedName)
            try JSONEncoder().encode(Runner.tick(Runner.start(Self.straight(), now: Date().timeIntervalSince1970 * 1000 - 60_000), now: Date().timeIntervalSince1970 * 1000 - 55_000)).write(to: url)
            let saved = try #require(SessionRunner.readSaved())
            #expect(saved.sheet == nil)
            #expect(saved.addedSets.isEmpty)
            #expect(SessionRunner(resuming: Self.straight())?.runsheet == Self.straight())
            SessionRunner.clearSaved()
        }
    }
}

/// review D14: the timer redrew ten times a second and re-sorted the history each time.
@Suite("the timer is drawn when a number on it changes")
@MainActor
struct TimerRedrawTests {
    static func runner() -> SessionRunner {
        let runner = SessionRunner(runsheet: Fixtures.interval())
        runner.onScreen = { true }
        return runner
    }

    /// How often a reader of the clock and the run is told to redraw across `ticks`.
    static func redraws(_ runner: SessionRunner, _ ticks: [Double]) -> Int {
        var n = 0
        for at in ticks {
            var fired = false
            withObservationTracking {
                _ = runner.clock
                _ = runner.elapsed
                _ = runner.state
            } onChange: { fired = true }
            runner.tick(at: at)
            if fired { n += 1 }
        }
        return n
    }

    @Test("ten ticks inside one second redraw nothing; the next second redraws once")
    func oncePerSecond() {
        SessionRunner.$savedName.withValue("test-\(UUID().uuidString).json") {
            let runner = Self.runner()
            let t0 = runner.state.startedAt
            runner.tick(at: t0 + 5_000) // the lead-in is over: 30 s of swings running
            runner.tick(at: t0 + 7_600) // 27.4 s left: reads 0:27, 0:03 in, 0:08 on the session, 2%
            let beat = runner.beat
            #expect(Self.redraws(runner, (1...6).map { t0 + 7_600 + Double($0) * 100 }) == 0)
            #expect(runner.beat == beat)
            // The clock itself is exact at every tick, drawn or not.
            #expect(runner.now == t0 + 8_200)
            #expect(abs((runner.clock.left ?? 0) - 26.8) < 0.001)
            #expect(Self.redraws(runner, [t0 + 8_600]) == 1)
            #expect(runner.beat == beat + 1)
            SessionRunner.clearSaved()
        }
    }

    @Test("paused, or off screen, the clock redraws nothing")
    func pausedOrHidden() {
        SessionRunner.$savedName.withValue("test-\(UUID().uuidString).json") {
            let runner = Self.runner()
            let t0 = runner.state.startedAt
            runner.tick(at: t0 + 5_000)
            runner.tick(at: t0 + 6_000)
            var visible = false
            runner.onScreen = { visible }
            // Locked: the run still moves on (the swings end at 35 s), the clock is not published.
            let beat = runner.beat
            #expect(Self.redraws(runner, [t0 + 7_000, t0 + 8_000, t0 + 9_000]) == 0)
            #expect(runner.beat == beat)
            runner.tick(at: t0 + 36_000)
            #expect(runner.slot?.kind == .rest)
            visible = true
            runner.tick(at: t0 + 36_100)
            #expect(runner.beat == beat + 1)
            runner.pauseOrResume()
            #expect(runner.state.phase == .paused)
            let paused = runner.beat
            #expect(Self.redraws(runner, (1...30).map { runner.now + Double($0) * 1_000 }) == 0)
            #expect(runner.beat == paused)
            SessionRunner.clearSaved()
        }
    }

    @Test("what the history says is worked out once per step, and again when the history changes")
    func historyMemo() {
        let memo = HistoryMemo()
        var r = SessionResult(runsheetId: "w", title: "W", startedAt: "2026-09-20T10:00:00Z")
        r.id = "one"
        var lookups = 0
        func last(_ results: [SessionResult]) -> Int {
            memo.value("sets|sw", results) { lookups += 1; return results.count }
        }
        #expect(last([r]) == 1)
        #expect(last([r]) == 1)
        #expect(lookups == 1)
        #expect(memo.value("sets|pr", [r]) { "other" } == "other")
        var later = r
        later.id = "two"
        later.startedAt = "2026-09-27T10:00:00Z"
        #expect(last([r, later]) == 2)
        #expect(lookups == 2)
        // A lookup that found nothing is kept too.
        let none: Int? = memo.value("none", [r, later]) { lookups += 1; return nil }
        let again: Int? = memo.value("none", [r, later]) { lookups += 1; return 7 }
        #expect(none == nil && again == nil)
        #expect(lookups == 3)
    }
}
