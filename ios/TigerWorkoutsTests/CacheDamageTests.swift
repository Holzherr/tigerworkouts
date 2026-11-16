import Foundation
import Testing
@testable import TigerWorkouts

/// A cache file that is partly unreadable costs the unreadable part, never the whole phone.
@Suite("damaged cache")
@MainActor
struct CacheDamageTests {
    private let name = "test-cache-\(UUID().uuidString).json"
    private var dir: URL { FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0] }

    private func store(with contents: Data) throws -> Store {
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        try contents.write(to: dir.appendingPathComponent(name))
        let s = Store()
        s.cacheName = name
        s.healthOverride = false
        return s
    }

    private func keptAside() -> [String] {
        let stem = (name as NSString).deletingPathExtension
        return ((try? FileManager.default.contentsOfDirectory(atPath: dir.path)) ?? []).filter { $0.hasPrefix(stem + ".unreadable-") }
    }

    @Test("one bad session is left out; the others, the queue and the settings stay, and the file is kept aside")
    func oneBadEntry() async throws {
        let good = SessionResult(runsheetId: "w", title: "W", startedAt: "2026-11-16T10:00:00.000Z", durationSec: 600, id: "s-good")
        let goodJSON = try JSONSerialization.jsonObject(with: JSONEncoder().encode(good))
        let file: [String: Any] = [
            "results": [goodJSON, ["startedAt": 12]],
            "myWorkouts": [],
            "pending": [goodJSON],
            "saved": ["fran"],
            "bodyweightKg": "heavy",
        ]
        let s = try store(with: JSONSerialization.data(withJSONObject: file))
        await s.load()
        #expect(s.results.map(\.rowId) == ["s-good"])
        #expect(s.unsyncedCount == 1)
        #expect(s.saved == ["fran"])
        #expect(s.bodyweightKg == nil)
        #expect(keptAside().count == 1)
    }

    @Test("a file that is not JSON is kept aside, not overwritten unseen")
    func notJSON() async throws {
        let s = try store(with: Data("{\"results\": [".utf8))
        await s.load()
        #expect(s.results.isEmpty)
        #expect(keptAside().count == 1)
    }
}
