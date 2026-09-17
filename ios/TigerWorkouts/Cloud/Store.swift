import Observation
import SwiftUI

/// App state. Everything the screens read hangs off here, and everything that has to outlive the
/// process is written to disk as it changes — a finished workout is never only in memory, and
/// never only on the server.
@MainActor
@Observable
final class Store {
    var user: AuthUser?
    var results: [SessionResult] = []
    var myWorkouts: [Runsheet] = []
    var bodyweightKg: Double?
    var saved: Set<String> = []
    var syncing = false
    var syncError: String?
    /// Sessions logged while offline or signed out, waiting for a window to push.
    private(set) var pending: [SessionResult] = []

    var signedIn: Bool { user != nil }

    /// Every workout on offer: the bundled catalogue plus whatever this account has written.
    var allWorkouts: [Runsheet] {
        let mine = myWorkouts
        let mineIds = Set(mine.compactMap(\.id))
        return mine + Library.shared.workouts.map(\.runsheet).filter { !mineIds.contains($0.key) }
    }

    func workout(id: String) -> Runsheet? {
        allWorkouts.first { $0.key == id }
    }

    /// How many times this account has run a given workout — the "done 5×" chip.
    func doneCount(_ runsheetId: String) -> Int {
        results.filter { $0.runsheetId == runsheetId }.count
    }

    // MARK: - Lifecycle

    func load() async {
        Library.shared.load()
        readCache()
        user = await Supabase.shared.user
        await sync()
    }

    func sync() async {
        guard await Supabase.shared.isSignedIn else { return }
        syncing = true
        syncError = nil
        defer { syncing = false }
        do {
            try await flushPending()
            async let sessions = Supabase.shared.sessions()
            async let workouts = Supabase.shared.workouts()
            async let prefs = Supabase.shared.prefs()
            results = try await sessions
            myWorkouts = try await workouts
            let p = try await prefs
            bodyweightKg = p.bodyweightKg ?? bodyweightKg
            saved = Set(p.saved)
            user = await Supabase.shared.user
            writeCache()
        } catch {
            syncError = error.localizedDescription
        }
    }

    func signOut() async {
        await Supabase.shared.signOut()
        user = nil
        results = []
        myWorkouts = []
        saved = []
        writeCache()
    }

    // MARK: - Saving a session

    /// Show it in History straight away, then get it to the server. A failed push is queued, not
    /// lost: the workout happened whatever the network thinks.
    func save(_ result: SessionResult) async {
        var r = result
        if r.id == nil { r.id = "s-\(Int(Date().timeIntervalSince1970 * 1000))-\(UUID().uuidString.prefix(4))" }
        results.removeAll { $0.rowId == r.rowId }
        results.insert(r, at: 0)
        results.sort { $0.startedAt > $1.startedAt }
        pending.removeAll { $0.rowId == r.rowId }
        pending.append(r)
        writeCache()
        do {
            try await flushPending()
        } catch {
            syncError = error.localizedDescription
        }
        writeCache()
    }

    private func flushPending() async throws {
        guard await Supabase.shared.isSignedIn, !pending.isEmpty else { return }
        var stillPending: [SessionResult] = []
        var failure: Error?
        for r in pending {
            do {
                try await Supabase.shared.save(r)
            } catch {
                stillPending.append(r)
                failure = error
            }
        }
        pending = stillPending
        if let failure { throw failure }
    }

    // MARK: - Cache

    private struct Cache: Codable {
        var results: [SessionResult]
        var myWorkouts: [Runsheet]
        var pending: [SessionResult]
        var bodyweightKg: Double?
        var saved: [String]
    }

    private var cacheURL: URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("tiger-cache.json")
    }

    private func readCache() {
        guard let data = try? Data(contentsOf: cacheURL),
              let c = try? Library.shared.decoder.decode(Cache.self, from: data) else { return }
        results = c.results
        myWorkouts = c.myWorkouts
        pending = c.pending
        bodyweightKg = c.bodyweightKg
        saved = Set(c.saved)
    }

    private func writeCache() {
        let c = Cache(results: results, myWorkouts: myWorkouts, pending: pending, bodyweightKg: bodyweightKg, saved: Array(saved))
        try? JSONEncoder().encode(c).write(to: cacheURL, options: .atomic)
    }
}
