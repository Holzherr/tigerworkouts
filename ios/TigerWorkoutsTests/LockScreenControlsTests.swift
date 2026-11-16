import Foundation
import Testing
import SwiftUI
import WidgetKit
@testable import TigerWorkouts

/// The Lock Screen buttons and what the card shows for them. The intents themselves only forward
/// to `SessionControls`; what matters is what the running session does with a tap.
@Suite("lock screen controls")
@MainActor
struct LockScreenControlsTests {
    @Test("the card shows load × reps for the set, and the next set's during a rest")
    func setLine() {
        let sheet = SetPlanTests.pyramid(SetPlanTests.full)
        let lead = Runner.start(sheet, now: 0)
        #expect(SessionRunner.lockScreenState(lead, runsheet: sheet, now: 1_000).setLine == "60 kg × 10")
        #expect(SessionRunner.lockScreenState(lead, runsheet: sheet, now: 1_000).action == .start)

        let set1 = Runner.tick(lead, now: 5_000)
        let working = SessionRunner.lockScreenState(set1, runsheet: sheet, now: 6_000)
        #expect(working.setLine == "60 kg × 10")
        #expect(working.action == .done)

        let rest = Runner.advance(set1, now: 20_000)
        let resting = SessionRunner.lockScreenState(rest, runsheet: sheet, now: 21_000)
        #expect(resting.setLine == "70 kg × 8")
        #expect(resting.action == .rest)
        #expect(resting.token != working.token)

        // Counted reps win over the plan.
        let counted = Runner.setReps(set1, reps: 12)
        #expect(SessionRunner.lockScreenState(counted, runsheet: sheet, now: 7_000).setLine == "60 kg × 12")
    }

    @Test("a timed bodyweight step has no set line; a paused session offers only Resume")
    func timedAndPaused() {
        let sheet = Fixtures.interval()
        let s = Runner.tick(Runner.start(sheet, now: 0), now: 5_000)
        #expect(SessionRunner.lockScreenState(s, runsheet: sheet, now: 6_000).setLine == "28 kg")
        let tabata = Runsheet(id: "t", title: "T", items: [.block(Block(id: "b", name: "B", repeatCount: 2, steps: [Fixtures.work("sq", Fixtures.squat, forMode: .seconds, forValue: 20)]))])
        let t = Runner.tick(Runner.start(tabata, now: 0), now: 5_000)
        #expect(SessionRunner.lockScreenState(t, runsheet: tabata, now: 6_000).setLine == nil)
        // A countdown's button is Pause, as in the app: Done five seconds in logged a 5 s set.
        #expect(SessionRunner.lockScreenState(t, runsheet: tabata, now: 6_000).action == .pause)
        #expect(SessionRunner.lockScreenState(s, runsheet: sheet, now: 6_000).action == .pause)
        let paused = Runner.pause(s, now: 10_000)
        #expect(SessionRunner.lockScreenState(paused, runsheet: sheet, now: 11_000).action == .resume)
    }

    @Test("the card still holds still within a slot")
    func stable() {
        let sheet = SetPlanTests.pyramid(SetPlanTests.full)
        let s = Runner.tick(Runner.start(sheet, now: 0), now: 5_000)
        #expect(SessionRunner.lockScreenState(s, runsheet: sheet, now: 6_000) == SessionRunner.lockScreenState(s, runsheet: sheet, now: 50_000))
    }

    @Test("Done, +15 s and Skip rest drive the running session")
    func controls() {
        SessionRunner.$savedName.withValue("test-\(UUID().uuidString).json") {
            let runner = SessionRunner(runsheet: SetPlanTests.pyramid(SetPlanTests.full))
            #expect(runner.state.phase == .lead)
            runner.control(.done, token: SessionRunner.token(runner.state)) // Start, from the lead-in
            #expect(runner.state.phase == .running)
            #expect(runner.slot?.kind == .work)

            runner.control(.done, token: SessionRunner.token(runner.state))
            #expect(runner.slot?.kind == .rest)
            #expect(runner.state.actuals.values.contains { $0.doneAt != nil })

            let ends = runner.state.endsAt ?? 0
            runner.control(.extendRest, token: SessionRunner.token(runner.state))
            #expect((runner.state.endsAt ?? 0) >= ends + 14_900)

            runner.control(.skipRest, token: SessionRunner.token(runner.state))
            #expect(runner.slot?.kind == .work)
            #expect(runner.slot?.round == 1)
        }
    }

