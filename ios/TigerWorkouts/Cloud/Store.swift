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
    /// When each synced pref was last changed on this phone (PrefsMerge): the newer side wins a sync.
    private(set) var prefsUpdatedAt: [String: String] = [:]
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
    /// Sessions discarded on the finish screen. A save still in flight for one (pushing it, asking
    /// Health for the heart rate, writing it to Health) must not bring it back.
    private var discarded: Set<String> = []

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
        let ids = workout(id: runsheetId)?.lineage ?? [runsheetId]
        return results.filter { ids.contains($0.runsheetId) }.count
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
        seedLoadsIfAsked()
        seedTimedIfAsked()
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
        guard kg != bodyweightKg else { return }
        // Newer than whatever the server holds, so a sync sends it up rather than taking the old one.
        bodyweightKg = kg
        touched("bodyweightKg")
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
            async let prefs = Supabase.shared.rawPrefs()
            // What the phone changed while the fetch was out wins over the server's older copy.
            results = Self.merged(remote: try await sessions, pending: pending, deleting: pendingDeletes)
            let remote = try await workouts
            let queued = Dictionary(pendingWorkouts.map { ($0.key, $0) }, uniquingKeysWith: { _, last in last })
            let deleting = Set(pendingWorkoutDeletes)
            myWorkouts = remote
                .filter { !deleting.contains($0.key) }
                .map { queued[$0.key] ?? $0 }
                + queued.values.filter { q in !remote.contains { $0.key == q.key } }
            let before = results
            try await syncPrefs(remote: try await prefs)
            await effortsLearned(before: before)
            user = await Supabase.shared.user
            writeCache()
        } catch {
            syncError = error.localizedDescription
        }
    }

    /// An effort this phone did not have before a sync (entered on the web, or changed there) goes
    /// to Health for a session this phone wrote there; Health finds it by session id.
    private func effortsLearned(before: [SessionResult]) async {
        guard healthEnabled else { return }
        for r in Self.effortChanges(before: before, after: results) {
            await Health.shared.setEffort(r.rpe, for: r)
        }
    }

    /// Sessions whose effort a sync changed. A session new to the phone is not one: this phone
    /// never wrote it to Health.
    nonisolated static func effortChanges(before: [SessionResult], after: [SessionResult]) -> [SessionResult] {
        let old = Dictionary(before.map { ($0.rowId, $0.rpe) }, uniquingKeysWith: { a, _ in a })
        return after.filter { r in old[r.rowId].map { $0 != r.rpe } ?? false }
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

    /// Deletes the account and its data on the server. `clearPhone` also forgets everything here;
    /// otherwise History and your workouts stay on the phone, as after signing out, but nothing is
    /// queued to go up to the account that no longer exists. Returns whether the sign-in went too.
    func deleteAccount(clearPhone: Bool) async throws -> Bool {
        let account = try await Supabase.shared.deleteAccount()
        user = nil
        pending = []
        pendingWorkouts = []
        pendingWorkoutDeletes = []
        pendingDeletes = []
        pendingExercises = []
        if clearPhone {
            results = []
            myWorkouts = []
            saved = []
            trainingMaxes = [:]
            equipment = nil
            bodyweightKg = nil
            prefsUpdatedAt = [:]
            customExercises = [:]
        }
        writeCache()
        return account
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
        guard !discarded.contains(r.rowId) else { return stored() }
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
        // Discarded while it was being pushed: the push may have landed after the delete.
        if discarded.contains(r.rowId) { return await redelete(r.rowId) }
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
        guard healthEnabled, !discarded.contains(r.rowId) else { return }
        let runsheet = workout(id: r.runsheetId)
        let worked = EffortModel.workedFrom(r, runsheet: runsheet)
        // Health's own figure wins when the watch was on; ours is only an estimate.
        let kcal = r.device?.calories.map { Int($0) }
            ?? EffortModel.effort(r, worked: worked, bodyweightKg: bodyweightKg).kcal
        guard await Health.shared.save(r, runsheet: runsheet, worked: worked, kcal: kcal) else { return }
        if discarded.contains(r.rowId) { return await Health.shared.deleteWorkout(for: r.rowId) }
        if let current = results.first(where: { $0.rowId == r.rowId }), let rpe = current.rpe {
            await Health.shared.setEffort(rpe, for: current)
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
                await Health.shared.setEffort(result.rpe, for: result)
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

    /// Discard, from the finish screen. The session was logged the moment it ended, so it goes the
    /// way a delete does — off the phone, out of the queue, off the server — and out of Health as
    /// well, where a delete from History leaves it: nobody did this workout.
    func discard(_ result: SessionResult) async {
        discarded.insert(result.rowId)
        await delete(result)
        if healthEnabled { await Health.shared.deleteWorkout(for: result.rowId) }
    }

    private func redelete(_ id: String) async {
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
        touched("saved")
        await writePrefs()
    }

    func setBodyweight(_ kg: Double) async {
        guard kg != bodyweightKg else { return }
        bodyweightKg = kg
        touched("bodyweightKg")
        await writePrefs()
    }

    /// Nil takes the max off.
    func setTrainingMax(_ key: String, _ kg: Double?) async {
        guard trainingMaxes[key] != kg else { return }
        trainingMaxes[key] = kg
        touched("trainingMaxes")
        await writePrefs()
    }

    func clearTrainingMaxes() async {
        guard !trainingMaxes.isEmpty else { return }
        trainingMaxes = [:]
        touched("trainingMaxes")
        await writePrefs()
    }

    /// An empty kit clears it: suggested loads go back to the defaults.
    func setEquipment(_ e: Equipment?) async {
        let next = (e?.isEmpty ?? true) ? nil : e
        guard next != equipment else { return }
        equipment = next
        touched("equipment")
        await writePrefs()
    }

    private func touched(_ field: String) {
        prefsUpdatedAt[field] = PrefsMerge.stamp()
    }

    /// This phone's side of the prefs, as JSON. The saved list sorted, so an unchanged set reads
    /// the same every time.
    var localPrefs: PrefsMerge.Side {
        var values: [String: Any] = ["saved": saved.sorted(), "trainingMaxes": trainingMaxes]
        if let bodyweightKg { values["bodyweightKg"] = bodyweightKg }
        if let equipment, let data = try? JSONEncoder().encode(equipment), let json = try? JSONSerialization.jsonObject(with: data) {
            values["equipment"] = json
        }
        return PrefsMerge.Side(values: values, updatedAt: prefsUpdatedAt)
    }

    /// Merge the server's prefs with this phone's, field by field (PrefsMerge), keep the result, and
    /// write it back when this phone had something newer. Only the fields this app uses are taken;
    /// the web's own ride through on the row untouched.
    func syncPrefs(remote raw: [String: Any]) async throws {
        let m = PrefsMerge.merge(local: localPrefs, remote: PrefsMerge.remote(raw))
        applyPrefs(m)
        writeCache()
        if m.push { try await Supabase.shared.writePrefs(PrefsMerge.row(existing: raw, m)) }
    }

    func applyPrefs(_ m: PrefsMerge.Merged) {
        let p = Supabase.prefs(from: m.values)
        saved = Set(p.saved)
        trainingMaxes = p.trainingMaxes
        bodyweightKg = p.bodyweightKg
        equipment = p.equipment
        prefsUpdatedAt = m.updatedAt.filter { ["saved", "trainingMaxes", "bodyweightKg", "equipment"].contains($0.key) }
    }

    /// What a session starts on: last time's loads carried over, then a program's rules applied to
    /// them (+2.5 kg after a clean session, the deload after repeated misses). The workout page
    /// seeds with this before it shows the numbers; so do Up next and Do it again.
    func seeded(_ r: Runsheet) -> Runsheet {
        ProgressionRules.progressed(Settings.withLastUsed(r, results: results), results: results, kit: equipment)
    }

    /// A workout as the timer runs it: shared parts (refs) inlined — each seeded first, since the
    /// page that seeded the workout saw them only as refs — then loads given as a % of a training
    /// max or × bodyweight worked out into kilos you can load.
    func prepared(_ r: Runsheet) -> Runsheet {
        Relative.resolve(Relative.resolveRefs(r, lookup: { self.workout(id: $0).map(self.seeded) }), maxes: trainingMaxes, bodyweightKg: bodyweightKg, kit: equipment)
    }

    /// Cache first so the change survives the app being killed, then the server when there is one:
    /// read, merged field by field, written back.
    private func writePrefs() async {
        writeCache()
        guard await Supabase.shared.isSignedIn else { return }
        do {
            try await syncPrefs(remote: try await Supabase.shared.rawPrefs())
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
        // One discarded while it was on its way up is on the server again: it goes back on the
        // delete queue.
        for r in sent where discarded.contains(r.rowId) && !pendingDeletes.contains(r.rowId) { pendingDeletes.append(r.rowId) }
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
        var prefsUpdatedAt: [String: String]?
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
        prefsUpdatedAt = c.prefsUpdatedAt ?? [:]
    }

    private func writeCache() {
        let c = Cache(
            results: results, myWorkouts: myWorkouts, pending: pending,
            bodyweightKg: bodyweightKg, saved: Array(saved),
            pendingWorkouts: pendingWorkouts, pendingWorkoutDeletes: pendingWorkoutDeletes,
            pendingDeletes: pendingDeletes,
            customExercises: Array(customExercises.values), pendingExercises: pendingExercises,
            trainingMaxes: trainingMaxes, equipment: equipment, prefsUpdatedAt: prefsUpdatedAt
        )
        try? JSONEncoder().encode(c).write(to: cacheURL, options: .atomic)
        shareUpNext()
    }
}
