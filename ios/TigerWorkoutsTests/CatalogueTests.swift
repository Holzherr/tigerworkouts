import Foundation
import Testing
@testable import TigerWorkouts

/// Anchors `Bundle(for:)` on the test bundle, which is where the exported catalogue lands.
private final class BundleToken {}

@Suite("catalogue")
struct CatalogueTests {
    private var library: Library {
        let library = Library()
        // In Xcode the export rides in the test bundle. TIGER_CATALOGUE_DIR lets the same tests
        // run outside a bundle, pointed straight at ios/TigerWorkouts/Resources.
        if let dir = ProcessInfo.processInfo.environment["TIGER_CATALOGUE_DIR"] {
            let base = URL(fileURLWithPath: dir, isDirectory: true)
            library.load(exercises: base.appendingPathComponent("exercises.json"),
                         workouts: base.appendingPathComponent("workouts.json"))
        } else {
            library.load(bundle: Bundle(for: BundleToken.self))
        }
        return library
    }

    @Test("every exported workout decodes")
    func decodes() {
        let library = self.library
        #expect(library.exercises.count > 300)
        #expect(library.workouts.count > 400)
        // A decode that half-fails is the dangerous case: one bad runsheet would silently drop the
        // whole file, so check the shape as well as the count.
        #expect(library.workouts.allSatisfy { !$0.runsheet.items.isEmpty })
    }

    @Test("exercise keys resolve to real names, not placeholders")
    func resolvesRefs() {
        let library = self.library
        let steps = library.workouts.flatMap(\.runsheet.exerciseSteps)
        #expect(!steps.isEmpty)
        // A key that never resolved would read as the de-prefixed key, lower-cased.
        let unresolved = steps.filter { $0.exercise.name == $0.exercise.key }
        #expect(unresolved.isEmpty)
    }

    @Test("a known benchmark comes through with its ladder intact")
    func fran() {
        let library = self.library
        guard let fran = library.workouts.first(where: { $0.runsheet.id == "cf-girls-fran" })?.runsheet else {
            Issue.record("Fran is missing from the export")
            return
        }
        #expect(fran.effectiveScore == .time)
        let block = fran.items.compactMap(\.asBlock).first
        #expect(block?.ladder == [21, 15, 9])
        #expect(Runner.expand(fran).count >= 6)
    }

    @Test("a runsheet round-trips through Codable")
    func roundTrip() {
        let library = self.library
        guard let original = library.workouts.first(where: { $0.runsheet.id == "cf-girls-fran" })?.runsheet else { return }
        let data = try! JSONEncoder().encode(original)
        let back = try! library.decoder.decode(Runsheet.self, from: data)
        #expect(back.title == original.title)
        #expect(back.items.count == original.items.count)
        #expect(back.exerciseSteps.map(\.exercise.key) == original.exerciseSteps.map(\.exercise.key))
    }

    /// `fixtures/runsheets.json` at the repo root: the stored shape with every field the web model
    /// has (model.ts). Read from the source tree, which a simulator test can see.
    private static let fixtures = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("fixtures")

    /// Decode, encode, and the same JSON comes back: a field this app does not carry would be
    /// dropped from a workout the moment it is edited on the phone and synced. The web
    /// (fixtures.test.ts) and the MCP worker (mcp/test/fixtures.test.ts) read the same file.
    @Test("the shared fixtures round-trip without losing a field")
    func sharedFixturesRoundTrip() throws {
        let data = try Data(contentsOf: Self.fixtures.appendingPathComponent("runsheets.json"))
        let original = try #require(try JSONSerialization.jsonObject(with: data) as? [NSDictionary])
        let sheets = try JSONDecoder().decode([Runsheet].self, from: data)
        #expect(sheets.count == original.count)
        for (sheet, want) in zip(sheets, original) {
            let back = try #require(try JSONSerialization.jsonObject(with: JSONEncoder().encode(sheet)) as? NSDictionary)
            let lost = Self.missing(from: back, of: want, at: sheet.key)
            #expect(lost.isEmpty, "lost or changed on the way through: \(lost.joined(separator: ", "))")
        }
    }

    /// Paths present in `want` that `got` lacks or holds differently.
    private static func missing(from got: Any?, of want: Any, at path: String) -> [String] {
        if let w = want as? NSDictionary {
            guard let g = got as? NSDictionary else { return [path] }
            return w.flatMap { k, v in missing(from: g[k], of: v, at: "\(path).\(k)") }
        }
        if let w = want as? [Any] {
            guard let g = got as? [Any], g.count == w.count else { return [path] }
            return zip(g, w).enumerated().flatMap { i, pair in missing(from: pair.0, of: pair.1, at: "\(path)[\(i)]") }
        }
        return (got as? NSObject) == (want as? NSObject) ? [] : [path]
    }

    /// The same numbers `fixtures.test.ts` asserts for the web engine: how many slots the workout
    /// unrolls into, how many of them are work, and how long it is estimated to take.
    @Test("the shared fixtures unroll and time as they do on the web")
    func sharedFixturesMatchTheWebEngine() throws {
        struct Expected: Decodable { let slots: Int; let work: Int; let seconds: Int; let minutes: Int }
        let sheets = try JSONDecoder().decode([Runsheet].self, from: Data(contentsOf: Self.fixtures.appendingPathComponent("runsheets.json")))
        let expected = try JSONDecoder().decode([String: Expected].self, from: Data(contentsOf: Self.fixtures.appendingPathComponent("runsheets.expected.json")))
        for sheet in sheets {
            let want = try #require(expected[sheet.key])
            let slots = Runner.expand(sheet)
            var uncapped = sheet
            uncapped.timeCapSec = nil
            #expect(slots.count == want.slots, "\(sheet.key) slots")
            #expect(slots.filter { $0.kind == .work }.count == want.work, "\(sheet.key) work slots")
            #expect(Int(uncapped.estimatedSeconds.rounded()) == want.seconds, "\(sheet.key) seconds")
            #expect(sheet.minutes == want.minutes, "\(sheet.key) minutes")
        }
    }

    @Test("a number no screen can show is drawn, not trapped on")
    func hugeNumbers() {
        #expect(Format.number(1e300) == String(Int(1e15)))
        #expect(Format.number(.infinity) == "–")
        #expect(Format.number(.nan) == "–")
        #expect(Format.number(43) == "43")
        #expect(Format.number(14.5) == "14.5")
        #expect(Format.clock(1e300).isEmpty == false)
        #expect(Format.clock(.nan) == "0:00")
        #expect(Format.duration(1e300).isEmpty == false)
        #expect(Format.clock(3750) == "1:02:30")
    }

    /// The phone computes its own minutes pill, so the web test alone does not cover what it shows.
    @Test("a coach session's pill shows the length its programme promises")
    func coachLengths() {
        let coached = library.workouts.map(\.runsheet).filter { $0.key.hasPrefix("coach-") }
        #expect(coached.count >= 12)
        for w in coached {
            let promised = Int(w.program?.day.split(separator: " ").first ?? "")
            #expect(w.minutes == promised, "\(w.key): \(w.minutes) min, says \(w.program?.day ?? "nothing")")
        }
    }
}
