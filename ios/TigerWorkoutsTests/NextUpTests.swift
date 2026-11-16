import Foundation
import Testing
@testable import TigerWorkouts

/// Ported from src/features/discover/next-up.test.ts.
@Suite("next up")
struct NextUpTests {
    private func w(_ id: String, program: ProgramRef? = nil) -> Runsheet {
        var r = Runsheet(id: id, title: id)
        r.program = program
        return r
    }

    private func did(_ id: String, day: Int, seconds: Double? = nil) -> SessionResult {
        SessionResult(runsheetId: id, title: id, startedAt: String(format: "2026-09-%02dT10:00:00Z", day), durationSec: seconds)
    }

    private var all: [Runsheet] {
        [w("a", program: ProgramRef(name: "P", day: "A", order: 1)), w("b", program: ProgramRef(name: "P", day: "B", order: 2)), w("fran")]
    }

    @Test("an edited copy of a program day stands in for the day")
    func editedCopy() {
        var mine = w("u-a", program: ProgramRef(name: "P", day: "A", order: 1))
        mine.copyOf = "a"
        let list = [mine] + all
        #expect(NextUp.find(in: list, results: [did("u-a", day: 20)])?.runsheet.id == "b")
        #expect(NextUp.find(in: list, results: [did("b", day: 20)])?.runsheet.id == "u-a")
        #expect(NextUp.find(in: [mine, w("a", program: ProgramRef(name: "P", day: "A", order: 1)), w("fran")], results: [did("a", day: 20)])?.runsheet.id == "u-a")
    }

    @Test("two copies of one day are one day, the later copy standing in, as on the web")
    func twoCopies() {
        var first = w("u-a1", program: ProgramRef(name: "P", day: "A", order: 1))
        first.copyOf = "a"
        var second = w("u-a2", program: ProgramRef(name: "P", day: "A", order: 1))
        second.copyOf = "a"
        let list = [first, second] + all
        #expect(NextUp.find(in: list, results: [did("u-a1", day: 20)])?.runsheet.id == "b")
        #expect(NextUp.find(in: list, results: [did("a", day: 20)])?.runsheet.id == "b")
        #expect(NextUp.find(in: list, results: [did("b", day: 20)])?.runsheet.id == "u-a2")
    }

    @Test("is nothing without history")
    func empty() {
        #expect(NextUp.find(in: all, results: []) == nil)
    }

    @Test("offers the next day of the program the last session was in")
    func programNext() {
        let n = NextUp.find(in: all, results: [did("a", day: 20)])
        #expect(n?.runsheet.id == "b")
        #expect(n?.reason == "Next in P")
    }

    @Test("wraps round to day one after the last day")
    func wraps() {
        #expect(NextUp.find(in: all, results: [did("b", day: 20)])?.runsheet.id == "a")
    }

    @Test("offers the last workout again when it is not in a program")
    func repeatLast() {
        let n = NextUp.find(in: all, results: [did("a", day: 18), did("fran", day: 20)])
        #expect(n?.runsheet.id == "fran")
        #expect(n?.reason == "Your last workout")
    }

    @Test("goes by date, not list order, and skips sessions whose workout is gone")
    func byDate() {
        #expect(NextUp.find(in: all, results: [did("fran", day: 10), did("gone", day: 25), did("a", day: 20)])?.runsheet.id == "b")
    }

    @Test("adds up time trained and formats hours")
    func total() {
        #expect(NextUp.totalMinutes([did("a", day: 1, seconds: 1800), did("b", day: 2, seconds: 1500)]) == 55)
        #expect(NextUp.format(minutes: 45) == "45 min")
        #expect(NextUp.format(minutes: 200) == "3 h 20")
        #expect(NextUp.format(minutes: 120) == "2 h")
    }

    // MARK: - The Up next card (review D2). The same cases as `pickUpNext` in next-up.test.ts.

