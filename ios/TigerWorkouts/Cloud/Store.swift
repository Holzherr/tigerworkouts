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
    /// Whether and how to suggest progress (`SuggestPrefs`). Synced on `user_state.prefs.suggestions`;
    /// mirrored into UserDefaults for the engine and the targets (`SuggestPrefs.current()`).
    var suggestions = SuggestPrefs() {
        didSet { SuggestPrefs.store(suggestions) }
    }
    var saved: Set<String> = []
    /// Weights in kg or lb (U11): `user_state.prefs.units`, "imperial" for lb, nil for the default
    /// (kg). Mirrored into `Units` for the views.
    var units: String? {
        didSet { Units.apply(units) }
    }
    /// When each synced pref was last changed on this phone (PrefsMerge): the newer side wins a sync.
    private(set) var prefsUpdatedAt: [String: String] = [:]
    /// The account's name (`user_state.prefs.name`, set on the web's Me page), credited as the
    /// creator of workouts written or copied here. Never the email: a public workout shows it.
    private(set) var profileName: String?
    /// Exercises this account made, here or on the web. Mirrored into `Library.shared` so lookups
    /// find them; kept here too so a view that lists them redraws when one is added.
    private(set) var customExercises: [String: LibraryExercise] = [:]
    /// Made on this phone and not yet on the server.
    private var pendingExercises: [LibraryExercise] = []
    var syncing = false
    var syncError: String?
    /// Sessions logged while offline or signed out, waiting for a window to push.
    private(set) var pending: [SessionResult] = []
    private(set) var pendingWorkouts: [Runsheet] = []
    private(set) var pendingWorkoutDeletes: [String] = []
    /// Each of your workouts as the server last gave it to this phone: the copy an edit here is
    /// made on, its `data` as it came, and the row's `updated_at`. An upload goes only while the
    /// server's row is still that one (`flushWorkouts`).
    private(set) var syncedWorkouts: [String: Supabase.WorkoutRow] = [:]
    /// When each queued workout was last edited here: against a newer row on the server, the
    /// newer edit wins.
    private var workoutEditedAt: [String: String] = [:]
    /// Workouts made public or private on this phone whose upload has not landed yet.
    private var publicSetHere: Set<String> = []
    /// Sessions deleted on the phone that the server still has.
    private var pendingDeletes: [String] = []
    /// Changes made on the finish screen before `save` had put the result in the list.
    private var amendments: [String: [(inout SessionResult) -> Void]] = [:]
    /// Sessions discarded on the finish screen. A save still in flight for one (pushing it, asking
    /// Health for the heart rate, writing it to Health) must not bring it back.
    private var discarded: Set<String> = []

    var signedIn: Bool { user != nil }
    /// Bumped by each sign-out, so a sync whose fetch was out at the time does not fill the
    /// cleared phone again.
    private var signOuts = 0

    /// Your coach, what they assigned and the notes between you (Store+Coaching.swift).
    var coaching = CoachingState()

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

    /// Someone else's workouts opened from a link this launch (shared by link, or public).
    private(set) var linked: [Runsheet] = []

    /// A workout a coach assigned is found too: it is the coach's row, not in the catalogue or yours.
    func workout(id: String) -> Runsheet? {
        allWorkouts.first { $0.key == id } ?? coaching.workouts.first { $0.key == id } ?? linked.first { $0.key == id }
    }

    enum LinkedFetch { case found, hidden, offline }

    /// Asks the server for a linked workout that is not on the phone. No answer is not "private".
    func fetchLinked(id: String) async -> LinkedFetch {
        do {
            guard let sheet = try await fetchShared(id) else { return .hidden }
            linked.removeAll { $0.key == sheet.key }
            linked.append(sheet)
            return .found
        } catch {
            return .offline
        }
    }

    var fetchShared: @MainActor (String) async throws -> Runsheet? = { try await Supabase.shared.sharedWorkout(id: $0) }

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
        readCoachingCache()
        #if DEBUG
        seedLogbookIfAsked()
        seedPaceIfAsked()
        seedProgressIfAsked()
        seedWeeksIfAsked()
        seedLoadsIfAsked()
        seedArmsAbsIfAsked()
        seedTimedIfAsked()
        seedVersionsIfAsked()
        seedAICoachIfAsked()
        seedWeekOneIfAsked()
        seedCreditedIfAsked()
        #endif
        loaded = true
        shareUpNext()
        user = await Supabase.shared.user
        await readBodyweightFromHealth()
        await sync()
    }

    /// Health holds a bodyweight already; asking for it again would be the wrong answer.
    func readBodyweightFromHealth() async {
        guard healthEnabled, let sample = await Health.shared.bodyweightSample() else { return }
        takeHealthBodyweight(sample.kg, measuredAt: sample.date)
        writeCache()
    }

    /// A weighing from Health, stamped with when it was measured rather than when it was read: a
    /// weight typed on the web after it wins the sync, and reading the same sample again at the
    /// next launch changes nothing.
    func takeHealthBodyweight(_ kg: Double, measuredAt: Date) {
        let stamp = PrefsMerge.stamp(measuredAt)
        guard stamp > (prefsUpdatedAt["bodyweightKg"] ?? ""), kg != bodyweightKg else { return }
        bodyweightKg = kg
        prefsUpdatedAt["bodyweightKg"] = stamp
    }

    /// The prefs fields this phone holds and stamps; avatar is the web's.
    nonisolated static let heldPrefs = ["saved", "trainingMaxes", "bodyweightKg", "equipment", "suggestions", "name", "units"]

    func sync() async {
        #if DEBUG
        // UI tests are signed out, so a sync returns at once: -slowSync stands in for a signed-in
        // one, a second and a half out and lists replaced at the end.
        if ProcessInfo.processInfo.arguments.contains("-slowSync") {
            syncing = true
            try? await Task.sleep(for: .seconds(1.5))
            myWorkouts = myWorkouts
            results = results
            syncing = false
            return
        }
        #endif
        guard await Supabase.shared.isSignedIn else { return }
        let era = signOuts
        syncing = true
        syncError = nil
        defer { syncing = false }
        // Each queue goes up on its own, and a failure in one never stops the pull: what did not go
        // up stays queued and is laid over the server's copy below. An exercise key another account
        // holds once stopped this phone pulling for good.
        var failure: Error?
        do { try await flushPending() } catch { failure = failure ?? error }
        do { try await flushDeletes() } catch { failure = failure ?? error }
        do { try await flushWorkouts() } catch { failure = failure ?? error }
        do { try await flushExercises() } catch { failure = failure ?? error }
        do {
            // Union, as the web does: an exercise made on either side appears on both.
            mergeCustom(try await Supabase.shared.exercises())
            async let sessions = Supabase.shared.sessions()
            async let workouts = Supabase.shared.workouts()
            async let prefs = Supabase.shared.rawPrefs()
            // What the phone changed while the fetch was out wins over the server's older copy.
            let (remote, remoteWorkouts, remotePrefs) = try await (sessions, workouts, prefs)
            // Signed out while the fetch was out: the phone is clear, and stays clear.
            guard signOuts == era else { return }
            results = Self.merged(remote: remote, pending: pending, deleting: pendingDeletes)
            takeWorkouts(remoteWorkouts)
            let before = results
            try await syncPrefs(remote: remotePrefs)
            await effortsLearned(before: before)
            user = await Supabase.shared.user
            writeCache()
            syncError = failure?.localizedDescription
            Task { await backfillHeartRate() }
        } catch {
            syncError = error.localizedDescription
            // A sign-in the server ended shows as signed out; what is on the phone stays.
            user = await Supabase.shared.user
        }
        // Its own failures stay quiet: until migration 0008 is live every call here fails.
        await refreshCoaching()
    }

    /// The server's workouts with what the phone has not pushed yet laid over them: a queued edit
    /// stands in for its row, a queued delete stays gone.
    func takeWorkouts(_ rows: [Supabase.WorkoutRow]) {
        let remote = rows.map(\.sheet)
        let queued = Dictionary(pendingWorkouts.map { ($0.key, $0) }, uniquingKeysWith: { _, last in last })
        let deleting = Set(pendingWorkoutDeletes)
        // What the server has now is what the next edit here is made on. A workout with an edit
        // still queued keeps the copy that edit was made on, so its upload still finds out that
        // the server moved on.
        let seen = syncedWorkouts
        syncedWorkouts = Dictionary(rows.map { row in
            let key = row.sheet.key
            return (key, queued[key] != nil ? seen[key] ?? row : row)
        }, uniquingKeysWith: { a, _ in a })
        // A load changed on the web or by Claude since this phone last looked is a written load.
        for r in remote where queued[r.key] == nil {
            if let had = myWorkouts.first(where: { $0.key == r.key }) { markWritten(r.key, steps: Written.changed(from: had, to: r)) }
        }
        myWorkouts = remote
            .filter { !deleting.contains($0.key) }
            .map { queued[$0.key] ?? $0 }
            + queued.values.filter { q in !remote.contains { $0.key == q.key } }
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

    /// Pushes what is queued, then ends the account session and clears the phone, as the web's
    /// sign-out clears the browser (review U10, 2026-11-17): History, your workouts and the
    /// account's settings are on the account and come back with the next sign-in; the next person
    /// to sign in here sees and sends none of it. Nothing changes and a message comes back while
    /// something is still not on the account (offline, a refused row), unless `discardUnsent`:
    /// clearing then loses the only copy.
    func signOut(discardUnsent: Bool = false) async -> String? {
        if !discardUnsent {
            do { try await flushPending() } catch {}
            do { try await flushDeletes() } catch {}
            do { try await flushWorkouts() } catch {}
            do { try await flushExercises() } catch {}
            writeCache()
            if let held = Self.signOutRefusal(waiting: waitingCount) { return held }
        }
        await Push.shared.forget()
        await Supabase.shared.signOut()
        signOuts += 1
        user = nil
        syncError = nil
        forgetAccountQueues()
        clearPhone()
        writeCache()
        setCoaching(CoachingState())
        return nil
    }

    /// What the phone holds of an account: its sessions, workouts and synced settings, and a
    /// session the timer kept after a kill. Device settings (buzz, tones, Health) stay.
    func clearPhone() {
        results = []
        myWorkouts = []
        saved = []
        trainingMaxes = [:]
        equipment = nil
        suggestions = SuggestPrefs()
        units = nil
        bodyweightKg = nil
        profileName = nil
        prefsUpdatedAt = [:]
        customExercises = [:]
        SessionRunner.clearSaved()
        shareUpNext()
    }

    nonisolated static func signOutRefusal(waiting: Int) -> String? {
        guard waiting > 0 else { return nil }
        return waiting == 1
            ? "1 change is not saved to your account yet. Try again when online."
            : "\(waiting) changes are not saved to your account yet. Try again when online."
    }

    /// Everything queued for the account and what the phone knew of its rows on the server.
    func forgetAccountQueues() {
        pending = []
        pendingWorkouts = []
        pendingWorkoutDeletes = []
        syncedWorkouts = [:]
        workoutEditedAt = [:]
        publicSetHere = []
        pendingDeletes = []
        pendingExercises = []
    }

    /// Changes made on this phone that the server does not have yet, of every kind.
    var waitingCount: Int {
        pending.count + pendingDeletes.count + pendingWorkouts.count + pendingWorkoutDeletes.count + pendingExercises.count
    }

    /// Deletes the account and its data on the server. `clearPhone` also forgets everything here;
    /// otherwise History and your workouts stay on the phone, not synced, and nothing is
    /// queued to go up to the account that no longer exists. Returns whether the sign-in went too.
    func deleteAccount(clearPhone: Bool) async throws -> Bool {
        let account = try await Supabase.shared.deleteAccount()
        user = nil
        setCoaching(CoachingState())
        forgetAccountQueues()
        if clearPhone { self.clearPhone() }
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
        // A new session keeps this phone's zone; one saved again keeps the zone it had (review A10).
        if r.tzOffsetMin == nil {
            if let prev = results.first(where: { $0.rowId == r.rowId }) { r.tzOffsetMin = prev.tzOffsetMin }
            else { r.tzOffsetMin = Double(TimeZone.current.secondsFromGMT(for: r.startedDate) / 60) }
        }
        results.removeAll { $0.rowId == r.rowId }
        results.insert(r, at: 0)
        results.sort { $0.startedAt > $1.startedAt }
        pending.removeAll { $0.rowId == r.rowId }
        pending.append(r)
        // The timer's crash-safe copy goes only once the result is on disk.
        if writeCache() { stored() }
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

    /// Takes a session's workout out of Health; true when there was one. A property so a test can
    /// watch it.
    var healthDelete: @MainActor (String) async -> Bool = { await Health.shared.deleteWorkout(for: $0) }

    /// The start, and the end (or start plus duration), of a logged session.
    nonisolated static func window(_ r: SessionResult) -> (start: Date, end: Date)? {
        guard let start = ISO8601.date(r.startedAt),
              let end = r.endedAt.flatMap(ISO8601.date) ?? r.durationSec.map({ start.addingTimeInterval($0) }),
              end > start else { return nil }
        return (start, end)
    }

    /// Sessions of the last two days with no heart rate yet: read at the finish with the phone
    /// locked, Health hands back nothing, and a watch can sync to the phone minutes later.
    nonisolated static func needsHeartRate(_ results: [SessionResult], now: Date) -> [SessionResult] {
        results.filter { r in
            guard r.device == nil, r.activity == nil, let w = window(r) else { return false }
            return w.end <= now && now.timeIntervalSince(w.end) < 48 * 3600
        }
    }

    private var backfilling = false

    /// Asks Health again for the heart rate of recent sessions that have none, when the app comes
    /// to the foreground and after a sync. What it finds goes on the row and up to the account.
    func backfillHeartRate(now: Date = Date()) async {
        guard !backfilling else { return }
        backfilling = true
        defer { backfilling = false }
        for r in Self.needsHeartRate(results, now: now) {
            guard let w = Self.window(r), let device = await deviceSummary(w.start, w.end),
                  var current = results.first(where: { $0.rowId == r.rowId }), current.device == nil else { continue }
            current.device = device
            await update(current)?.value
        }
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
        if discarded.contains(r.rowId) { _ = await healthDelete(r.rowId); return }
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
        // A date or length edited here moves the Health workout too: the old one comes out and the
        // session is written again, but only when Health had one for it.
        let moved = before.map { Self.window($0).map { [$0.start, $0.end] } != Self.window(result).map { [$0.start, $0.end] } } ?? false
        return Task {
            do {
                try await flushPending()
            } catch {
                syncError = error.localizedDescription
            }
            writeCache()
            if healthEnabled, moved, await healthDelete(result.rowId) {
                await writeToHealth(result)
            } else if healthEnabled, effortChanged {
                await Health.shared.setEffort(result.rpe, for: result)
            }
        }
    }

    /// Gone from the phone at once and from the account as soon as it can be reached; the web app
    /// drops it from its own list on its next sync. The Health workout this app wrote for it goes
    /// too: a session deleted here did not happen, and Health should not count it.
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
        if healthEnabled { _ = await healthDelete(id) }
    }

    /// Discard, from the finish screen. The session was logged the moment it ended, so it goes the
    /// way a delete does — off the phone, out of the queue, off the server, out of Health — and a
    /// save still in flight for it is stopped from bringing it back.
    func discard(_ result: SessionResult) async {
        discarded.insert(result.rowId)
        await delete(result)
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

    /// "metric" or "imperial" (Settings → Weights).
    func setUnits(_ value: String) async {
        guard value != (units ?? Units.metric) else { return }
        units = value
        touched("units")
        await writePrefs()
    }

    func setSuggestions(_ p: SuggestPrefs) async {
        guard p != suggestions else { return }
        suggestions = p
        touched("suggestions")
        await writePrefs()
    }

    /// Your name, as your coach or clients and your public page show it (review round 2, U6): the
    /// web's `prefs.name`, and `profiles.name`, which the other side of a coaching link reads.
    /// 1 to 60 characters; false when it is not that.
    @discardableResult
    func setName(_ raw: String) async -> Bool {
        let name = raw.split(whereSeparator: \.isWhitespace).joined(separator: " ")
        guard (1...60).contains(name.count) else { return false }
        guard name != profileName else { return true }
        profileName = name
        touched("name")
        await writePrefs()
        try? await Supabase.shared.setProfileName(name)
        return true
    }

    private func touched(_ field: String) {
        prefsUpdatedAt[field] = PrefsMerge.stamp()
    }

    /// This phone's side of the prefs, as JSON. The saved list sorted, so an unchanged set reads
    /// the same every time.
    var localPrefs: PrefsMerge.Side {
        var values: [String: Any] = ["saved": saved.sorted(), "trainingMaxes": trainingMaxes]
        // Held since the name field (U6); unstamped until changed here, so the web's keeps winning.
        if let profileName { values["name"] = profileName }
        if let bodyweightKg { values["bodyweightKg"] = bodyweightKg }
        if let equipment, let data = try? JSONEncoder().encode(equipment), let json = try? JSONSerialization.jsonObject(with: data) {
            values["equipment"] = json
        }
        if let json = suggestions.json { values["suggestions"] = json }
        if let units { values["units"] = units }
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
        suggestions = p.suggestions
        units = p.units
        profileName = (m.values["name"] as? String).map { $0.trimmingCharacters(in: .whitespaces) }.flatMap { $0.isEmpty ? nil : $0 }
        prefsUpdatedAt = m.updatedAt.filter { Self.heldPrefs.contains($0.key) }
    }

    /// Set by the workout page as it starts a session, taken by RootView (Versions.swift).
    var startPlan: Versions.StartPlan?

    /// What a session starts on: last time's loads carried over, then a program's rules applied to
    /// them (+2.5 kg after a clean session, the deload after repeated misses). The workout page
    /// seeds with this before it shows the numbers; so do Up next and Do it again. Today's targets
    /// go in with last time's sets, so the sets start on what the "Target" line says.
    func seeded(_ r: Runsheet) -> Runsheet {
        // Suggestions off (SuggestPrefs) gives no targets: last time's loads still carry over, nothing is prefilled from a target.
        let targets = Targets.sets(r, results: results, intent: Intent.current(), kit: equipment, suggest: suggestions)
        return ProgressionRules.progressed(Settings.withLastUsed(r, results: results, targets: targets), results: results, kit: equipment)
    }

    /// The written loads of these steps of a workout changed now: they run as written until the
    /// step is next done (`Written`).
    func markWritten(_ workout: String, steps: [String]) {
        guard !steps.isEmpty else { return }
        Written.store(Written.marked(Written.current(), workout: workout, steps: steps))
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

    /// One row at a time, so an exercise the server refuses stays queued without holding up the rest.
    private func flushExercises() async throws {
        guard await Supabase.shared.isSignedIn, !pendingExercises.isEmpty else { return }
        let sending = pendingExercises
        let out = await Self.eachRow(sending) { try await Supabase.shared.saveExercises([$0]) }
        pendingExercises.removeAll { e in sending.contains(e) && !out.failed.contains(e) }
        if let error = out.error { throw error }
    }

    /// Send each item on its own; the ones that failed and the first error.
    nonisolated static func eachRow<T>(_ items: [T], send: (T) async throws -> Void) async -> (failed: [T], error: Error?) {
        var failed: [T] = []
        var first: Error?
        for x in items {
            do { try await send(x) } catch {
                failed.append(x)
                first = first ?? error
            }
        }
        return (failed, first)
    }

    // MARK: - Your own workouts

    /// Local first: the workout is in the list before the network is asked, and a failed push is
    /// queued rather than lost.
    ///
    /// Who can see it is the server's `public` column, and only `visibility` (Make public, Make
    /// private) sends it. Any other edit leaves the column alone: the screen's copy may be older
    /// than a change made on the web, and sending it unpublished the workout.
    func saveWorkout(_ r: Runsheet, visibility: Bool = false) async {
        stage(r, visibility: visibility)
        await pushWorkouts()
    }

    /// The local half of `saveWorkout`, done before it returns: a session started straight after
    /// an edit reads the edited workout as the base, so the edit is not taken for a version.
    func stage(_ r: Runsheet, visibility: Bool = false) {
        var sheet = r
        if sheet.id == nil { sheet.id = Edit.workoutId() }
        if sheet.creator == nil { sheet.creator = profileName }
        if visibility {
            publicSetHere.insert(sheet.key)
        } else if let known = myWorkouts.first(where: { $0.key == sheet.key }) {
            sheet.isPublic = known.isPublic
        }
        myWorkouts.removeAll { $0.key == sheet.key }
        myWorkouts.insert(sheet, at: 0)
        pendingWorkoutDeletes.removeAll { $0 == sheet.key }
        pendingWorkouts.removeAll { $0.key == sheet.key }
        pendingWorkouts.append(sheet)
        workoutEditedAt[sheet.key] = ISO8601.string(Date())
        writeCache()
    }

    func deleteWorkout(_ r: Runsheet) async {
        let key = r.key
        myWorkouts.removeAll { $0.key == key }
        pendingWorkouts.removeAll { $0.key == key }
        workoutEditedAt[key] = nil
        // Stamped, or the server's older saved list puts the deleted id back on the next sync.
        let unsaved = saved.remove(key) != nil
        if unsaved { touched("saved") }
        if !pendingWorkoutDeletes.contains(key) { pendingWorkoutDeletes.append(key) }
        writeCache()
        await pushWorkouts()
        if unsaved { await writePrefs() }
    }

    /// True when this workout belongs to the account and can be edited in place; a catalogue
    /// workout is duplicated instead.
    func isMine(_ r: Runsheet) -> Bool {
        myWorkouts.contains { $0.key == r.key }
    }

    func pushWorkouts() async {
        do {
            try await flushWorkouts()
            syncError = nil
        } catch {
            syncError = error.localizedDescription
        }
        writeCache()
    }

    /// The workouts table, as a flush reaches it. Properties so a test can hold an upload back.
    var cloudSignedIn: @MainActor () async -> Bool = { await Supabase.shared.isSignedIn }
    /// A workout the server has never given this phone: written as it is.
    var uploadWorkout: @MainActor (Runsheet, _ sendPublic: Bool) async throws -> Void = { try await Supabase.shared.saveWorkout($0, sendPublic: $1) }
    /// A workout this phone has pulled before: written only while the server's row is as it was
    /// then. The row's new `updated_at`, or nil when the row has changed or gone and nothing was written.
    var uploadWorkoutIfUnchanged: @MainActor (Runsheet, _ sendPublic: Bool, _ seen: Supabase.WorkoutRow) async throws -> String? = { r, sendPublic, seen in
        try await Supabase.shared.saveWorkout(r, sendPublic: sendPublic, ifUnchangedSince: seen.updatedAt ?? "", raw: seen.raw)
    }
    var fetchWorkout: @MainActor (String) async throws -> Supabase.WorkoutRow? = { try await Supabase.shared.workout(id: $0) }
    var removeWorkout: @MainActor (String) async throws -> Void = { try await Supabase.shared.deleteWorkout(id: $0) }

    /// One queued workout up to the server. True when it is off the queue: written, or given way
    /// to a newer edit made elsewhere.
    ///
    /// The phone's copy may be older than the server's (an edit from Claude or the web it has not
    /// pulled yet), so the write is conditional on the row's `updated_at` being the one last
    /// pulled. When it is not, the row is pulled and merged (`WorkoutMerge`): what only one side
    /// changed is kept, and the newer edit wins where both changed the same thing (review D14).
    private func upload(_ r: Runsheet) async throws {
        let key = r.key
        let sendPublic = publicSetHere.contains(key)
        guard let seen = syncedWorkouts[key], seen.updatedAt != nil else {
            return try await uploadWorkout(r, sendPublic)
        }
        if let stamp = try await uploadWorkoutIfUnchanged(r, sendPublic, seen) {
            syncedWorkouts[key] = Supabase.WorkoutRow(sheet: r, raw: seen.raw, updatedAt: stamp)
            return
        }
        guard let row = try await fetchWorkout(key) else {
            // Deleted elsewhere, edited here since: the edit keeps it.
            syncedWorkouts[key] = nil
            return try await uploadWorkout(r, sendPublic)
        }
        // An edit made here while this was out is newer still: it meets the server's copy on its
        // own turn, against the copy it was made on.
        guard pendingWorkouts.last(where: { $0.key == key }) == r else { return }
        let edited = workoutEditedAt[key].flatMap(ISO8601.date) ?? .distantPast
        let changed = row.updatedAt.flatMap(ISO8601.date) ?? .distantFuture
        var merged = WorkoutMerge.merge(base: seen.sheet, local: r, remote: row.sheet, localNewer: edited > changed)
        // Who can see it is the server's, unless it was set here.
        if !sendPublic { merged.isPublic = row.sheet.isPublic }
        syncedWorkouts[key] = row
        // A load the other side wrote is a written load (`Written`).
        markWritten(key, steps: Written.changed(from: r, to: merged))
        if let at = myWorkouts.firstIndex(where: { $0.key == key }) { myWorkouts[at] = merged }
        guard merged != row.sheet else { return }
        if let stamp = try await uploadWorkoutIfUnchanged(merged, sendPublic, row) {
            syncedWorkouts[key] = Supabase.WorkoutRow(sheet: merged, raw: row.raw, updatedAt: stamp)
        } else {
            // Changed again in between: the merge stays queued for the next push.
            if let at = pendingWorkouts.lastIndex(of: r) { pendingWorkouts[at] = merged }
            throw StillQueued()
        }
    }

    /// A workout that could not go up this time and will on the next push; not a failure to show.
    private struct StillQueued: Error {}

    /// Only what went up comes off the queue: an edit or a delete queued while the batch was in
    /// flight is a different value and stays for the next push, as `flushPending` does for sessions.
    private func flushWorkouts() async throws {
        guard await cloudSignedIn() else { return }
        let sending = pendingWorkouts
        let deleting = pendingWorkoutDeletes
        var sent: [Runsheet] = []
        var removed: [String] = []
        var failure: Error?
        for r in sending {
            do {
                try await upload(r)
                sent.append(r)
            } catch is StillQueued {
            } catch {
                failure = error
            }
        }
        for id in deleting {
            do {
                try await removeWorkout(id)
                removed.append(id)
            } catch {
                failure = error
            }
        }
        pendingWorkouts.removeAll { sent.contains($0) }
        pendingWorkoutDeletes.removeAll { removed.contains($0) }
        for id in removed { syncedWorkouts[id] = nil }
        for r in sent where !pendingWorkouts.contains(where: { $0.key == r.key }) {
            publicSetHere.remove(r.key)
            workoutEditedAt[r.key] = nil
        }
        // Deleted while its upload was out: the upload may have landed after the delete.
        for r in sent where !myWorkouts.contains(where: { $0.key == r.key }) && !pendingWorkoutDeletes.contains(r.key) {
            pendingWorkoutDeletes.append(r.key)
        }
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
        /// 1 from 16 Nov 2026; a file without it is the same shape.
        var version: Int? = 1
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
        var suggestions: SuggestPrefs?
        var units: String?
        var prefsUpdatedAt: [String: String]?
        var publicSetHere: [String]?
        var syncedWorkouts: [String: Supabase.WorkoutRow]?
        var workoutEditedAt: [String: String]?
        /// Entries or fields that could not be read and were left out. Not written.
        var dropped = 0

        private enum CodingKeys: String, CodingKey {
            case version, results, myWorkouts, pending, bodyweightKg, saved, pendingWorkouts, pendingWorkoutDeletes,
                 pendingDeletes, customExercises, pendingExercises, trainingMaxes, equipment, suggestions, units,
                 prefsUpdatedAt, publicSetHere, syncedWorkouts, workoutEditedAt
        }

        init(results: [SessionResult], myWorkouts: [Runsheet], pending: [SessionResult], bodyweightKg: Double?, saved: [String],
             pendingWorkouts: [Runsheet]?, pendingWorkoutDeletes: [String]?, pendingDeletes: [String]?,
             customExercises: [LibraryExercise]?, pendingExercises: [LibraryExercise]?, trainingMaxes: [String: Double]?,
             equipment: Equipment?, suggestions: SuggestPrefs?, prefsUpdatedAt: [String: String]?, publicSetHere: [String]?,
             syncedWorkouts: [String: Supabase.WorkoutRow]?, workoutEditedAt: [String: String]?) {
            self.results = results; self.myWorkouts = myWorkouts; self.pending = pending; self.bodyweightKg = bodyweightKg
            self.saved = saved; self.pendingWorkouts = pendingWorkouts; self.pendingWorkoutDeletes = pendingWorkoutDeletes
            self.pendingDeletes = pendingDeletes; self.customExercises = customExercises; self.pendingExercises = pendingExercises
            self.trainingMaxes = trainingMaxes; self.equipment = equipment; self.suggestions = suggestions
            self.prefsUpdatedAt = prefsUpdatedAt; self.publicSetHere = publicSetHere; self.syncedWorkouts = syncedWorkouts
            self.workoutEditedAt = workoutEditedAt
        }

        /// One entry that cannot be read costs that entry, and one field that cannot be read costs
        /// that field, not the whole file: decoding it all or nothing started the app empty and the
        /// next save wrote the empty state over everything, queued sessions included.
        init(from decoder: any Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            var dropped = 0
            func list<T: Decodable>(_ key: CodingKeys) -> [T]? {
                guard c.contains(key) else { return nil }
                guard let all = try? c.decode(Lossy<T>.self, forKey: key) else { dropped += 1; return nil }
                dropped += all.dropped
                return all.items
            }
            func field<T: Decodable>(_ key: CodingKeys) -> T? {
                guard c.contains(key), (try? c.decodeNil(forKey: key)) != true else { return nil }
                guard let v = try? c.decode(T.self, forKey: key) else { dropped += 1; return nil }
                return v
            }
            version = field(.version)
            results = list(.results) ?? []
            myWorkouts = list(.myWorkouts) ?? []
            pending = list(.pending) ?? []
            bodyweightKg = field(.bodyweightKg)
            saved = list(.saved) ?? []
            pendingWorkouts = list(.pendingWorkouts)
            pendingWorkoutDeletes = list(.pendingWorkoutDeletes)
            pendingDeletes = list(.pendingDeletes)
            customExercises = list(.customExercises)
            pendingExercises = list(.pendingExercises)
            trainingMaxes = field(.trainingMaxes)
            equipment = field(.equipment)
            suggestions = field(.suggestions)
            units = field(.units)
            prefsUpdatedAt = field(.prefsUpdatedAt)
            publicSetHere = list(.publicSetHere)
            syncedWorkouts = field(.syncedWorkouts)
            workoutEditedAt = field(.workoutEditedAt)
            self.dropped = dropped
        }
    }

    /// A list read entry by entry: what does not decode is skipped and counted.
    private struct Lossy<T: Decodable>: Decodable {
        var items: [T] = []
        var dropped = 0
        init(from decoder: any Decoder) throws {
            var c = try decoder.unkeyedContainer()
            while !c.isAtEnd {
                if let x = try? c.decode(T.self) { items.append(x) } else {
                    _ = try c.decode(JSONValue.self)
                    dropped += 1
                }
            }
        }
    }

    /// The file the cache lives in. Tests point it elsewhere so they never touch the app's own.
    var cacheName = "tiger-cache.json"

    private var cacheURL: URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent(cacheName)
    }

    /// Set when the cache file is there but could not be read at all: nothing is written over it
    /// for the rest of this run.
    private(set) var cacheBlocked = false

    private func readCache() {
        guard FileManager.default.fileExists(atPath: cacheURL.path) else { return }
        guard let data = try? Data(contentsOf: cacheURL) else {
            cacheBlocked = true
            return
        }
        // Your own exercises first, so a workout that names one by key resolves to it.
        struct Custom: Decodable { var customExercises: Lossy<LibraryExercise>? }
        mergeCustom((try? JSONDecoder().decode(Custom.self, from: data))?.customExercises?.items ?? [])
        guard let c = try? Library.shared.decoder.decode(Cache.self, from: data) else {
            // Not JSON at all: kept aside as found, and the app starts from the server.
            keepUnreadable(data)
            return
        }
        if c.dropped > 0 { keepUnreadable(data) }
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
        suggestions = c.suggestions ?? SuggestPrefs()
        units = c.units
        prefsUpdatedAt = c.prefsUpdatedAt ?? [:]
        publicSetHere = Set(c.publicSetHere ?? [])
        syncedWorkouts = c.syncedWorkouts ?? [:]
        workoutEditedAt = c.workoutEditedAt ?? [:]
    }

    @discardableResult
    private func writeCache() -> Bool {
        var c = Cache(
            results: results, myWorkouts: myWorkouts, pending: pending,
            bodyweightKg: bodyweightKg, saved: Array(saved),
            pendingWorkouts: pendingWorkouts, pendingWorkoutDeletes: pendingWorkoutDeletes,
            pendingDeletes: pendingDeletes,
            customExercises: Array(customExercises.values), pendingExercises: pendingExercises,
            trainingMaxes: trainingMaxes, equipment: equipment, suggestions: suggestions, prefsUpdatedAt: prefsUpdatedAt,
            publicSetHere: publicSetHere.sorted(),
            syncedWorkouts: syncedWorkouts, workoutEditedAt: workoutEditedAt
        )
        c.units = units
        shareUpNext()
        guard !cacheBlocked else { return false }
        do {
            try JSONEncoder().encode(c).write(to: cacheURL, options: .atomic)
            return true
        } catch {
            return false
        }
    }

    /// The cache as found, beside it, before anything is written over it: what could not be read
    /// may still be recovered by hand.
    private func keepUnreadable(_ data: Data) {
        let stamp = Int(Date().timeIntervalSince1970)
        let url = cacheURL.deletingPathExtension().appendingPathExtension("unreadable-\(stamp).json")
        try? data.write(to: url, options: .atomic)
    }
}
