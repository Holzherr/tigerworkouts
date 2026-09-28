import HealthKit

/// Apple Health, both ways.
///
/// Out: a finished session becomes a real `HKWorkout` in the Health app and the rings, typed by
/// what the session mostly was rather than filed as generic training.
///
/// In: bodyweight, so the calorie estimate stops guessing 80 kg, and heart rate over the session's
/// own window, which turns that estimate into a measurement. Health owns those numbers already;
/// asking the user to type them again would be the wrong answer.
@MainActor
final class Health {
    static let shared = Health()

    private let store = HKHealthStore()
    var isAvailable: Bool { HKHealthStore.isHealthDataAvailable() }

    private var writes: Set<HKSampleType> {
        var types: Set<HKSampleType> = [HKObjectType.workoutType()]
        if let energy = HKObjectType.quantityType(forIdentifier: .activeEnergyBurned) { types.insert(energy) }
        if #available(iOS 18.0, *) { types.insert(HKQuantityType(.workoutEffortScore)) }
        return types
    }

    /// Workouts written this run, by session id. After a relaunch the workout is found again by
    /// the session id it carries (`HKMetadataKeyExternalUUID`), or for one written before that, by
    /// its start time among this app's own.
    private var written: [String: HKWorkout] = [:]
    /// The effort sample tied to each of those, replaced when the effort changes.
    private var efforts: [String: HKSample] = [:]

    private var reads: Set<HKObjectType> {
        var types: Set<HKObjectType> = [HKObjectType.workoutType()]
        for id in [HKQuantityTypeIdentifier.bodyMass, .heartRate, .activeEnergyBurned] {
            if let t = HKObjectType.quantityType(forIdentifier: id) { types.insert(t) }
        }
        return types
    }

    /// HealthKit deliberately never reports read permission, so this only tells you whether the
    /// sheet has been answered for what we write. Reads simply come back empty if refused.
    var canWrite: Bool {
        isAvailable && store.authorizationStatus(for: HKObjectType.workoutType()) == .sharingAuthorized
    }

    func requestAuthorisation() async throws {
        guard isAvailable else { throw HealthError.unavailable }
        try await store.requestAuthorization(toShare: writes, read: reads)
    }

    // MARK: - Writing

