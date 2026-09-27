import Foundation
import Testing
@testable import TigerWorkouts

/// Anchors `Bundle(for:)` on the test bundle, which is where the exported catalogue lands.
private final class RecommendBundleToken {}

/// Ported from src/features/discover/recommend.test.ts, case for case.
@Suite("recommend")
struct RecommendTests {
    private func w(_ id: String, title: String? = nil, keys: [String] = ["kb_swing"], program: ProgramRef? = nil, source: Source? = nil) -> Runsheet {
        var r = Runsheet(id: id, title: title ?? id, items: keys.map { key -> Item in
            .step(.exercise(ExerciseStep(id: key, exercise: ExerciseRef(key: key, name: key, unit: "", step: 1), forMode: .reps, forValue: 10)))
        })
        r.program = program
        r.source = source
        return r
    }

    private func did(_ id: String, day: Int = 6) -> SessionResult {
        SessionResult(runsheetId: id, title: id, startedAt: String(format: "2026-09-%02dT10:00:00Z", day))
    }

    private func ids(_ r: [Recommendation]) -> [String] { r.map(\.runsheet.key) }

    private func src(_ kind: String, _ author: String) -> Source { Source(title: "", author: author, kind: kind) }

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
        let r = recommend(all: all, results: [])
        #expect(!r.isEmpty)
        #expect(r.contains { $0.runsheet.title == "Cindy" })
    }

    @Test("puts the next program day first")
    func programNext() {
        let r = recommend(all: all, results: [did("a1")])
        #expect(r.first?.runsheet.key == "a2")
        #expect(r.first?.reason == "Next in P")
    }

    @Test("one Fran does not bring in Cindy: one shared exercise and one session by the author is not enough")
    func oneFran() {
        let r = recommend(all: all, results: [did("fran")])
        #expect(!ids(r).contains("fran"))
        #expect(!ids(r).contains("cindy"))
    }

    // The user's own workouts and one sampled benchmark, the shape of a real history.
    private var me: Source { src("user", "sam@example.com") }
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
    func oneSharedExercise() {
        let one = w("nhs-day", keys: ["bb_back_squat", "bw_burpee"], source: src("program", "NHS"))
        let r = recommend(all: mine + [one], results: [did("n1"), did("n2")])
        #expect(!ids(r).contains("nhs-day"))
    }

    @Test("ranks a third workout by a creator done twice above every benchmark, and one sampled benchmark does not reopen its source")
    func creatorOutranksOverlap() {
        let fran = w("fran", keys: ["bw_pullup"], source: cf)
        let cindy = w("cindy", keys: ["bw_pullup", "bw_pushup", "bw_squat"], source: cf)
        let grace = w("grace", keys: ["bb_deadlift", "bw_burpee"], source: cf)
        let r = recommend(all: mine + [fran, cindy, grace], results: history)
        #expect(ids(r).first == "n3")
        #expect(r.first?.reason == "More from sam@example.com")
        #expect(ids(r).contains("cindy")) // two shared exercises
        #expect(!ids(r).contains("grace")) // one shared exercise, CrossFit done once
        #expect(!ids(r).contains("fran"))
    }

    @Test("never offers a mid-program day of a program with no session, even while another program is in progress")
    func noMidProgramDay() {
        let q = [1, 2, 3].map { n in
            w("q\(n)", keys: ["bb_back_squat", "bw_pushup"], program: ProgramRef(name: "Q", day: String(n), order: n), source: src("program", "Y"))
        }
        let r = recommend(all: all + mine + q, results: [did("a1", day: 9)] + history, saved: ["q3"])
        #expect(ids(r).first == "a2")
        #expect(!ids(r).contains("q3"))
        #expect(ids(r).contains("q1"))
    }

    @Test("returns at most 6 by default and honours an explicit limit")
    func limit() {
        let pri = src("user", "Alex")
        let many = [1, 2, 3, 4, 5].map { w("n\($0)", keys: ["bb_back_squat", "bw_pushup"], source: me) }
            + [1, 2, 3, 4, 5].map { w("p\($0)", keys: ["bb_back_squat", "bw_pushup"], source: pri) }
            + [1, 2, 3].map { w("b\($0)", keys: ["bb_back_squat", "bw_pushup"], source: cf) }
        let hist = [did("n1", day: 9), did("n2", day: 8), did("p1", day: 7), did("p2", day: 6)]
        #expect(recommend(all: many, results: hist).count == 6)
        #expect(recommend(all: many, results: hist, limit: 3).count == 3)
        #expect(recommend(all: many, results: hist, limit: 20).count == 9)
    }

    @Test("lets in a coach workout when that coach has been done twice")
    func coachTwice() {
        let coach = src("coach", "Coach A")
        let c = [1, 2, 3].map { w("c\($0)", keys: ["bw_plank"], source: coach) }
        let r = recommend(all: mine + c, results: [did("c1", day: 8), did("c2", day: 7)])
        #expect(ids(r) == ["c3"])
        #expect(r.first?.reason == "More from Coach A")
    }

    @Test("takes results in any order: the newest session decides the program day")
    func anyOrder() {
        let r = recommend(all: all, results: [did("a1", day: 3), did("a2", day: 9)])
        #expect(r.first?.runsheet.key == "a1")
    }

    // MARK: - What the For you section shows

    /// Home shows the picks when there are any and a way to the catalogue when there are none:
    /// no session yet is the curated cold-start list; history the rules cannot match is empty.
    @Test("no history on the real catalogue gives the cold-start list, not nothing")
    func coldStartOnCatalogue() {
        let library = Library()
        if let dir = ProcessInfo.processInfo.environment["TIGER_CATALOGUE_DIR"] {
            let base = URL(fileURLWithPath: dir, isDirectory: true)
            library.load(exercises: base.appendingPathComponent("exercises.json"), workouts: base.appendingPathComponent("workouts.json"))
        } else {
            library.load(bundle: Bundle(for: RecommendBundleToken.self))
        }
        let r = recommend(all: library.workouts.map(\.runsheet), results: [])
        #expect(r.count > 1)
        #expect(r.contains { $0.runsheet.title == "Cindy" })
        #expect(r.allSatisfy { !$0.reason.isEmpty })
    }

    @Test("history that matches no creator twice and no two exercises leaves nothing to show, which is the Browse prompt")
    func nothingToSuggest() {
        let four = ["A", "B", "C", "D"].enumerated().map { i, who in w("w\(i)", keys: ["k\(i)"], source: src("coach", who)) }
        #expect(recommend(all: four, results: [did("w0")]).isEmpty)
    }

    /// A For you row is opened as `.recommended`, and that is the origin the session saves —
    /// the path TW-013 added, alongside its origin tests in RunnerTests.
    @Test("a session started from a For you row saves startedFrom recommended")
    @MainActor
    func startedFromRecommended() {
        let opened = DiscoverView.Opened(key: "cindy", from: .recommended)
        let runner = SessionRunner(runsheet: Fixtures.cindy(), startedFrom: opened.from)
        #expect(runner.result().startedFrom == "recommended")
    }
}
