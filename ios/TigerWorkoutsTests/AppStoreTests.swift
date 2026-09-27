import Foundation
import HealthKit
import Testing
@testable import TigerWorkouts

@Suite("app store")
struct AppStoreTests {
    @Test("the privacy manifest ships in the app and declares both required-reason APIs")
    func privacyManifest() throws {
        let url = try #require(Bundle.main.url(forResource: "PrivacyInfo", withExtension: "xcprivacy"))
        let plist = try #require(NSDictionary(contentsOf: url))
        #expect(plist["NSPrivacyTracking"] as? Bool == false)
        let apis = (plist["NSPrivacyAccessedAPITypes"] as? [[String: Any]] ?? []).compactMap { $0["NSPrivacyAccessedAPIType"] as? String }
        #expect(Set(apis) == ["NSPrivacyAccessedAPICategoryFileTimestamp", "NSPrivacyAccessedAPICategoryUserDefaults"])
    }

    @Test("uploads skip the export compliance question")
    func encryption() {
        #expect(Bundle.main.object(forInfoDictionaryKey: "ITSAppUsesNonExemptEncryption") as? Bool == false)
    }
}

@Suite("health workout type")
@MainActor
struct HealthTypeTests {
    private func set(_ group: ExerciseGroup, _ seconds: Double = 20) -> WorkedSet {
        WorkedSet(name: group.rawValue, group: group, seconds: seconds, reps: 0, load: nil)
    }

    private func sheet(_ mode: BlockMode?, repeat n: Int, _ steps: [Step]) -> Runsheet {
        Runsheet(id: "t", title: "T", items: [.block(Block(id: "b", name: "B", repeatCount: n, mode: mode, steps: steps))])
    }

    @Test("a Tabata of burpees is interval training, not strength")
    func tabata() {
        let r = sheet(.rounds, repeat: 8, [Fixtures.work("x", Fixtures.burpee, forValue: 20), Fixtures.rest("r", 10)])
        #expect(Health.activityType(for: Array(repeating: set(.body), count: 8), runsheet: r) == .highIntensityIntervalTraining)
    }

    @Test("an amrap of swings is interval training")
    func amrap() {
        var r = Fixtures.cindy()
        r.items = [.block(Block(id: "b", name: "B", repeatCount: 1, mode: .amrap, steps: [Fixtures.work("s", Fixtures.swing, forMode: .reps, forValue: 15)], timeCapSec: 600))]
        #expect(Health.activityType(for: [set(.kettlebell, 600)], runsheet: r) == .highIntensityIntervalTraining)
    }

    @Test("sets of reps with a dumbbell stay strength training")
    func sets() {
        let r = sheet(.rounds, repeat: 4, [Fixtures.work("p", Fixtures.press, forMode: .reps, forValue: 8), Fixtures.rest("r", 90)])
        #expect(Health.activityType(for: [set(.dumbbell, 120)], runsheet: r) == .traditionalStrengthTraining)
    }

    @Test("treadmill sprints on a countdown are still a run")
    func sprints() {
        let r = sheet(.rounds, repeat: 10, [Fixtures.work("s", SessionRunnerTests.sprint, forValue: 30), Fixtures.rest("r", 30)])
        #expect(Health.activityType(for: [set(.treadmill, 300)], runsheet: r) == .running)
    }
}