    private static let now = ISO8601.date("2026-11-15T12:00:00Z")!

    private func ago(_ id: String, hours: Double) -> SessionResult {
        SessionResult(runsheetId: id, title: id, startedAt: ISO8601.string(Self.now.addingTimeInterval(-hours * 3_600)))
    }

    private func days(_ id: String, _ d: Double) -> SessionResult { ago(id, hours: d * 24) }

    private var list: [Runsheet] { [w("swings"), w("rows"), w("press")] }
    private let own: Set<String> = ["swings", "rows", "press"]
    /// Nick's history on 15 Nov: swings 4 of the last 5, the others once each in October.
    private var history: [SessionResult] {
        [days("swings", 8), days("swings", 10), days("swings", 12), days("rows", 28.5), days("swings", 14), days("press", 27)]
    }

    @Test("Up next is the workout started most in the last 28 days, with how many of the last five")
    func usual() {
        let pick = NextUp.pick(list, own: own, results: history, now: Self.now)
        #expect(pick == NextUp.Pick(id: "swings", why: .usual, count: 4, of: 5))
        #expect(NextUp.badge(pick) == "Up next · your usual")
        #expect(NextUp.usualLine(pick) == "4 of your last 5")
    }

    @Test("a new workout of yours comes first")
    func newFirst() {
        #expect(NextUp.pick(list + [w("new")], own: own.union(["new"]), results: history, now: Self.now) == NextUp.Pick(id: "new", why: .new))
        // Saved from the catalogue and never done is not yours to do next.
        #expect(NextUp.pick(list + [w("saved")], own: own, results: history, now: Self.now)?.id == "swings")
    }

    @Test("done in the last 20 hours: the next most started")
    func justDone() {
        let twice = history + [days("press", 20)]
        let a = NextUp.pick(list, own: own, results: twice + [ago("swings", hours: 19)], now: Self.now)
        #expect(a?.id == "press" && a?.why == .usual)
        let b = NextUp.pick(list, own: own, results: twice + [ago("swings", hours: 21)], now: Self.now)
        #expect(b?.id == "swings" && b?.why == .usual)
    }

    @Test("done longest ago is the fallback")
    func oldest() {
        // Nothing started twice in 28 days.
        let pick = NextUp.pick(list, own: own, results: [days("swings", 3), days("rows", 40), days("press", 30)], now: Self.now)
        #expect(pick == NextUp.Pick(id: "rows", why: .oldest))
        #expect(NextUp.badge(pick) == "Up next")
        #expect(NextUp.usualLine(pick) == nil)
        // The usual one done this morning and nothing else started twice.
        #expect(NextUp.pick(list, own: own, results: history + [ago("swings", hours: 2)], now: Self.now) == NextUp.Pick(id: "rows", why: .oldest))
    }

    @Test("between two started as often, the one done longer ago")
    func tie() {
        let results = [days("swings", 2), days("swings", 9), days("rows", 3), days("rows", 5)]
        #expect(NextUp.pick(Array(list.prefix(2)), own: own, results: results, now: Self.now)?.id == "rows")
    }

    @Test("a copy counts its original's sessions; sessions older than 28 days do not count")
    func copyAndWindow() {
        var copy = w("u-swings")
        copy.copyOf = "swings"
        let results = [days("swings", 3), days("u-swings", 5), days("rows", 29), days("rows", 30), days("rows", 31)]
        #expect(NextUp.pick([copy, w("rows")], own: ["u-swings"], results: results, now: Self.now) == NextUp.Pick(id: "u-swings", why: .usual, count: 2, of: 5))
    }

    @Test("nothing with no workout done and none new; no count line for one of the last five")
    func nothing() {
        #expect(NextUp.pick([w("saved")], own: [], results: [], now: Self.now) == nil)
        #expect(NextUp.usualLine(NextUp.Pick(id: "a", why: .usual, count: 1, of: 5)) == nil)
    }
}
