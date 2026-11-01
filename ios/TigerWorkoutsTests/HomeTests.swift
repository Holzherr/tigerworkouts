import Foundation
import Testing
@testable import TigerWorkouts

/// Ported from src/features/discover/mine.test.ts.
@Suite("home Mine list")
struct HomeTests {
    private func w(_ id: String, kind: String = "benchmark", createdAt: String? = nil, copyOf: String? = nil) -> Runsheet {
        var r = Runsheet(id: id, title: id)
        r.source = Source(title: id, kind: kind)
        r.createdAt = createdAt
        r.copyOf = copyOf
        return r
    }

    private func did(_ id: String, day: Int) -> SessionResult {
        SessionResult(runsheetId: id, title: id, startedAt: String(format: "2026-10-%02dT10:00:00Z", day))
    }

    private let swing = ExerciseRef(key: "kb_swing", name: "Kettlebell swings", unit: "kg", step: 4)

    @Test("your own not yet done on top, newest first, then the rest by last done or made")
    func order() {
        let fresh = w("u-fresh", kind: "user", createdAt: "2026-10-15T09:00:00Z")
        let old = w("u-old", kind: "user", createdAt: "2026-09-01T09:00:00Z")
        let done = w("u-done", kind: "user", createdAt: "2026-09-01T09:00:00Z")
        let all = [fresh, old, done, w("fran"), w("cindy")]
        let list = Home.mine(own: [fresh, old, done], all: all, saved: ["fran", "cindy", "u-old"], results: [did("fran", day: 10), did("cindy", day: 16), did("u-done", day: 12)])
        #expect(list.map(\.key) == ["u-fresh", "u-old", "cindy", "u-done", "fran"])
    }

    @Test("a workout you copied shows as the copy, and what the coach sent is left out")
    func copiesAndSkip() {
        let copy = w("u-fran", kind: "user", copyOf: "fran")
        let list = Home.mine(own: [copy], all: [copy, w("fran"), w("cindy")], saved: ["fran", "cindy"], results: [], skip: ["cindy"])
        #expect(list.map(\.key) == ["u-fran"])
    }

    @Test("the meta line says the difficulty and when it was last done, leaving new to the badge")
    func line() {
        let now = ISO8601.date("2026-10-17T12:00:00Z")!
        #expect(Home.line(minutes: 20, lastDone: ISO8601.date("2026-10-16T12:00:00Z"), now: now) == "20 min · last done yesterday")
        #expect(Home.line(minutes: 20, level: "Medium", lastDone: nil, now: now) == "20 min · Medium")
        #expect(Home.line(minutes: 20, lastDone: nil, now: now) == "20 min")
        #expect(Home.daysAgo(ISO8601.date("2026-10-17T08:00:00Z")!, now: now) == "today")
        #expect(Home.daysAgo(ISO8601.date("2026-10-12T08:00:00Z")!, now: now) == "5 days ago")
        #expect(Home.daysAgo(ISO8601.date("2026-09-17T08:00:00Z")!, now: now) == "4 weeks ago")
    }

    @Test("a card lists what is in it by block name, without warm-up, rests or repeats")
    func contents() {
        let step = Step.exercise(ExerciseStep(id: "e1", exercise: swing))
        var warm = ExerciseStep(id: "e0", exercise: swing)
        warm.role = .warmup
        var r = w("u-a")
        r.items = [
            .step(.exercise(warm)),
            .block(Block(id: "b1", name: "Swings", repeatCount: 8, steps: [step])),
            .block(Block(id: "b2", name: "Swings", repeatCount: 4, steps: [step])),
            .step(.rest(RestStep(id: "r1", seconds: 60))),
            .block(Block(id: "b3", name: "Abs", repeatCount: 3, steps: [step])),
            .step(.exercise(ExerciseStep(id: "e2", exercise: ExerciseRef(key: "bw_burpee", name: "Burpees", unit: "", step: 1)))),
        ]
        #expect(Home.contents(r) == "Swings · Abs · Burpees")
    }

    @Test("the why is the description's first sentence; made for you when a coach made it")
    func whyAndBadge() {
        var r = w("u-a")
        r.description = "Pull, legs and abs to balance the swings session. Same 30 on / 30 off."
        #expect(Home.why(r) == "Pull, legs and abs to balance the swings session.")
        #expect(Home.why(w("u-b")) == nil)
        r.creator = "AI Coach"
        #expect(Home.badge(r) == "New · made for you")
        r.creator = "Coach Sam"
        #expect(Home.badge(r) == "New · made for you")
        r.creator = "Nick"
        #expect(Home.badge(r) == "New")
    }

    @Test("Up next is the first new one, else the one done longest ago")
    func upNext() {
        let list = [w("u-new"), w("a"), w("b")]
        let last = Home.lastDone([did("a", day: 16), did("b", day: 2)])
        #expect(Home.upNext(list, own: ["u-new", "a"], last: last) == "u-new")
        #expect(Home.upNext(Array(list.dropFirst()), own: ["a"], last: last) == "b")
        #expect(Home.upNext([w("c")], own: [], last: last) == nil)
    }

    private func lead(_ own: [Runsheet], _ results: [SessionResult]) -> (next: String?, keys: [String]) {
        let list = Home.mine(own: own, all: [], saved: [], results: results)
        let next = Home.upNext(list, own: Set(own.map(\.key)), last: Home.lastDone(results))
        return (next, Home.upNextFirst(list) { $0.key == next }.map(\.key))
    }

    @Test("all done: the one done longest ago is first as Up next, the rest newest first")
    func upNextFirstAllDone() {
        let (next, keys) = lead([w("u-a"), w("u-b"), w("u-c"), w("u-d")], [did("u-a", day: 22), did("u-b", day: 24), did("u-c", day: 25), did("u-d", day: 26)])
        #expect(next == "u-a" && keys == ["u-a", "u-d", "u-c", "u-b"])
    }

    @Test("your own not yet done stays first as Up next (18 Oct order)")
    func upNextFirstFresh() {
        let (next, keys) = lead([w("u-a"), w("u-b"), w("u-new", createdAt: "2026-10-01T09:00:00Z")], [did("u-a", day: 22), did("u-b", day: 24)])
        #expect(next == "u-new" && keys == ["u-new", "u-b", "u-a"])
    }

    @Test("starting the Up next card saves up_next; another Mine card still saves mine or saved")
    @MainActor
    func upNextOrigin() throws {
        let started = { SessionRunner(runsheet: Fixtures.interval(), startedFrom: Home.origin(of: self.w($0), own: ["u-a", "u-b"], next: "u-a")).result().startedFrom }
        #expect(["u-a", "u-b", "fran"].map(started) == ["up_next", "mine", "saved"])
        let saved = SessionResult(runsheetId: "u-a", title: "u-a", startedAt: "2026-10-28T10:00:00Z", startedFrom: "up_next")
        let back = try JSONDecoder().decode(SessionResult.self, from: JSONEncoder().encode(saved))
        #expect(back.startedFrom.flatMap(SessionOrigin.init(rawValue:)) == .upNext)
    }
}
