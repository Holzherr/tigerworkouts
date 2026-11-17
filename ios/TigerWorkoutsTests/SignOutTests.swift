import Foundation
import Testing
@testable import TigerWorkouts

/// Signing out must not leave this account's queued changes for the next account to sign in here.
@Suite("signing out")
@MainActor
struct SignOutTests {
    private func store() -> Store {
        let s = Store()
        s.cacheName = "test-cache-\(UUID().uuidString).json"
        s.healthOverride = false
        s.deviceSummary = { _, _ in nil }
        return s
    }

    @Test("with changes not on the account, sign-out is refused and nothing is cleared")
    func refusedWhileQueued() async {
        let s = store()
        await s.save(SessionResult(runsheetId: "w", title: "W", startedAt: "2026-11-16T10:00:00.000Z", durationSec: 600, id: "s-q"))
        s.stage(Edit.newRunsheet(creator: nil))
        #expect(s.waitingCount == 2)
        let held = await s.signOut()
        #expect(held == "2 changes are not saved to your account yet. Try again when online.")
        #expect(s.waitingCount == 2)
    }

    @Test("signing out clears the queues and the phone, as the web clears the browser (U10)")
    func discardClearsPhone() async {
        let s = store()
        await s.save(SessionResult(runsheetId: "w", title: "W", startedAt: "2026-11-16T11:00:00.000Z", durationSec: 600, id: "s-d"))
        s.stage(Edit.newRunsheet(creator: nil))
        s.trainingMaxes = ["back_squat": 100]
        s.saved = ["cindy"]
        #expect(await s.signOut(discardUnsent: true) == nil)
        #expect(s.waitingCount == 0)
        #expect(s.results.isEmpty)
        #expect(s.myWorkouts.isEmpty)
        #expect(s.saved.isEmpty)
        #expect(s.trainingMaxes.isEmpty)
    }

    @Test("Me says Synced only when nothing waits and the last sync went through")
    func status() {
        #expect(MeView.syncStatus(signedIn: true, syncing: false, waiting: 0, failed: false) == "Synced with tigerworkouts.com")
        #expect(MeView.syncStatus(signedIn: true, syncing: false, waiting: 3, failed: true) == "3 waiting to sync")
        #expect(MeView.syncStatus(signedIn: true, syncing: false, waiting: 0, failed: true) == "Last sync failed · see Settings")
        #expect(MeView.syncStatus(signedIn: true, syncing: true, waiting: 3, failed: false) == "Syncing…")
        #expect(Store.signOutRefusal(waiting: 0) == nil)
    }
}
