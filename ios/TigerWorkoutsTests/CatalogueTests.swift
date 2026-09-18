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
}
