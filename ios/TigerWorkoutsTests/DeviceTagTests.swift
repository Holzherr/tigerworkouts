import Foundation
import Testing
@testable import TigerWorkouts

@Suite("device tag")
struct DeviceTagTests {
    @Test("made once and then kept, so the timer's session id is the same after a relaunch")
    func stable() throws {
        let defaults = try #require(UserDefaults(suiteName: "test-\(UUID().uuidString)"))
        let first = DeviceTag.current(in: defaults)
        #expect(first.count == 12)
        #expect(DeviceTag.current(in: defaults) == first)
        #expect(DeviceTag.current(in: try #require(UserDefaults(suiteName: "test-\(UUID().uuidString)"))) != first)
    }

    @Test("the timer's session id carries the tag, not a fixed suffix")
    @MainActor
    func rowId() {
        let id = SessionRunner.rowId(SessionRunner(runsheet: Fixtures.interval()).state)
        #expect(id.hasSuffix("-" + DeviceTag.current))
        #expect(!id.hasSuffix("-run"))
    }
}