    @Test("Pause on timed work pauses it and logs nothing; Resume carries on; rep sets keep Done")
    func pauseTimedWork() {
        SessionRunner.$savedName.withValue("test-\(UUID().uuidString).json") {
            let runner = SessionRunner(runsheet: Fixtures.interval())
            runner.control(.done, token: SessionRunner.token(runner.state)) // Start, from the lead-in
            #expect(runner.state.phase == .running)
            #expect(runner.slot?.kind == .work)
            #expect(SessionRunner.lockScreenState(runner.state, runsheet: runner.runsheet, now: runner.now).action == .pause)

            runner.control(.pause, token: SessionRunner.token(runner.state))
            #expect(runner.state.phase == .paused)
            #expect(!runner.state.actuals.values.contains { $0.doneAt != nil })
            #expect(SessionRunner.lockScreenState(runner.state, runsheet: runner.runsheet, now: runner.now).action == .resume)

            runner.control(.resume, token: SessionRunner.token(runner.state))
            #expect(runner.state.phase == .running)
            #expect(runner.slot?.exercise?.id == "sw")

            // A rest is not paused from the card: it has +15 s and Skip rest.
            runner.done()
            #expect(runner.slot?.kind == .rest)
            let rest = runner.state
            runner.control(.pause, token: SessionRunner.token(runner.state))
            #expect(runner.state == rest)
        }
        // EMOM reps run against the minute, but Done logs the set: the card keeps Done.
        let emom = Runsheet(id: "e", title: "E", items: [.block(Block(id: "b", name: "B", repeatCount: 3, mode: .emom, steps: [Fixtures.work("bu", Fixtures.burpee, forMode: .reps, forValue: 5)]))])
        let e = Runner.tick(Runner.start(emom, now: 0), now: 5_000)
        #expect(e.phase == .running)
        #expect(SessionRunner.lockScreenState(e, runsheet: emom, now: 7_000).action == .done)
    }

    @Test("a tap from a card that is behind the session does nothing")
    func staleTap() {
        SessionRunner.$savedName.withValue("test-\(UUID().uuidString).json") {
            let runner = SessionRunner(runsheet: SetPlanTests.pyramid(SetPlanTests.full))
            let leadToken = SessionRunner.token(runner.state)
            runner.control(.done, token: leadToken)
            let before = runner.state
            runner.control(.done, token: leadToken) // the same Start, tapped twice
            #expect(runner.state == before)
            runner.control(.skipRest, token: SessionRunner.token(runner.state)) // not on a rest
            #expect(runner.state == before)
            runner.control(.extendRest, token: nil) // Shortcuts, on a work step
            #expect(runner.state == before)
        }
    }

    @Test("a running session is what the intents reach, and only while it runs")
    func registration() {
        SessionRunner.$savedName.withValue("test-\(UUID().uuidString).json") {
            let runner = SessionRunner(runsheet: Fixtures.interval())
            runner.begin()
            #expect(SessionControls.active === runner)
            runner.end()
            #expect(SessionControls.active == nil)
        }
    }
}

@Suite("up next widget")
@MainActor
struct UpNextWidgetTests {
    private func did(_ id: String, _ iso: String) -> SessionResult {
        SessionResult(runsheetId: id, title: id, startedAt: iso, durationSec: 1_800)
    }

    private var all: [Runsheet] {
        var a = Runsheet(id: "a", title: "Day A")
        a.program = ProgramRef(name: "P", day: "A", order: 1)
        var b = Runsheet(id: "b", title: "Day B")
        b.program = ProgramRef(name: "P", day: "B", order: 2)
        return [a, b]
    }

