import Foundation
import Testing
@testable import TigerWorkouts

@Suite("coach pushes")
struct PushTests {
    @Test("the device token goes up as lower-case hex, as the server stores it")
    func hex() {
        #expect(Push.hex(Data([0x00, 0xab, 0x10, 0xff])) == "00ab10ff")
    }

    @Test("a tap opens the alert's own link, and nothing else")
    func link() {
        #expect(Push.link(from: ["link": "tigerworkouts://w/u-1"]) == URL(string: "tigerworkouts://w/u-1"))
        #expect(Push.link(from: ["link": "tigerworkouts://coach"]) == URL(string: "tigerworkouts://coach"))
        #expect(Push.link(from: ["link": "https://example.com/"]) == nil)
        #expect(Push.link(from: [:]) == nil)
    }

    private static let repo = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()

    @Test("the paid build may receive pushes")
    func entitlement() throws {
        let data = try Data(contentsOf: Self.repo.appendingPathComponent("ios/TigerWorkouts/TigerWorkouts-Paid.entitlements"))
        let plist = try #require(try PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any])
        #expect(plist["aps-environment"] as? String == "development")
    }
}
