import Foundation
import Testing
@testable import TigerWorkouts

@Suite("app links")
struct AppLinkTests {
    private func parse(_ s: String) -> AppLink? { AppLink.parse(URL(string: s)!) }

    @Test("the website's workout and invite links open in the app")
    func universal() {
        #expect(parse("https://tigerworkouts.com/#/w/u-abc123") == .workout("u-abc123"))
        #expect(parse("https://www.tigerworkouts.com/#/w/cindy") == .workout("cindy"))
        #expect(parse("https://tigerworkouts.com/#/w/u-abc?utm=x") == .workout("u-abc"))
        #expect(parse("https://tigerworkouts.com/#/join/f00d") == .join("f00d"))
    }

    @Test("the app's own scheme")
    func scheme() {
        #expect(parse("tigerworkouts://w/u-abc") == .workout("u-abc"))
        #expect(parse("tigerworkouts://join/f00d") == .join("f00d"))
        #expect(parse("tigerworkouts://do/u-abc") == .start("u-abc"))
        #expect(parse("tigerworkouts://coach") == .coach)
    }

    @Test("other pages and hosts are not links into the app")
    func others() {
        #expect(parse("https://tigerworkouts.com/") == nil)
        #expect(parse("https://tigerworkouts.com/#/discover") == nil)
        #expect(parse("https://tigerworkouts.com/#/w/") == nil)
        #expect(parse("https://example.com/#/w/u-abc") == nil)
        #expect(parse("tigerworkouts://auth?code=1") == nil)
    }

    private static let repo = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()

    /// The file tigerworkouts.com serves names this app and the two routes the app opens; a typo in
    /// either and iOS keeps every link in Safari without a word.
    @Test("apple-app-site-association names this app and the routes it opens")
    func association() throws {
        let data = try Data(contentsOf: Self.repo.appendingPathComponent("public/.well-known/apple-app-site-association"))
        let json = try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        let details = try #require((json["applinks"] as? [String: Any])?["details"] as? [[String: Any]])
        #expect(details.first?["appIDs"] as? [String] == ["2JDH6Z4WZ8.dev.brambruesch.tigerworkouts"])
        let fragments = (details.first?["components"] as? [[String: String]] ?? []).compactMap { $0["#"] }
        #expect(fragments == ["/join/*", "/w/*"])
    }

    @Test("the app claims tigerworkouts.com for universal links")
    func entitlement() throws {
        let data = try Data(contentsOf: Self.repo.appendingPathComponent("ios/TigerWorkouts/TigerWorkouts-Paid.entitlements"))
        let plist = try #require(try PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any])
        #expect(plist["com.apple.developer.associated-domains"] as? [String] == ["applinks:tigerworkouts.com"])
    }
}
