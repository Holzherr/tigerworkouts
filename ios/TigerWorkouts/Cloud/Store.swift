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
    private var pendingWorkouts: [Runsheet] = []
    private var pendingWorkoutDeletes: [String] = []

    var signedIn: Bool { user != nil }

    /// The bundled catalogue, copied in once it has decoded. `Library` is a plain class that
    /// SwiftUI cannot observe, so reading it straight from a view drew an empty list at launch
    /// and never redrew it.
    private(set) var catalogue: [Runsheet] = []
    /// Set once the catalogue and the on-disk cache are in, before any network: the point at
    /// which it is safe to look a workout up by id.
    private(set) var loaded = false

    /// Every workout on offer: the bundled catalogue plus whatever this account has written.
    var allWorkouts: [Runsheet] {
        let mine = myWorkouts
        let mineIds = Set(mine.compactMap(\.id))
        return mine + catalogue.filter { !mineIds.contains($0.key) }
    }

    func workout(id: String) -> Runsheet? {
        allWorkouts.first { $0.key == id }
    }

    /// How many times this account has run a given workout — the "done 5×" chip.
    func doneCount(_ runsheetId: String) -> Int {
        results.filter { $0.runsheetId == runsheetId }.count
    }

    // MARK: - Lifecycle

    /// Health is opt-in, and off until the toggle in Me has been turned on.
    var healthEnabled: Bool { UserDefaults.standard.bool(forKey: "health") }

    func load() async {
        await Task.detached(priority: .userInitiated) { Library.shared.load() }.value
        catalogue = Library.shared.workouts.map(\.runsheet)
        readCache()
        loaded = true
        user = await Supabase.shared.user
        await readBodyweightFromHealth()
        await sync()
    }

    /// Health holds a bodyweight already; asking for it again would be the wrong answer.
    func readBodyweightFromHealth() async {
        guard healthEnabled, let kg = await Health.shared.bodyweightKg() else { return }
        bodyweightKg = kg
        writeCache()
    }

    func sync() async {
        guard await Supabase.shared.isSignedIn else { return }
        syncing = true
        syncError = nil
        defer { syncing = false }
        do {
            try await flushPending()
            try await flushWorkouts()
            async let sessions = Supabase.shared.sessions()
            async let workouts = Supabase.shared.workouts()
            async let prefs = Supabase.shared.prefs()
            results = try await sessions
            let remote = try await workouts
            let queued = Dictionary(pendingWorkouts.map { ($0.key, $0) }, uniquingKeysWith: { _, last in last })
            let deleting = Set(pendingWorkoutDeletes)
            myWorkouts = remote
                .filter { !deleting.contains($0.key) }
                .map { queued[$0.key] ?? $0 }
                + queued.values.filter { q in !remote.contains { $0.key == q.key } }
            let p = try await prefs
            bodyweightKg = p.bodyweightKg ?? bodyweightKg
            saved = Set(p.saved).union(saved)
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
        // Attach the heart rate before the row goes anywhere, so the web app sees it too.
        if healthEnabled,
           let start = ISO8601.date(r.startedAt),
           let end = r.endedAt.flatMap(ISO8601.date) ?? r.durationSec.map({ start.addingTimeInterval($0) }) {
            r.device = await Health.shared.summary(from: start, to: end)
        }
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
        await writeToHealth(r)
    }

    /// The session also belongs in Health, typed by what it mostly was, counting towards the rings.
    private func writeToHealth(_ r: SessionResult) async {
        guard healthEnabled else { return }
        let worked = EffortModel.workedFrom(r, runsheet: workout(id: r.runsheetId))
        // Health's own figure wins when the watch was on; ours is only an estimate.
        let kcal = r.device?.calories.map { Int($0) }
            ?? EffortModel.effort(r, worked: worked, bodyweightKg: bodyweightKg).kcal
        await Health.shared.save(r, worked: worked, kcal: kcal)
    }

    // MARK: - Prefs

    func toggleSaved(_ key: String) async {
        if saved.contains(key) { saved.remove(key) } else { saved.insert(key) }
        await writePrefs()
    }

    func setBodyweight(_ kg: Double) async {
        bodyweightKg = kg
        await writePrefs()
    }

    /// Cache first so the change survives the app being killed, then the server when there is one.
    private func writePrefs() async {
        writeCache()
        guard await Supabase.shared.isSignedIn else { return }
        do {
            try await Supabase.shared.savePrefs(bodyweightKg: bodyweightKg, saved: Array(saved))
            syncError = nil
        } catch {
            syncError = error.localizedDescription
        }
    }

    // MARK: - Your own workouts

    /// Local first: the workout is in the list before the network is asked, and a failed push is
    /// queued rather than lost.
    func saveWorkout(_ r: Runsheet) async {
        var sheet = r
        if sheet.id == nil { sheet.id = Edit.id("w") }
        if sheet.creator == nil { sheet.creator = user?.email }
        myWorkouts.removeAll { $0.key == sheet.key }
        myWorkouts.insert(sheet, at: 0)
        pendingWorkoutDeletes.removeAll { $0 == sheet.key }
        pendingWorkouts.removeAll { $0.key == sheet.key }
        pendingWorkouts.append(sheet)
        writeCache()
        await pushWorkouts()
    }

    func deleteWorkout(_ r: Runsheet) async {
        let key = r.key
        myWorkouts.removeAll { $0.key == key }
        pendingWorkouts.removeAll { $0.key == key }
        saved.remove(key)
        pendingWorkoutDeletes.append(key)
        writeCache()
        await pushWorkouts()
    }

    /// True when this workout belongs to the account and can be edited in place; a catalogue
    /// workout is duplicated instead.
    func isMine(_ r: Runsheet) -> Bool {
        myWorkouts.contains { $0.key == r.key }
    }

    private func pushWorkouts() async {
        do {
            try await flushWorkouts()
            syncError = nil
        } catch {
            syncError = error.localizedDescription
        }
        writeCache()
    }

    private func flushWorkouts() async throws {
        guard await Supabase.shared.isSignedIn else { return }
        var stillPending: [Runsheet] = []
        var stillDeleting: [String] = []
        var failure: Error?
        for r in pendingWorkouts {
            do { try await Supabase.shared.saveWorkout(r) } catch {
                stillPending.append(r)
                failure = error
            }
        }
        for id in pendingWorkoutDeletes {
            do { try await Supabase.shared.deleteWorkout(id: id) } catch {
                stillDeleting.append(id)
                failure = error
            }
        }
        pendingWorkouts = stillPending
        pendingWorkoutDeletes = stillDeleting
        if let failure { throw failure }
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
        var pendingWorkouts: [Runsheet]?
        var pendingWorkoutDeletes: [String]?
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
        pendingWorkouts = c.pendingWorkouts ?? []
        pendingWorkoutDeletes = c.pendingWorkoutDeletes ?? []
    }

    private func writeCache() {
        let c = Cache(
            results: results, myWorkouts: myWorkouts, pending: pending,
            bodyweightKg: bodyweightKg, saved: Array(saved),
            pendingWorkouts: pendingWorkouts, pendingWorkoutDeletes: pendingWorkoutDeletes
        )
        try? JSONEncoder().encode(c).write(to: cacheURL, options: .atomic)
    }
}
