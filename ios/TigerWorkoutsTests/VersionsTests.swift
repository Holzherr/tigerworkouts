import Foundation
import Testing
@testable import TigerWorkouts

/// The port of src/features/runsheet/versions.test.ts.
@Suite("versions")
struct VersionsTests {
    private static let swing = ExerciseRef(key: "kb_swing", name: "Kettlebell swings", unit: "kg", step: 4)
    private static let press = ExerciseRef(key: "db_incline_press", name: "Incline press", unit: "kg", step: 2)
    private static let sprint = ExerciseRef(key: "sprint", name: "Treadmill sprints", unit: "kph", step: 0.5)
    private static let rdl = ExerciseRef(key: "db_rdl", name: "Dumbbell Romanian deadlift", unit: "kg", step: 2)

    private static func ex(_ id: String, _ ref: ExerciseRef, _ target: Double?) -> Step {
        .exercise(ExerciseStep(id: id, exercise: ref, target: target))
    }

    /// Priyanka's circuit, cut down: two blocks, swings first.
    private let base = Runsheet(id: "w1", title: "Swings & sprints", items: [
        .block(Block(id: "b1", name: "Swings + press", repeatCount: 8, steps: [ex("s1", swing, 28), .rest(RestStep(id: "r1", seconds: 30)), ex("s2", press, 20)])),
        .block(Block(id: "b2", name: "Sprints", repeatCount: 8, steps: [ex("s3", sprint, 14.5)])),
    ])

    /// The same workout as the app starts it: last time's swing load in, nothing else.
    private func seeded(_ r: Runsheet, kg: Double = 32) -> Runsheet {
        var out = r
        out.items = r.items.map { item in
            guard case .block(var b) = item else { return item }
            b.steps = b.steps.map { s in
                guard case .exercise(var e) = s, e.exercise.key == "kb_swing" else { return s }
                e.target = kg
                return .exercise(e)
            }
            return .block(b)
        }
        return out
    }

    private func swingsLast(_ r: Runsheet) -> Runsheet {
        var out = r
        out.items = [r.items[1], r.items[0]] + r.items.dropFirst(2)
        return out
    }

    private func session(_ at: String, version: [Item]? = nil, runsheetId: String = "w1") -> SessionResult {
        var r = SessionResult(runsheetId: runsheetId, title: nil, startedAt: at, id: "s-\(at)")
        r.version = version.map { SessionVersion(items: $0) }
        return r
    }

    private var extra: Item { .step(Self.ex("x1", Self.rdl, 16)) }

    @Test("nothing when only the loads the app filled in differ")
    func onlyFillIns() {
        let auto = seeded(base)
        #expect(Versions.of(run: auto, auto: auto, base: base) == nil)
    }

    @Test("a reorder is kept, with the filled-in loads put back to the base")
    func reorder() throws {
        let auto = seeded(base)
        let v = try #require(Versions.of(run: swingsLast(auto), auto: auto, base: base))
        #expect(Versions.fingerprint(v.items) == Versions.fingerprint(swingsLast(base).items))
    }

    @Test("a load somebody set is kept")
    func setLoad() throws {
        let v = try #require(Versions.of(run: seeded(base, kg: 36), auto: seeded(base), base: base))
        #expect(Runsheet(title: "", items: v.items).exerciseSteps.first?.target == 36)
    }

    @Test("ids do not count: a list rebuilt with fresh ids is the same list")
    func ids() {
        var fresh = base
        fresh.items = base.items.map { item in
            guard case .block(var b) = item else { return item }
            b.id += "-new"
            return .block(b)
        }
        #expect(Versions.fingerprint(fresh.items) == Versions.fingerprint(base.items))
    }

    @Test("a step the base does not have is left as it is")
    func unseededExtra() {
        let items = Versions.unseeded(base.items + [extra], auto: base, base: base)
        #expect(items.last == extra)
    }

    @Test("sessions that ran the same version are grouped, newest first, plain runs left out")
    func rows() {
        let v1 = swingsLast(base).items
        let v2 = base.items + [extra]
        let rows = Versions.rows([session("2026-10-01", version: v1), session("2026-10-03", version: v2), session("2026-10-05", version: v1), session("2026-10-06")], base: base)
        #expect(rows.map(\.sessions) == [2, 1])
        #expect(rows.map(\.lastDone) == ["2026-10-05", "2026-10-03"])
        #expect(rows.first?.sessionId == "s-2026-10-05")
    }

    @Test("a version that is now the base is not one, and other workouts' sessions do not count")
    func rowsLeftOut() {
        let v1 = swingsLast(base).items
        #expect(Versions.rows([session("2026-10-01", version: v1)], base: swingsLast(base)).isEmpty)
        #expect(Versions.rows([session("2026-10-01", version: v1, runsheetId: "other")], base: base).isEmpty)
    }

    @Test("changes say what moved first and what came in or went")
    func changes() {
        #expect(Versions.changes(from: base.items, to: swingsLast(base).items + [extra]) == "Treadmill sprints first · + Dumbbell Romanian deadlift")
        #expect(Versions.changes(from: base.items, to: Array(base.items.dropFirst())).contains("− "))
        #expect(Versions.changes(from: base.items, to: seeded(base, kg: 40).items) == "Other sets, reps or loads")
    }

    @Test("a session's version goes up and comes back with it")
    func roundTrip() throws {
        let r = session("2026-10-01", version: swingsLast(base).items)
        let back = try JSONDecoder().decode(SessionResult.self, from: JSONEncoder().encode(r))
        #expect(back.version == r.version)
        let row = SessionRow.encode(r, owner: "me")
        let data = try #require(row["data"] as? [String: Any])
        #expect(data["version"] != nil)
    }
}
