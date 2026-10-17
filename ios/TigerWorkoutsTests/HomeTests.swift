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

    @Test("own and saved merge, newest of last done or made first, a workout just made on top")
    func order() {
        let fresh = w("u-fresh", kind: "user", createdAt: "2026-10-15T09:00:00Z")
        let old = w("u-old", kind: "user", createdAt: "2026-09-01T09:00:00Z")
        let all = [fresh, old, w("fran"), w("cindy")]
        let list = Home.mine(own: [fresh, old], all: all, saved: ["fran", "cindy", "u-old"], results: [did("fran", day: 10), did("cindy", day: 16)])
        #expect(list.map(\.key) == ["cindy", "u-fresh", "fran", "u-old"])
    }

    @Test("a workout you copied shows as the copy, and what the coach sent is left out")
    func copiesAndSkip() {
        let copy = w("u-fran", kind: "user", copyOf: "fran")
        let list = Home.mine(own: [copy], all: [copy, w("fran"), w("cindy")], saved: ["fran", "cindy"], results: [], skip: ["cindy"])
        #expect(list.map(\.key) == ["u-fran"])
    }

    @Test("the meta line says when it was last done, or new for your own")
    func line() {
        let now = ISO8601.date("2026-10-17T12:00:00Z")!
        #expect(Home.line(minutes: 20, lastDone: ISO8601.date("2026-10-16T12:00:00Z"), isNew: false, now: now) == "20 min · last done yesterday")
        #expect(Home.line(minutes: 20, lastDone: nil, isNew: true, now: now) == "20 min · new")
        #expect(Home.line(minutes: 20, lastDone: nil, isNew: false, now: now) == "20 min")
        #expect(Home.daysAgo(ISO8601.date("2026-10-17T08:00:00Z")!, now: now) == "today")
        #expect(Home.daysAgo(ISO8601.date("2026-10-12T08:00:00Z")!, now: now) == "5 days ago")
        #expect(Home.daysAgo(ISO8601.date("2026-09-17T08:00:00Z")!, now: now) == "4 weeks ago")
    }
}
