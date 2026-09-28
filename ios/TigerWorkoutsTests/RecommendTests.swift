import Foundation
import Testing
@testable import TigerWorkouts

/// Ported one for one from `src/features/discover/recommend.test.ts`.
@Suite("recommend")
struct RecommendTests {
    private func w(_ id: String, title: String? = nil, keys: [String] = ["kb_swing"], program: ProgramRef? = nil, source: Source? = nil) -> Runsheet {
        let steps = keys.enumerated().map { i, k in
            Item.step(.exercise(ExerciseStep(id: "\(id)-\(i)", exercise: ExerciseRef(key: k, name: k, unit: "reps", step: 1), forMode: .reps, forValue: 10)))
        }
        var r = Runsheet(id: id, title: title ?? id, items: steps)
        r.program = program
        r.source = source
        return r
    }
    private func src(_ kind: String, _ author: String) -> Source { Source(title: "", author: author, kind: kind) }
    private func did(_ id: String, day: Int = 6) -> SessionResult {
        SessionResult(runsheetId: id, title: id, startedAt: String(format: "2026-09-%02d", day))
    }
    private func ids(_ r: [Recommendation]) -> [String] { r.map(\.runsheet.key) }

    private var all: [Runsheet] {
        [
            w("a1", program: ProgramRef(name: "P", day: "1", order: 1), source: src("program", "X")),
            w("a2", program: ProgramRef(name: "P", day: "2", order: 2), source: src("program", "X")),
            w("fran", keys: ["bw_pullup"], source: src("benchmark", "CrossFit")),
            w("cindy", title: "Cindy", keys: ["bw_pullup", "bw_pushup", "bw_squat"], source: src("benchmark", "CrossFit")),
            w("vid", keys: ["bw_pushup"], source: src("video", "Pamela Reif")),
        ]
    }

    @Test("cold start gives a curated list")
    func coldStart() {
        let r = Recommend.recommend(all, results: [])
        #expect(!r.isEmpty)
        #expect(r.contains { $0.runsheet.title == "Cindy" })
    }

    @Test("puts the next program day first")
    func programNext() {
        let r = Recommend.recommend(all, results: [did("a1")])
        #expect(r[0].runsheet.key == "a2")
        #expect(r[0].reason == "Next in P")
    }

    @Test("one Fran does not bring in Cindy: one shared exercise and one session by the author is not enough")
    func oneFran() {
        let r = Recommend.recommend(all, results: [did("fran")])
        #expect(!ids(r).contains("fran"))
        #expect(!ids(r).contains("cindy"))
    }

    // Nick's own workouts and one sampled benchmark, the shape of his real history
    private var me: Source { src("user", "nick@example.com") }
    private var cf: Source { src("benchmark", "CrossFit") }
    private var mine: [Runsheet] {
        [
            w("n1", keys: ["bb_back_squat", "bw_pushup"], source: me),
            w("n2", keys: ["bb_deadlift", "bw_pullup"], source: me),
            w("n3", keys: ["bw_lunge"], source: me),
        ]
    }
    private var history: [SessionResult] { [did("n1", day: 8), did("n2", day: 7), did("fran", day: 6)] }

    @Test("drops a catalogue workout that shares exactly one exercise and has no creator match")
    func oneShared() {
        let one = w("nhs-day", keys: ["bb_back_squat", "bw_burpee"], source: src("program", "NHS"))
        let r = Recommend.recommend(mine + [one], results: [did("n1"), did("n2")])
        #expect(!ids(r).contains("nhs-day"))
    }

    @Test("ranks a third workout by a creator done twice above every benchmark, and one sampled benchmark does not reopen its source")
    func creatorTwice() {
        let fran = w("fran", keys: ["bw_pullup"], source: cf)
        let cindy = w("cindy", keys: ["bw_pullup", "bw_pushup", "bw_squat"], source: cf)
        let grace = w("grace", keys: ["bb_deadlift", "bw_burpee"], source: cf)
        let r = Recommend.recommend(mine + [fran, cindy, grace], results: history)
        #expect(ids(r).first == "n3")
        #expect(r[0].reason == "More from nick@example.com")
        #expect(ids(r).contains("cindy"))
        #expect(!ids(r).contains("grace"))
        #expect(!ids(r).contains("fran"))
    }

    @Test("never offers a mid-program day of a program with no session, even while another program is in progress")
    func unstartedProgram() {
        let q = (1...3).map { (n: Int) -> Runsheet in w("q\(n)", keys: ["bb_back_squat", "bw_pushup"], program: ProgramRef(name: "Q", day: "\(n)", order: n), source: src("program", "Y")) }
        let r = Recommend.recommend(all + mine + q, results: [did("a1", day: 9)] + history, saved: ["q3"])
        #expect(ids(r).first == "a2")
        #expect(!ids(r).contains("q3"))
        #expect(ids(r).contains("q1"))
    }

    @Test("returns at most 6 by default and honours an explicit limit")
    func limits() {
        let pri = src("user", "Priyanka")
        let many = (1...5).map { w("n\($0)", keys: ["bb_back_squat", "bw_pushup"], source: me) }
            + (1...5).map { w("p\($0)", keys: ["bb_back_squat", "bw_pushup"], source: pri) }
            + (1...3).map { w("b\($0)", keys: ["bb_back_squat", "bw_pushup"], source: cf) }
        let hist = [did("n1", day: 9), did("n2", day: 8), did("p1", day: 7), did("p2", day: 6)]
        #expect(Recommend.recommend(many, results: hist).count == 6)
        #expect(Recommend.recommend(many, results: hist, limit: 3).count == 3)
        #expect(Recommend.recommend(many, results: hist, limit: 20).count == 9)
    }

    @Test("lets in a coach workout when that coach has been done twice")
    func coach() {
        let coach = src("coach", "Coach A")
        let c = (1...3).map { w("c\($0)", keys: ["bw_plank"], source: coach) }
        let r = Recommend.recommend(mine + c, results: [did("c1", day: 8), did("c2", day: 7)])
        #expect(ids(r) == ["c3"])
        #expect(r[0].reason == "More from Coach A")
    }

    @Test("consecutive picks with one reason share a header")
    func grouping() {
        let a = Recommendation(runsheet: w("x"), reason: "R", score: 1)
        let b = Recommendation(runsheet: w("y"), reason: "R", score: 1)
        let c = Recommendation(runsheet: w("z"), reason: "S", score: 1)
        #expect(Recommend.grouped([a, b, c]).map(\.reason) == ["R", "S"])
        #expect(Recommend.grouped([a, b, c])[0].picks.count == 2)
    }
}
