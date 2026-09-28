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

    @Test("heart rate missing at the finish is asked for again, for the last two days only")
    func backfill() async {
        let store = Store()
        store.cacheName = "test-cache-\(UUID().uuidString).json"
        store.healthOverride = false
        let now = ISO8601.date("2026-09-28T12:00:00.000Z")!
        let recent = SessionResult(runsheetId: "w", title: "W", startedAt: "2026-09-28T10:00:00.000Z", durationSec: 1200, id: "s-recent")
        let old = SessionResult(runsheetId: "w", title: "W", startedAt: "2026-09-20T10:00:00.000Z", durationSec: 1200, id: "s-old")
        var had = recent
        had.id = "s-had"
        had.device = DeviceSummary(avgHr: 100)
        #expect(Store.needsHeartRate([recent, old, had], now: now).map(\.rowId) == ["s-recent"])
        store.results = [recent, old, had]
        var asked: [Date] = []
        store.deviceSummary = { start, _ in
            asked.append(start)
            return DeviceSummary(avgHr: 131, maxHr: 160, source: "Apple Health")
        }
        await store.backfillHeartRate(now: now)
        #expect(asked.count == 1)
        #expect(store.results.first { $0.rowId == "s-recent" }?.device?.avgHr == 131)
        #expect(store.results.first { $0.rowId == "s-old" }?.device == nil)
    }

    @Test("a delete takes the Health workout out; a date edit writes it again only when Health had one")
    func healthFollowsHistory() async {
        let store = Store()
        store.cacheName = "test-cache-\(UUID().uuidString).json"
        store.healthOverride = true
        var deleted: [String] = []
        store.healthDelete = { id in deleted.append(id); return false }
        let r = SessionResult(runsheetId: "w", title: "W", startedAt: "2026-09-28T10:00:00.000Z", durationSec: 1200, id: "s-h")
        store.results = [r]
        var noted = r
        noted.notes = "Felt strong"
        await store.update(noted)?.value
        #expect(deleted.isEmpty)
        var moved = noted
        moved.startedAt = "2026-09-27T10:00:00.000Z"
        await store.update(moved)?.value
        #expect(deleted == ["s-h"])
        await store.delete(moved)
        #expect(deleted == ["s-h", "s-h"])
    }
}

/// Your own workouts and prefs going up while other changes are made on the phone.
@Suite("own workouts sync")
@MainActor
struct WorkoutQueueTests {
    private func store() -> Store {
        let store = Store()
        store.cacheName = "test-cache-\(UUID().uuidString).json"
        store.healthOverride = false
        store.cloudSignedIn = { true }
        return store
    }

    /// Holds the first call back until the test lets it go.
    private final class Gate {
        var waiting: CheckedContinuation<Void, Never>?
        var calls = 0
    }
    private struct Offline: Error {}

    @Test("an edit made while the workout uploads stays queued when its own upload fails")
    func editDuringUpload() async throws {
        let store = store()
        let gate = Gate()
        store.uploadWorkout = { r, _ in
            gate.calls += 1
            if gate.calls == 1 { return await withCheckedContinuation { gate.waiting = $0 } }
            throw Offline()
        }
        let first = Runsheet(id: "u-1", title: "Legs")
        let uploading = Task { await store.saveWorkout(first) }
        for _ in 0..<200 where gate.waiting == nil { try await Task.sleep(for: .milliseconds(10)) }
        var renamed = first
        renamed.title = "Legs day"
        await store.saveWorkout(renamed)
        gate.waiting?.resume()
        await uploading.value
        #expect(store.pendingWorkouts.map(\.title) == ["Legs day"], "the rename still has to go up")
    }

    @Test("a delete made while another goes up stays queued when its own call fails")
    func deleteDuringUpload() async throws {
        let store = store()
        store.myWorkouts = [Runsheet(id: "u-1", title: "A"), Runsheet(id: "u-2", title: "B")]
        let gate = Gate()
        store.uploadWorkout = { _, _ in }
        store.removeWorkout = { _ in
            gate.calls += 1
            if gate.calls == 1 { return await withCheckedContinuation { gate.waiting = $0 } }
            throw Offline()
        }
        let first = Task { await store.deleteWorkout(Runsheet(id: "u-1", title: "A")) }
        for _ in 0..<200 where gate.waiting == nil { try await Task.sleep(for: .milliseconds(10)) }
        await store.deleteWorkout(Runsheet(id: "u-2", title: "B"))
        gate.waiting?.resume()
        await first.value
        #expect(store.pendingWorkoutDeletes == ["u-2"])
    }

