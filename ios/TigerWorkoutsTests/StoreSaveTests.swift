import Foundation
import Testing
@testable import TigerWorkouts

/// A finished session is in History and on disk before Health answers for the heart rate.
@Suite("saving a session")
@MainActor
struct StoreSaveTests {
    /// Holds the heart-rate summary back until the test lets it go.
    private final class Gate {
        var waiting: CheckedContinuation<DeviceSummary?, Never>?
        var asked = false
    }

    @Test("the result is listed and stored before the heart-rate summary resolves, which is added after")
    func listedBeforeSummary() async throws {
        let store = Store()
        store.cacheName = "test-cache-\(UUID().uuidString).json"
        store.healthOverride = false
        let gate = Gate()
        store.deviceSummary = { _, _ in
            gate.asked = true
            return await withCheckedContinuation { gate.waiting = $0 }
        }
        let result = SessionResult(runsheetId: "w", title: "W", startedAt: "2026-09-27T10:00:00.000Z",
                                   endedAt: "2026-09-27T10:20:00.000Z", durationSec: 1200, id: "s-save")
        var storedCalled = false
        let saving = Task { await store.save(result) { storedCalled = true } }

        for _ in 0..<200 where !gate.asked { try await Task.sleep(for: .milliseconds(10)) }
        #expect(gate.asked)
        #expect(storedCalled, "the crash-safe copy can go once the result is on disk")
        #expect(store.results.contains { $0.rowId == "s-save" }, "History has it while Health is still being asked")
        #expect(store.results.first?.device == nil)

        gate.waiting?.resume(returning: DeviceSummary(avgHr: 140, maxHr: 171, calories: 210, source: "Apple Health"))
        await saving.value
        #expect(store.results.first { $0.rowId == "s-save" }?.device?.avgHr == 140)
    }

    @Test("an edit made while the summary was out is kept when it lands")
    func editDuringSummary() async throws {
        let store = Store()
        store.cacheName = "test-cache-\(UUID().uuidString).json"
        store.healthOverride = false
        let gate = Gate()
        store.deviceSummary = { _, _ in
            gate.asked = true
            return await withCheckedContinuation { gate.waiting = $0 }
        }
        let result = SessionResult(runsheetId: "w", title: "W", startedAt: "2026-09-27T11:00:00.000Z", durationSec: 600, id: "s-edit")
        let saving = Task { await store.save(result) }
        for _ in 0..<200 where !gate.asked { try await Task.sleep(for: .milliseconds(10)) }
        await store.amend("s-edit") { $0.rpe = 7 }?.value

        gate.waiting?.resume(returning: DeviceSummary(avgHr: 120))
        await saving.value
        let saved = store.results.first { $0.rowId == "s-edit" }
        #expect(saved?.rpe == 7)
        #expect(saved?.device?.avgHr == 120)
    }
}
