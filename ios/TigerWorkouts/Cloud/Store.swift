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
    /// kg per exercise key, for loads written as a % of a training max (5/3/1, nSuns). Synced on
    /// `user_state.prefs.trainingMaxes` with the web's Training maxes sheet.
    var trainingMaxes: [String: Double] = [:]
    /// Settings → My equipment. Synced on `user_state.prefs.equipment`; mirrored into UserDefaults
    /// for the engine (`Equipment.current()`).
    var equipment: Equipment? {
        didSet { Equipment.store(equipment) }
    }
    var saved: Set<String> = []
    /// Exercises this account made, here or on the web. Mirrored into `Library.shared` so lookups
    /// find them; kept here too so a view that lists them redraws when one is added.
    private(set) var customExercises: [String: LibraryExercise] = [:]
    /// Made on this phone and not yet on the server.
    private var pendingExercises: [LibraryExercise] = []
    var syncing = false
    var syncError: String?
    /// Sessions logged while offline or signed out, waiting for a window to push.
    private(set) var pending: [SessionResult] = []
    private var pendingWorkouts: [Runsheet] = []
    private var pendingWorkoutDeletes: [String] = []
    /// Sessions deleted on the phone that the server still has.
    private var pendingDeletes: [String] = []
    /// Changes made on the finish screen before `save` had put the result in the list.
    private var amendments: [String: [(inout SessionResult) -> Void]] = [:]

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
    var healthEnabled: Bool { healthOverride ?? UserDefaults.standard.bool(forKey: "health") }
    /// Tests set this so a simulator with the Health switch on never writes a real workout.
    var healthOverride: Bool?

    func load() async {
        await Task.detached(priority: .userInitiated) { Library.shared.load() }.value
        catalogue = Library.shared.workouts.map(\.runsheet)
        readCache()
        #if DEBUG
        seedLogbookIfAsked()
        seedPaceIfAsked()
        seedProgressIfAsked()
        #endif
        loaded = true
        shareUpNext()
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
            try await flushDeletes()
            try await flushWorkouts()
            try await flushExercises()
            // Union, as the web does: an exercise made on either side appears on both.
            mergeCustom(try await Supabase.shared.exercises())
            async let sessions = Supabase.shared.sessions()
            async let workouts = Supabase.shared.workouts()
            async let prefs = Supabase.shared.prefs()
            // What the phone changed while the fetch was out wins over the server's older copy.
            results = Self.merged(remote: try await sessions, pending: pending, deleting: pendingDeletes)
            let remote = try await workouts
            let queued = Dictionary(pendingWorkouts.map { ($0.key, $0) }, uniquingKeysWith: { _, last in last })
            let deleting = Set(pendingWorkoutDeletes)
            myWorkouts = remote
                .filter { !deleting.contains($0.key) }
                .map { queued[$0.key] ?? $0 }
                + queued.values.filter { q in !remote.contains { $0.key == q.key } }
            let p = try await prefs
            bodyweightKg = p.bodyweightKg ?? bodyweightKg
            trainingMaxes = trainingMaxes.merging(p.trainingMaxes) { _, remote in remote }
            equipment = p.equipment ?? equipment
            saved = Set(p.saved).union(saved)
            user = await Supabase.shared.user
            writeCache()
        } catch {
            syncError = error.localizedDescription
        }
    }

    /// The server's sessions with what the phone has not pushed yet laid over them: queued edits
    /// replace their row, queued deletes stay gone.
    nonisolated static func merged(remote: [SessionResult], pending: [SessionResult], deleting: [String]) -> [SessionResult] {
        let gone = Set(deleting)
        var byId: [String: SessionResult] = [:]
        for r in remote where !gone.contains(r.rowId) { byId[r.rowId] = r }
        for r in pending where !gone.contains(r.rowId) { byId[r.rowId] = r }
        return byId.values.sorted { $0.startedAt > $1.startedAt }
    }

    /// Ends the account session and nothing else. What is on the phone stays: History keeps the
    /// sessions already logged, and anything still queued goes up with the next sign-in.
    func signOut() async {
        await Supabase.shared.signOut()
        user = nil
        writeCache()
    }

    /// Sessions on the phone that the server does not have yet.
    var unsyncedCount: Int { pending.count }

    // MARK: - Saving a session

    /// Show it in History straight away, then get it to the server. A failed push is queued, not
    /// lost: the workout happened whatever the network thinks. `stored` runs once the result is in
    /// the cache on disk, the point from which a killed app still has it.
    ///
    /// The heart rate from Health comes after: asking for it can take a minute (an unanswered
    /// permission sheet, a slow query), and until the result is in the list and on disk History
    /// misses the session and the crash-safe copy of the timer stays behind. When a summary does
    /// arrive it is added to the row as it then stands and pushed again, so the web app sees it too.
    func save(_ result: SessionResult, stored: () -> Void = {}) async {
        var r = result
        if r.id == nil { r.id = "s-\(Int(Date().timeIntervalSince1970 * 1000))-\(UUID().uuidString.prefix(4))" }
        for change in amendments.removeValue(forKey: r.rowId) ?? [] { change(&r) }
        results.removeAll { $0.rowId == r.rowId }
        results.insert(r, at: 0)
        results.sort { $0.startedAt > $1.startedAt }
        pending.removeAll { $0.rowId == r.rowId }
        pending.append(r)
        writeCache()
        stored()
        do {
            try await flushPending()
        } catch {
            syncError = error.localizedDescription
        }
        writeCache()
        if let start = ISO8601.date(r.startedAt),
           let end = r.endedAt.flatMap(ISO8601.date) ?? r.durationSec.map({ start.addingTimeInterval($0) }),
           let device = await deviceSummary(start, end),
           var current = results.first(where: { $0.rowId == r.rowId }) {
            current.device = device
            await update(current)?.value
            r = current
        }
        await writeToHealth(r)
    }

    /// Health's heart-rate summary over a session's window; nil with Health off or the watch not
    /// worn. A property so a test can hold it back.
    var deviceSummary: @MainActor (Date, Date) async -> DeviceSummary? = { start, end in
        guard UserDefaults.standard.bool(forKey: "health") else { return nil }
        return await Health.shared.summary(from: start, to: end)
    }

    /// The session also belongs in Health, typed by what it mostly was, counting towards the rings.
    /// An effort tapped while the workout was being written is attached once it is there.
    private func writeToHealth(_ r: SessionResult) async {
        guard healthEnabled else { return }
        let runsheet = workout(id: r.runsheetId)
        let worked = EffortModel.workedFrom(r, runsheet: runsheet)
        // Health's own figure wins when the watch was on; ours is only an estimate.
        let kcal = r.device?.calories.map { Int($0) }
            ?? EffortModel.effort(r, worked: worked, bodyweightKg: bodyweightKg).kcal
        guard await Health.shared.save(r, runsheet: runsheet, worked: worked, kcal: kcal) else { return }
        if let rpe = results.first(where: { $0.rowId == r.rowId })?.rpe {
            await Health.shared.setEffort(rpe, for: r.rowId)
        }
    }

    // MARK: - Changing a logged session

    /// Change a session by id. The finish screen can get here before `save` has the result in the
    /// list (it is still asking Health for the heart rate); the change is then held and applied as
    /// the result goes in.
    @discardableResult
    func amend(_ rowId: String, _ change: @escaping (inout SessionResult) -> Void) -> Task<Void, Never>? {
        guard var r = results.first(where: { $0.rowId == rowId }) else {
            amendments[rowId, default: []].append(change)
            return nil
        }
        change(&r)
        return update(r)
    }

    /// An edit from History or the finish screen. The list and the cache change at once, so the
    /// next tap on a stepper builds on this one; the server follows, queued like a new session when
    /// it cannot be reached. The row on the server is merged, not replaced (`SessionRow.encode`),
    /// so the web app's own fields on it survive.
    @discardableResult
    func update(_ result: SessionResult) -> Task<Void, Never>? {
        let before = results.first { $0.rowId == result.rowId }
        guard before != result else { return nil }
        results.removeAll { $0.rowId == result.rowId }
        results.append(result)
        results.sort { $0.startedAt > $1.startedAt }
        pending.removeAll { $0.rowId == result.rowId }
        pending.append(result)
        writeCache()
        let effortChanged = before?.rpe != result.rpe
        return Task {
            do {
                try await flushPending()
            } catch {
                syncError = error.localizedDescription
            }
            writeCache()
            if healthEnabled, effortChanged {
                await Health.shared.setEffort(result.rpe, for: result.rowId)
            }
        }
    }

    /// Gone from the phone at once and from the account as soon as it can be reached; the web app
    /// drops it from its own list on its next sync. The Health workout, if any, stays: Health owns it.
    func delete(_ result: SessionResult) async {
        let id = result.rowId
        results.removeAll { $0.rowId == id }
        pending.removeAll { $0.rowId == id }
        amendments[id] = nil
        if !pendingDeletes.contains(id) { pendingDeletes.append(id) }
        writeCache()
        do {
            try await flushDeletes()
        } catch {
            syncError = error.localizedDescription
        }
        writeCache()
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

    func setTrainingMax(_ key: String, _ kg: Double?) async {
        trainingMaxes[key] = kg
        await writePrefs()
    }

    func setEquipment(_ e: Equipment) async {
        equipment = e.isEmpty ? nil : e
        await writePrefs()
    }

    /// A workout as the timer runs it: shared parts (refs) inlined, then loads given as a % of a
    /// training max or × bodyweight worked out into kilos you can load.
    func prepared(_ r: Runsheet) -> Runsheet {
        Relative.resolve(Relative.resolveRefs(r, lookup: workout(id:)), maxes: trainingMaxes, bodyweightKg: bodyweightKg, kit: equipment)
    }

    /// Cache first so the change survives the app being killed, then the server when there is one.
    private func writePrefs() async {
        writeCache()
        guard await Supabase.shared.isSignedIn else { return }
        do {
            try await Supabase.shared.savePrefs(bodyweightKg: bodyweightKg, saved: Array(saved), trainingMaxes: trainingMaxes, equipment: equipment)
            syncError = nil
        } catch {
            syncError = error.localizedDescription
        }
    }

    // MARK: - Your own exercises

    /// Saved on the phone first, then pushed; usable straight away everywhere the catalogue is.
    func addExercise(_ e: LibraryExercise) async {
        mergeCustom([e])
        pendingExercises.removeAll { $0.key == e.key }
        pendingExercises.append(e)
        writeCache()
        do {
            try await flushExercises()
            syncError = nil
        } catch {
            syncError = error.localizedDescription
        }
        writeCache()
    }

    private func mergeCustom(_ list: [LibraryExercise]) {
        for e in list { customExercises[e.key] = e }
        Library.shared.addCustom(list)
    }

    private func flushExercises() async throws {
        guard await Supabase.shared.isSignedIn, !pendingExercises.isEmpty else { return }
        try await Supabase.shared.saveExercises(pendingExercises)
        pendingExercises = []
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

    /// Only what was sent comes off the queue: an edit queued while the batch was in flight is a
    /// different value and stays for the next push.
    private func flushPending() async throws {
        guard await Supabase.shared.isSignedIn, !pending.isEmpty else { return }
        var sent: [SessionResult] = []
        var failure: Error?
        for r in pending {
            do {
                try await Supabase.shared.save(r)
                sent.append(r)
            } catch {
                failure = error
            }
        }
        pending.removeAll { sent.contains($0) }
        if let failure { throw failure }
    }

    private func flushDeletes() async throws {
        guard await Supabase.shared.isSignedIn, !pendingDeletes.isEmpty else { return }
        var done: [String] = []
        var failure: Error?
        for id in pendingDeletes {
            do {
                try await Supabase.shared.deleteSession(id: id)
                done.append(id)
            } catch {
                failure = error
            }
        }
        pendingDeletes.removeAll { done.contains($0) }
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
        var pendingDeletes: [String]?
        var customExercises: [LibraryExercise]?
        var pendingExercises: [LibraryExercise]?
        var trainingMaxes: [String: Double]?
        var equipment: Equipment?
    }

    /// The file the cache lives in. Tests point it elsewhere so they never touch the app's own.
    var cacheName = "tiger-cache.json"

    private var cacheURL: URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent(cacheName)
    }

    private func readCache() {
        guard let data = try? Data(contentsOf: cacheURL) else { return }
        // Your own exercises first, so a workout that names one by key resolves to it.
        struct Custom: Decodable { var customExercises: [LibraryExercise]? }
        mergeCustom((try? JSONDecoder().decode(Custom.self, from: data))?.customExercises ?? [])
        guard let c = try? Library.shared.decoder.decode(Cache.self, from: data) else { return }
        results = c.results
        myWorkouts = c.myWorkouts
        pending = c.pending
        bodyweightKg = c.bodyweightKg
        saved = Set(c.saved)
        pendingWorkouts = c.pendingWorkouts ?? []
        pendingWorkoutDeletes = c.pendingWorkoutDeletes ?? []
        pendingDeletes = c.pendingDeletes ?? []
        pendingExercises = c.pendingExercises ?? []
        trainingMaxes = c.trainingMaxes ?? [:]
        equipment = c.equipment
    }

    private func writeCache() {
        let c = Cache(
            results: results, myWorkouts: myWorkouts, pending: pending,
            bodyweightKg: bodyweightKg, saved: Array(saved),
            pendingWorkouts: pendingWorkouts, pendingWorkoutDeletes: pendingWorkoutDeletes,
            pendingDeletes: pendingDeletes,
            customExercises: Array(customExercises.values), pendingExercises: pendingExercises,
            trainingMaxes: trainingMaxes, equipment: equipment
        )
        try? JSONEncoder().encode(c).write(to: cacheURL, options: .atomic)
        shareUpNext()
    }
}