    @Test("a workout deleted while its upload was out is deleted again after it lands")
    func deleteDuringItsUpload() async throws {
        let store = store()
        let gate = Gate()
        var removed: [String] = []
        store.uploadWorkout = { _, _ in
            gate.calls += 1
            if gate.calls == 1 { await withCheckedContinuation { gate.waiting = $0 } }
        }
        store.removeWorkout = { removed.append($0) }
        let sheet = Runsheet(id: "u-1", title: "Legs")
        let uploading = Task { await store.saveWorkout(sheet) }
        for _ in 0..<200 where gate.waiting == nil { try await Task.sleep(for: .milliseconds(10)) }
        await store.deleteWorkout(sheet)
        #expect(removed == ["u-1"])
        gate.waiting?.resume()
        await uploading.value
        #expect(store.pendingWorkoutDeletes == ["u-1"], "the upload may have landed after the delete")
    }

    @Test("only Make public / Make private sends the column; other edits keep what the store knows")
    func visibility() async {
        let store = store()
        var sent: [(String, Bool?, Bool)] = []
        store.uploadWorkout = { r, sendPublic in sent.append((r.title, r.isPublic, sendPublic)) }
        var mine = Runsheet(id: "u-1", title: "Legs")
        mine.isPublic = true
        store.myWorkouts = [mine]
        // The screen's copy is from before the web published it.
        var stale = mine
        stale.isPublic = false
        stale.title = "Legs day"
        await store.saveWorkout(stale)
        #expect(sent.last?.2 == false)
        #expect(store.myWorkouts.first?.isPublic == true)
        var off = stale
        off.isPublic = false
        await store.saveWorkout(off, visibility: true)
        #expect(sent.last?.1 == false && sent.last?.2 == true)
        await store.saveWorkout(off)
        #expect(sent.last?.2 == false, "sent once, the column is left alone again")
    }

    @Test("deleting a saved workout stamps the saved list, so the server's older copy cannot bring it back")
    func deleteStampsSaved() async {
        let store = store()
        store.uploadWorkout = { _, _ in }
        store.removeWorkout = { _ in }
        let sheet = Runsheet(id: "u-1", title: "Legs")
        store.myWorkouts = [sheet]
        store.saved = ["u-1", "cf-girls-fran"]
        await store.deleteWorkout(sheet)
        #expect(store.prefsUpdatedAt["saved"] != nil)
        let older = PrefsMerge.stamp(Date(timeIntervalSinceNow: -3600))
        store.applyPrefs(PrefsMerge.merge(local: store.localPrefs, remote: PrefsMerge.remote(["saved": ["u-1", "cf-girls-fran"], "updatedAt": ["saved": older]])))
        #expect(store.saved == ["cf-girls-fran"])
    }

    @Test("a Health weighing older than one typed on the web does not win the sync, nor come back")
    func healthBodyweight() {
        let store = store()
        let weighed = Date(timeIntervalSinceNow: -86_400)
        store.takeHealthBodyweight(80, measuredAt: weighed)
        #expect(store.bodyweightKg == 80)
        let typed = PrefsMerge.stamp(Date(timeIntervalSinceNow: -3600))
        store.applyPrefs(PrefsMerge.merge(local: store.localPrefs, remote: PrefsMerge.remote(["bodyweightKg": 78, "updatedAt": ["bodyweightKg": typed]])))
        #expect(store.bodyweightKg == 78)
        // The next launch reads the same sample again.
        store.takeHealthBodyweight(80, measuredAt: weighed)
        #expect(store.bodyweightKg == 78)
        // A newer weighing does win.
        store.takeHealthBodyweight(79, measuredAt: Date())
        #expect(store.bodyweightKg == 79)
    }
}