    @Test("carries the same pick as the Up next card, and a link that starts it")
    func pick() {
        let now = ISO8601DateFormatter().date(from: "2026-09-24T12:00:00Z")!
        // Day A twice this month, day B once: A is the usual one, and it leads Mine too.
        let results = [did("a", "2026-09-20T10:00:00Z"), did("a", "2026-09-16T10:00:00Z"), did("b", "2026-09-22T10:00:00Z")]
        let snap = Store.upNextSnapshot(own: all, all: all, results: results, now: now)
        let mine = Home.mine(own: all, all: all, saved: [], results: results)
        #expect(snap.workoutId == NextUp.pick(mine, own: ["a", "b"], results: results, now: now)?.id)
        #expect(snap.workoutId == "a")
        #expect(snap.reason == "Up next · your usual")
        #expect(snap.detail?.hasSuffix(" min · 2 of your last 3") == true)
        #expect(snap.url.absoluteString == "tigerworkouts://do/a")
        #expect(UpNextSnapshot.workoutId(fromStart: snap.url) == "a")
        var odd = snap
        odd.workoutId = "u-1 my/day"
        #expect(UpNextSnapshot.workoutId(fromStart: odd.url) == "u-1 my/day")
        // A workout of yours not done yet comes first; what a coach sent comes before that.
        let fresh = Runsheet(id: "u-new", title: "New one")
        #expect(Store.upNextSnapshot(own: all + [fresh], all: all, results: results, now: now).reason == "New")
        let sent = Runsheet(id: "c-1", title: "From coach")
        let coached = Store.upNextSnapshot(own: all + [fresh], all: all, coach: [(sheet: sent, done: false)], results: results, now: now)
        #expect(coached.workoutId == "c-1" && coached.reason == "New · made for you")
        #expect(Store.upNextSnapshot(own: all + [fresh], all: all, coach: [(sheet: sent, done: true)], results: results, now: now).workoutId == "u-new")
        // Saved from the catalogue, done once long ago: the fallback, plain "Up next".
        let old = Store.upNextSnapshot(own: [], all: all, saved: ["b"], results: [did("b", "2026-08-01T10:00:00Z")], now: now)
        #expect(old.workoutId == "b" && old.reason == "Up next")
    }

    @Test("counts this week at draw time, so Monday starts from nothing")
    func week() {
        let results = [did("a", "2026-09-21T10:00:00Z"), did("b", "2026-09-23T10:00:00Z"), did("a", "2026-09-17T10:00:00Z")]
        let snap = Store.upNextSnapshot(own: all, all: all, results: results, now: ISO8601DateFormatter().date(from: "2026-09-24T12:00:00Z")!)
        #expect(snap.thisWeek(now: ISO8601DateFormatter().date(from: "2026-09-24T12:00:00Z")!) == 2)
        #expect(snap.thisWeek(now: ISO8601DateFormatter().date(from: "2026-09-28T09:00:00Z")!) == 0)
    }

    @Test("with no history it picks nothing, and opens the app")
    func empty() {
        let snap = Store.upNextSnapshot(own: [], all: all, results: [])
        #expect(snap.workoutId == nil)
        #expect(snap.url.absoluteString == "tigerworkouts://")
    }

    /// The simulator cannot screenshot a home-screen widget from a test, so draw its face here and
    /// attach it: `xcrun xcresulttool export attachments` pulls these out with the walkthroughs'.
    @Test("draws small and medium, with and without history")
    func render() {
        let now = Date()
        let snap = UpNextSnapshot(workoutId: "b", title: "StrongLifts 5×5 — Workout B", reason: "Next in StrongLifts 5×5",
                                  detail: "45 min · Day B", sessions: [now.addingTimeInterval(-3_600)])
        let cases: [(String, UpNextSnapshot?, WidgetFamily, CGSize)] = [
            ("Widget small", snap, .systemSmall, CGSize(width: 170, height: 170)),
            ("Widget medium", snap, .systemMedium, CGSize(width: 364, height: 170)),
            ("Widget small, no history", nil, .systemSmall, CGSize(width: 170, height: 170)),
            ("Widget medium, no history", nil, .systemMedium, CGSize(width: 364, height: 170)),
        ]
        for (name, s, family, size) in cases {
            let view = UpNextWidgetView(snapshot: s, now: now, family: family)
                .padding(16)
                .frame(width: size.width, height: size.height)
                .background(Color(.systemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                .padding(12)
                .background(Color.gray.opacity(0.3))
            let renderer = ImageRenderer(content: view)
            renderer.scale = 3
            guard let png = renderer.uiImage?.pngData() else {
                Issue.record("\(name) did not render")
                continue
            }
            Attachment.record(png, named: "\(name).png")
        }
    }
}
