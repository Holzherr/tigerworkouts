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
        return types
    }

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
            if let title = result.title {
                try await builder.addMetadata([HKMetadataKeyWorkoutBrandName: title])
            }
            try await builder.endCollection(at: end)
            _ = try await builder.finishWorkout()
            return true
        } catch {
            return false
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

    /// The most recent bodyweight Health holds, in kg.
    func bodyweightKg() async -> Double? {
        guard isAvailable, let type = HKQuantityType.quantityType(forIdentifier: .bodyMass) else { return nil }
        let sample: HKQuantitySample? = await withCheckedContinuation { continuation in
            let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
            let query = HKSampleQuery(sampleType: type, predicate: nil, limit: 1, sortDescriptors: [sort]) { _, samples, _ in
                continuation.resume(returning: samples?.first as? HKQuantitySample)
            }
            store.execute(query)
        }
        return sample?.quantity.doubleValue(for: .gramUnit(with: .kilo))
    }

    /// Average and peak heart rate across the session, plus what Health itself thinks the session
    /// burned. Returns nil when the watch was not on — an absent figure beats an invented one.
    func summary(from start: Date, to end: Date) async -> DeviceSummary? {
        guard isAvailable, end > start else { return nil }
        let window = HKQuery.predicateForSamples(withStart: start, end: end, options: [.strictStartDate])

        async let heart = statistics(.heartRate, predicate: window, options: [.discreteAverage, .discreteMax])
        async let burned = statistics(.activeEnergyBurned, predicate: window, options: [.cumulativeSum])

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

    var errorDescription: String? {
        switch self {
        case .unavailable: "Health is not available on this device."
        }
    }
}
