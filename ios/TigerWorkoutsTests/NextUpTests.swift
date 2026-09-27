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
}