    /// Saves the session as a workout. Silently does nothing when Health is off or unauthorised —
    /// a refused permission is a choice, not an error worth interrupting a finished workout for.
    @discardableResult
    func save(_ result: SessionResult, runsheet: Runsheet?, worked: [WorkedSet], kcal: Int) async -> Bool {
        guard canWrite,
              let start = ISO8601.date(result.startedAt),
              let end = result.endedAt.flatMap(ISO8601.date) ?? result.durationSec.map({ start.addingTimeInterval($0) }),
              end > start else { return false }

        let configuration = HKWorkoutConfiguration()
        configuration.activityType = Self.activityType(for: worked, runsheet: runsheet)
        let builder = HKWorkoutBuilder(healthStore: store, configuration: configuration, device: .local())

        do {
            try await builder.beginCollection(at: start)
            if kcal > 0, let type = HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned) {
                let sample = HKQuantitySample(
                    type: type,
                    quantity: HKQuantity(unit: .kilocalorie(), doubleValue: Double(kcal)),
                    start: start,
                    end: end
                )
                try await builder.addSamples([sample])
            }
            // The session id goes on the workout so a Discard can find it again, after a relaunch too.
            var metadata: [String: Any] = [HKMetadataKeyExternalUUID: result.rowId]
            if let title = result.title { metadata[HKMetadataKeyWorkoutBrandName] = title }
            try await builder.addMetadata(metadata)
            try await builder.endCollection(at: end)
            if let workout = try await builder.finishWorkout() { written[result.rowId] = workout }
            return true
        } catch {
            return false
        }
    }

    /// Takes the workout written for a session back out of Health, with its effort: a discarded or
    /// deleted session is not a workout. Found by the session id on it when it was not written this
    /// run. True when there was one.
    @discardableResult
    func deleteWorkout(for rowId: String) async -> Bool {
        guard isAvailable else { return false }
        if let effort = efforts.removeValue(forKey: rowId) { try? await store.delete(effort) }
        if let workout = written.removeValue(forKey: rowId) {
            do {
                try await store.delete(workout)
                return true
            } catch {
                return false
            }
        }
        let predicate = HKQuery.predicateForObjects(withMetadataKey: HKMetadataKeyExternalUUID, allowedValues: [rowId])
        return await withCheckedContinuation { (done: CheckedContinuation<Bool, Never>) in
            store.deleteObjects(of: HKObjectType.workoutType(), predicate: predicate) { ok, count, _ in done.resume(returning: ok && count > 0) }
        }
    }

    /// Writes the session's effort (1–10) to Health as a workout effort score tied to the workout
    /// saved for it, replacing one written before; nil takes it off. Works for any session this
    /// phone wrote to Health, in this run or an earlier one — an effort changed after a relaunch,
    /// or entered on the web and learnt in a sync. iOS 18 and later only: the type and the relate
    /// call do not exist before. Asks for the one new permission the first time.
    func setEffort(_ rpe: Double?, for result: SessionResult) async {
        guard #available(iOS 18.0, *), isAvailable, canWrite else { return }
        let rowId = result.rowId
        guard let workout = await workout(for: result) else { return }
        let type = HKQuantityType(.workoutEffortScore)
        if store.authorizationStatus(for: type) == .notDetermined {
            try? await store.requestAuthorization(toShare: [type], read: [])
        }
        guard store.authorizationStatus(for: type) == .sharingAuthorized else { return }
        // The one written this run, else whatever of ours Health has tied to the workout.
        var old: [HKSample] = efforts.removeValue(forKey: rowId).map { [$0] } ?? []
        if old.isEmpty { old = await relatedEfforts(workout) }
        for sample in old {
            _ = await Self.completion { self.store.unrelateWorkoutEffortSample(sample, from: workout, activity: nil, completion: $0) }
            try? await store.delete(sample)
        }
        guard let rpe, (1...10).contains(rpe) else { return }
        let sample = HKQuantitySample(
            type: type,
            quantity: HKQuantity(unit: .appleEffortScore(), doubleValue: rpe),
            start: workout.startDate,
            end: workout.endDate
        )
        if await Self.completion({ self.store.relateWorkoutEffortSample(sample, with: workout, activity: nil, completion: $0) }) {
            efforts[rowId] = sample
        }
    }

    /// The workout this app saved for a session: from this run, else by the session id on it, else
    /// (written before the id was kept) by its start time among this app's own workouts.
    private func workout(for result: SessionResult) async -> HKWorkout? {
        if let w = written[result.rowId] { return w }
        let mine = HKQuery.predicateForObjects(from: .default())
        let byId = HKQuery.predicateForObjects(withMetadataKey: HKMetadataKeyExternalUUID, allowedValues: [result.rowId])
        if let w = await workouts(matching: NSCompoundPredicate(andPredicateWithSubpredicates: [mine, byId])).first {
            written[result.rowId] = w
            return w
        }
        guard let start = ISO8601.date(result.startedAt) else { return nil }
        let around = HKQuery.predicateForSamples(withStart: start.addingTimeInterval(-1), end: start.addingTimeInterval(24 * 3600), options: .strictStartDate)
        let hit = await workouts(matching: NSCompoundPredicate(andPredicateWithSubpredicates: [mine, around]))
            .first { abs($0.startDate.timeIntervalSince(start)) < 1 }
        if let hit { written[result.rowId] = hit }
        return hit
    }

    private func workouts(matching predicate: NSPredicate) async -> [HKWorkout] {
        await withCheckedContinuation { continuation in
            let q = HKSampleQuery(sampleType: .workoutType(), predicate: predicate, limit: 5, sortDescriptors: nil) { _, samples, _ in
                continuation.resume(returning: (samples as? [HKWorkout]) ?? [])
            }
            store.execute(q)
        }
    }

    @available(iOS 18.0, *)
    private func relatedEfforts(_ workout: HKWorkout) async -> [HKSample] {
        let related = HKQuery.predicateForWorkoutEffortSamplesRelated(workout: workout, activity: nil)
        let mine = HKQuery.predicateForObjects(from: .default())
        return await withCheckedContinuation { continuation in
            let q = HKSampleQuery(sampleType: HKQuantityType(.workoutEffortScore), predicate: NSCompoundPredicate(andPredicateWithSubpredicates: [related, mine]), limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, _ in
                continuation.resume(returning: samples ?? [])
            }
            store.execute(q)
        }
    }

    private static func completion(_ call: (@escaping @Sendable (Bool, Error?) -> Void) -> Void) async -> Bool {
        await withCheckedContinuation { continuation in
            call { ok, _ in continuation.resume(returning: ok) }
        }
    }

    /// The kind of training this mostly was. Cardio kit decides by itself — sprints on a treadmill
    /// are still a run. Otherwise the way it was run decides before the equipment does: a Tabata of
    /// burpees or an AMRAP of kettlebell swings is interval training, not "functional strength".
    static func activityType(for worked: [WorkedSet], runsheet: Runsheet?) -> HKWorkoutActivityType {
        let kit = equipmentType(for: worked)
        switch kit {
        case .running, .walking, .cycling, .rowing, .swimming: return kit
        default: break
        }
        return runsheet.map(isIntervals) == true ? .highIntensityIntervalTraining : kit
    }

    /// Run against the clock: an amrap, emom or for-time main block, or rounds of timed work with
    /// rest between — a Tabata, a circuit on a countdown.
    static func isIntervals(_ r: Runsheet) -> Bool {
        let main = r.items.compactMap(\.asBlock).filter { ($0.role ?? .main) == .main }
        return main.contains { b in
            switch b.runMode {
            case .amrap, .emom, .fortime: return true
            case .ladder: return false
            case .rounds:
                let work = b.steps.compactMap(\.asExercise)
                let timed = !work.isEmpty && work.allSatisfy { $0.forMode == .seconds }
                let rests = b.steps.contains { $0.asExercise == nil } || (b.restBetweenSec ?? 0) > 0
                return timed && rests && b.repeatCount > 1
            }
        }
    }

    /// By working time, from the equipment alone.
    private static func equipmentType(for worked: [WorkedSet]) -> HKWorkoutActivityType {
        var seconds: [ExerciseGroup: Double] = [:]
        for w in worked { seconds[w.group ?? .body, default: 0] += w.seconds }
        switch seconds.max(by: { $0.value < $1.value })?.key {
        case .run, .treadmill: return .running
        case .walk: return .walking
        case .bike: return .cycling
        case .rower: return .rowing
        case .swim: return .swimming
        case .core: return .coreTraining
        case .barbell, .dumbbell, .gym: return .traditionalStrengthTraining
        case .kettlebell, .band, .body: return .functionalStrengthTraining
        case nil: return .other
        }
    }

    // MARK: - Reading

    /// The most recent bodyweight Health holds, in kg, with when it was measured.
    func bodyweightSample() async -> (kg: Double, date: Date)? {
        guard isAvailable, let type = HKQuantityType.quantityType(forIdentifier: .bodyMass) else { return nil }
        let sample: HKQuantitySample? = await withCheckedContinuation { continuation in
            let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
            let query = HKSampleQuery(sampleType: type, predicate: nil, limit: 1, sortDescriptors: [sort]) { _, samples, _ in
                continuation.resume(returning: samples?.first as? HKQuantitySample)
            }
            store.execute(query)
        }
        return sample.map { ($0.quantity.doubleValue(for: .gramUnit(with: .kilo)), $0.endDate) }
    }

    /// Average and peak heart rate across the session, plus what Health itself thinks the session
    /// burned. Returns nil when the watch was not on — an absent figure beats an invented one.
    func summary(from start: Date, to end: Date) async -> DeviceSummary? {
        guard isAvailable, end > start else { return nil }
        let window = HKQuery.predicateForSamples(withStart: start, end: end, options: [.strictStartDate])

        async let heart = statistics(.heartRate, predicate: window, options: [.discreteAverage, .discreteMax])
        // Not the estimate this app wrote with its own workout: asked again later, it would count itself.
        let others = NSCompoundPredicate(notPredicateWithSubpredicate: HKQuery.predicateForObjects(from: .default()))
        async let burned = statistics(.activeEnergyBurned, predicate: NSCompoundPredicate(andPredicateWithSubpredicates: [window, others]), options: [.cumulativeSum])

        let beats = HKUnit.count().unitDivided(by: .minute())
        let hr = await heart
        let energy = await burned

        let avg = hr?.averageQuantity()?.doubleValue(for: beats)
        let peak = hr?.maximumQuantity()?.doubleValue(for: beats)
        let kcal = energy?.sumQuantity()?.doubleValue(for: .kilocalorie())
        guard avg != nil || peak != nil || kcal != nil else { return nil }

        return DeviceSummary(
            avgHr: avg.map { $0.rounded() },
            maxHr: peak.map { $0.rounded() },
            calories: kcal.map { $0.rounded() },
            source: "Apple Health"
        )
    }

    private func statistics(_ id: HKQuantityTypeIdentifier, predicate: NSPredicate, options: HKStatisticsOptions) async -> HKStatistics? {
        guard let type = HKQuantityType.quantityType(forIdentifier: id) else { return nil }
        return await withCheckedContinuation { continuation in
            let query = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: predicate, options: options) { _, stats, _ in
                continuation.resume(returning: stats)
            }
            store.execute(query)
        }
    }
}

enum HealthError: LocalizedError {
    case unavailable
    /// Asked, and not allowed: turned down on the sheet now or earlier, when iOS no longer shows it.
    case notAllowed

    var errorDescription: String? {
        switch self {
        case .unavailable: "Health is not available on this device."
        case .notAllowed: "Health did not allow TigerWorkouts to save workouts. Turn it on in the Health app: your profile, Apps, TigerWorkouts."
        }
    }
}
