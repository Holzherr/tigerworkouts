import Foundation
import Testing
@testable import TigerWorkouts

/// A refresh token works once. Requests that find the access token stale at the same moment
/// (sync starts three fetches at once) must share one refresh, or the second is refused and signs
/// the person out.
@Suite("token refresh")
struct TokenRefreshTests {
    private static func session(_ refresh: String, access: String, expiresIn: Double) -> Data {
        try! JSONSerialization.data(withJSONObject: [
            "access_token": access, "refresh_token": refresh, "expires_in": expiresIn,
            "user": ["id": "u1"],
        ])
    }

    private static func stale() -> AuthSession {
        try! JSONDecoder().decode(AuthSession.self, from: session("r1", access: "old", expiresIn: 0))
    }

    /// Counts calls; refuses a refresh token it has already taken, as GoTrue does.
    private actor FakeGoTrue {
        var calls = 0
        var spent: Set<String> = []
        func refresh(_ token: String) async throws -> (Data, Int) {
            calls += 1
            try await Task.sleep(for: .milliseconds(50))
            if spent.contains(token) { return (Data(#"{"error":"invalid_grant"}"#.utf8), 400) }
            spent.insert(token)
            return (TokenRefreshTests.session("r\(calls + 1)", access: "new", expiresIn: 3600), 200)
        }
    }

    @Test("five requests with a stale token share one refresh and all stay signed in")
    func concurrentRefresh() async throws {
        let gotrue = FakeGoTrue()
        let client = Supabase(session: Self.stale()) { try await gotrue.refresh($0) }
        let tokens = try await withThrowingTaskGroup(of: String?.self) { group in
            for _ in 0..<5 { group.addTask { try await client.validAccessToken() } }
            return try await group.reduce(into: [String?]()) { $0.append($1) }
        }
        #expect(tokens == Array(repeating: "new", count: 5))
        #expect(await gotrue.calls == 1)
        #expect(await client.isSignedIn)
    }

    @Test("signing out while a refresh is out stays signed out")
    func signOutDuringRefresh() async throws {
        let gotrue = FakeGoTrue()
        let client = Supabase(session: Self.stale()) { try await gotrue.refresh($0) }
        async let token = client.validAccessToken()
        try await Task.sleep(for: .milliseconds(10))
        await client.signOut()
        _ = try await token
        #expect(await !client.isSignedIn)
    }
}
