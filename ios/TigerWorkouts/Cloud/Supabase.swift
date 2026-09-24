import CryptoKit
import Foundation

/// A small Supabase client: GoTrue for sign-in and PostgREST for the tables. Hand-rolled on
/// URLSession rather than pulling in the SDK — the app uses four endpoints and the SDK would be
/// the only third-party dependency in the project.
///
/// The anon key is public by design; row-level security is what protects the data.
enum SupabaseConfig {
    static let url = URL(string: "https://icpdzjohsvlpyaluxgbt.supabase.co")!
    static let anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImljcGR6am9oc3ZscHlhbHV4Z2J0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0MzQ2ODksImV4cCI6MjEwNDAxMDY4OX0.14vYnhI3VRQ3gr0V8hIIYCo0_mnpTugVwYRJLXKRh14"
    /// Registered in Info.plist; Supabase must list it under Authentication → URL Configuration.
    static let redirect = "tigerworkouts://auth"
    /// public/app-signin.html on the website; it fixes provider, redirect and method itself.
    static let signInStart = "https://tigerworkouts.com/app-signin.html"
}

struct AuthUser: Codable, Hashable, Sendable {
    var id: String
    var email: String?
}

struct AuthSession: Codable, Sendable {
    var accessToken: String
    var refreshToken: String
    var expiresAt: Date
    var user: AuthUser

    var isFresh: Bool { expiresAt.timeIntervalSinceNow > 60 }

    private enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case refreshToken = "refresh_token"
        case expiresIn = "expires_in"
        case expiresAt = "expires_at"
        case user
    }

    init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        accessToken = try c.decode(String.self, forKey: .accessToken)
        refreshToken = try c.decode(String.self, forKey: .refreshToken)
        if let at = try c.decodeIfPresent(Double.self, forKey: .expiresAt) {
            expiresAt = Date(timeIntervalSince1970: at)
        } else {
            expiresAt = Date().addingTimeInterval(try c.decodeIfPresent(Double.self, forKey: .expiresIn) ?? 3600)
        }
        user = try c.decode(AuthUser.self, forKey: .user)
    }

    func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(accessToken, forKey: .accessToken)
        try c.encode(refreshToken, forKey: .refreshToken)
        try c.encode(expiresAt.timeIntervalSince1970, forKey: .expiresAt)
        try c.encode(user, forKey: .user)
    }
}

struct SupabaseError: LocalizedError {
    var message: String
    var errorDescription: String? { message }
}

/// Serialises token refresh so two concurrent requests cannot both spend the refresh token.
actor Supabase {
    static let shared = Supabase()

    private var session: AuthSession?
    private let store = "supabase.session"

    var user: AuthUser? { session?.user }
    var isSignedIn: Bool { session != nil }

    init() {
        if let raw = Keychain.get(store), let data = raw.data(using: .utf8) {
            session = try? JSONDecoder().decode(AuthSession.self, from: data)
        }
    }

    private func persist() {
        guard let session, let data = try? JSONEncoder().encode(session), let raw = String(data: data, encoding: .utf8) else {
            Keychain.set(nil, for: store)
            return
        }
        Keychain.set(raw, for: store)
    }

    func signOut() {
        session = nil
        persist()
    }

    // MARK: - Requests

    /// `path` carries its own query string, so it is appended as text: appending it as a path
    /// component would percent-encode the `?`, and PostgREST would see a table called
    /// `sessions?select=id,data`.
    static func endpoint(_ path: String) -> URL {
        URL(string: SupabaseConfig.url.absoluteString + "/" + path)!
    }

    private func request(_ path: String, method: String = "GET", body: Any? = nil, headers: [String: String] = [:], authed: Bool = true) async throws -> (Data, HTTPURLResponse) {
        var req = URLRequest(url: Self.endpoint(path))
        req.httpMethod = method
        req.setValue(SupabaseConfig.anonKey, forHTTPHeaderField: "apikey")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        for (k, v) in headers { req.setValue(v, forHTTPHeaderField: k) }
        if authed, let token = try await validAccessToken() {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        } else if authed {
            req.setValue("Bearer \(SupabaseConfig.anonKey)", forHTTPHeaderField: "Authorization")
        }
        if let body { req.httpBody = try JSONSerialization.data(withJSONObject: body) }

        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse else { throw SupabaseError(message: "No response") }
        guard (200..<300).contains(http.statusCode) else {
            throw SupabaseError(message: Self.message(from: data, status: http.statusCode))
        }
        return (data, http)
    }

    /// GoTrue and PostgREST word their errors differently; pull whichever field is there.
    private static func message(from data: Data, status: Int) -> String {
        guard let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return "Request failed (\(status))"
        }
        for key in ["error_description", "msg", "message", "error", "hint"] {
            if let s = obj[key] as? String, !s.isEmpty { return s }
        }
        return "Request failed (\(status))"
    }

    private func validAccessToken() async throws -> String? {
        guard let current = session else { return nil }
        if current.isFresh { return current.accessToken }
        return try await refresh(current.refreshToken)
    }

    @discardableResult
    private func refresh(_ token: String) async throws -> String? {
        var req = URLRequest(url: Self.endpoint("auth/v1/token?grant_type=refresh_token"))
        req.httpMethod = "POST"
        req.setValue(SupabaseConfig.anonKey, forHTTPHeaderField: "apikey")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: ["refresh_token": token])
        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            // The refresh token is spent or revoked: sign out rather than loop.
            session = nil
            persist()
            return nil
        }
        session = try JSONDecoder().decode(AuthSession.self, from: data)
        persist()
        return session?.accessToken
    }

    // MARK: - Sign-in

    /// Passwordless: a six-digit code by email. Works with no project configuration, which is why
    /// it is the default route in.
    func sendEmailCode(to email: String) async throws {
        _ = try await request("auth/v1/otp", method: "POST", body: ["email": email, "create_user": true], authed: false)
    }

    func verifyEmailCode(email: String, code: String) async throws -> AuthUser {
        let token = code.filter(\.isNumber)
        let (data, _) = try await request("auth/v1/verify", method: "POST", body: ["email": email, "token": token, "type": "email"], authed: false)
        session = try JSONDecoder().decode(AuthSession.self, from: data)
        persist()
        return session!.user
    }

    // MARK: - Google, PKCE

    /// The verifier lives only as long as the browser sheet is open.
    private var pendingVerifier: String?

    func googleAuthURL() -> URL {
        let verifier = Self.randomVerifier()
        pendingVerifier = verifier
        let challenge = Data(SHA256.hash(data: Data(verifier.utf8))).base64URLEncoded
        // Start on tigerworkouts.com, which forwards to Supabase: iOS names the first page's host in
        // its "wants to use … to sign in" prompt, and the Supabase project address means nothing.
        var c = URLComponents(string: SupabaseConfig.signInStart)!
        c.queryItems = [.init(name: "code_challenge", value: challenge)]
        return c.url!
    }

    /// Handles both flows: `?code=` exchanges through PKCE, `#access_token=` is already a session.
    func completeOAuth(callback: URL) async throws -> AuthUser {
        let query = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems ?? []
        if let code = query.first(where: { $0.name == "code" })?.value {
            guard let verifier = pendingVerifier else { throw SupabaseError(message: "Sign-in expired, try again") }
            pendingVerifier = nil
            var req = URLRequest(url: Self.endpoint("auth/v1/token?grant_type=pkce"))
            req.httpMethod = "POST"
            req.setValue(SupabaseConfig.anonKey, forHTTPHeaderField: "apikey")
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: ["auth_code": code, "code_verifier": verifier])
            let (data, response) = try await URLSession.shared.data(for: req)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                throw SupabaseError(message: Self.message(from: data, status: (response as? HTTPURLResponse)?.statusCode ?? 0))
            }
            session = try JSONDecoder().decode(AuthSession.self, from: data)
            persist()
            return session!.user
        }
        if let fragment = callback.fragment {
            var parts: [String: String] = [:]
            for pair in fragment.split(separator: "&") {
                let kv = pair.split(separator: "=", maxSplits: 1)
                if kv.count == 2 { parts[String(kv[0])] = String(kv[1]).removingPercentEncoding ?? String(kv[1]) }
            }
            if let access = parts["access_token"], let refresh = parts["refresh_token"] {
                let payload: [String: Any] = [
                    "access_token": access,
                    "refresh_token": refresh,
                    "expires_in": Double(parts["expires_in"] ?? "3600") ?? 3600,
                    "user": try await self.userInfo(accessToken: access),
                ]
                session = try JSONDecoder().decode(AuthSession.self, from: JSONSerialization.data(withJSONObject: payload))
                persist()
                return session!.user
            }
        }
        if let error = query.first(where: { $0.name == "error_description" })?.value {
            throw SupabaseError(message: error)
        }
        throw SupabaseError(message: "Sign-in did not come back with a session")
    }

    private func userInfo(accessToken: String) async throws -> [String: Any] {
        var req = URLRequest(url: Self.endpoint("auth/v1/user"))
        req.setValue(SupabaseConfig.anonKey, forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        let (data, _) = try await URLSession.shared.data(for: req)
        return (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
    }

    private static func randomVerifier() -> String {
        var bytes = [UInt8](repeating: 0, count: 64)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        return Data(bytes).base64URLEncoded
    }

    // MARK: - Tables

    /// Every session this account has logged, in either app.
    func sessions() async throws -> [SessionResult] {
        guard let uid = session?.user.id else { return [] }
        let (data, _) = try await request("rest/v1/sessions?select=id,data&owner=eq.\(uid)")
        guard let rows = try JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { return [] }
        return rows.compactMap { row in
            guard let id = row["id"] as? String, let payload = row["data"], JSONSerialization.isValidJSONObject(payload),
                  let body = try? JSONSerialization.data(withJSONObject: payload) else { return nil }
            return SessionRow.decode(id: id, data: body)
        }
        .sorted { $0.startedAt > $1.startedAt }
    }

    func save(_ result: SessionResult) async throws {
        guard let uid = session?.user.id else { throw SupabaseError(message: "Not signed in") }
        _ = try await request(
            "rest/v1/sessions?on_conflict=id",
            method: "POST",
            body: [SessionRow.encode(result, owner: uid)],
            headers: ["Prefer": "resolution=merge-duplicates,return=minimal"]
        )
    }

    /// The account's own workouts, on top of the bundled catalogue.
    func workouts() async throws -> [Runsheet] {
        guard let uid = session?.user.id else { return [] }
        let (data, _) = try await request("rest/v1/workouts?select=id,data,creator,title,public&owner=eq.\(uid)")
        guard let rows = try JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { return [] }
        return rows.compactMap { WorkoutRowCodec.decode($0, decoder: Library.shared.decoder) }
    }

    /// Other people's public workouts, for Discover. Row-level security already hides private ones.
    func publicWorkouts() async throws -> [Runsheet] {
        let me = session?.user.id
        let (data, _) = try await request("rest/v1/workouts?select=id,data,creator,title,owner,public&public=eq.true", authed: me != nil)
        guard let rows = try JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { return [] }
        return rows
            .filter { ($0["owner"] as? String) != me }
            .compactMap { WorkoutRowCodec.decode($0, decoder: Library.shared.decoder) }
    }

    /// Writes a workout this account owns, with its own visibility (see `WorkoutRowCodec.encode`).
    func saveWorkout(_ r: Runsheet) async throws {
        guard let uid = session?.user.id else { throw SupabaseError(message: "Not signed in") }
        guard r.id != nil else { throw SupabaseError(message: "Workout has no id") }
        _ = try await request(
            "rest/v1/workouts?on_conflict=id",
            method: "POST",
            body: [try WorkoutRowCodec.encode(r, owner: uid)],
            headers: ["Prefer": "resolution=merge-duplicates,return=minimal"]
        )
    }

    func deleteWorkout(id: String) async throws {
        guard let uid = session?.user.id else { throw SupabaseError(message: "Not signed in") }
        let key = id.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? id
        _ = try await request(
            "rest/v1/workouts?id=eq.\(key)&owner=eq.\(uid)",
            method: "DELETE",
            headers: ["Prefer": "return=minimal"]
        )
    }

    /// Writes back the prefs this app owns, merged into whatever else is on the row — the web
    /// app keeps the name, units and training maxes in the same JSON and must not lose them.
    /// Workout settings are merged per workout, newest write wins, so neither app drops the other's.
    func savePrefs(bodyweightKg: Double?, saved: [String], workoutSettings: [String: WorkoutSettings]) async throws {
        guard let uid = session?.user.id else { throw SupabaseError(message: "Not signed in") }
        var prefs: [String: Any] = [:]
        if let (data, _) = try? await request("rest/v1/user_state?select=prefs&owner=eq.\(uid)"),
           let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]],
           let existing = rows.first?["prefs"] as? [String: Any] {
            prefs = existing
        }
        prefs["saved"] = saved
        if let bodyweightKg { prefs["bodyweightKg"] = bodyweightKg }
        let theirs = PrefsSettings.decode(prefs["workoutSettings"])
        prefs["workoutSettings"] = try PrefsSettings.encode(Settings.merge(theirs, workoutSettings))
        _ = try await request(
            "rest/v1/user_state?on_conflict=owner",
            method: "POST",
            body: [["owner": uid, "prefs": prefs]],
            headers: ["Prefer": "resolution=merge-duplicates,return=minimal"]
        )
    }

    /// Bodyweight, the saved list and your workout settings, kept on `user_state.prefs`.
    func prefs() async throws -> (bodyweightKg: Double?, saved: [String], workoutSettings: [String: WorkoutSettings]) {
        guard let uid = session?.user.id else { return (nil, [], [:]) }
        let (data, _) = try await request("rest/v1/user_state?select=prefs&owner=eq.\(uid)")
        guard let rows = try JSONSerialization.jsonObject(with: data) as? [[String: Any]],
              let prefs = rows.first?["prefs"] as? [String: Any] else { return (nil, [], [:]) }
        return (prefs["bodyweightKg"] as? Double, prefs["saved"] as? [String] ?? [], PrefsSettings.decode(prefs["workoutSettings"]))
    }
}

extension Data {
    /// base64url, as OAuth wants it: no padding, URL-safe alphabet.
    var base64URLEncoded: String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}

/// A `workouts` row, both ways. Mirrors `workoutToRow` / `workoutFromRow` in src/features/cloud/sync.ts.
enum WorkoutRowCodec {
    /// Visibility is the workout's own. Without one the key is left out: a new row takes the
    /// column's default (private) and an existing row keeps what it has — a push never flips it.
    static func encode(_ r: Runsheet, owner: String) throws -> [String: Any] {
        var data = try JSONSerialization.jsonObject(with: JSONEncoder().encode(r)) as? [String: Any] ?? [:]
        var row: [String: Any] = [
            "id": r.id ?? "",
            "owner": owner,
            "creator": r.creator.map { $0 as Any } ?? NSNull(),
            "title": r.title,
        ]
        if let pub = r.isPublic {
            row["public"] = pub
            data["public"] = pub
        }
        row["data"] = data
        return row
    }

    /// The `public` column is the truth about visibility; the copy inside `data` can be stale or missing.
    static func decode(_ row: [String: Any], decoder: JSONDecoder) -> Runsheet? {
        guard let payload = row["data"] as? [String: Any], payload["items"] != nil,
              let body = try? JSONSerialization.data(withJSONObject: payload),
              var sheet = try? decoder.decode(Runsheet.self, from: body) else { return nil }
        if let id = row["id"] as? String { sheet.id = id }
        if let creator = row["creator"] as? String { sheet.creator = creator }
        if let pub = row["public"] as? Bool { sheet.isPublic = pub }
        return sheet
    }
}

/// `user_state.prefs.workoutSettings` as JSON values.
enum PrefsSettings {
    static func decode(_ value: Any?) -> [String: WorkoutSettings] {
        guard let value, JSONSerialization.isValidJSONObject(value),
              let data = try? JSONSerialization.data(withJSONObject: value),
              let out = try? JSONDecoder().decode([String: WorkoutSettings].self, from: data) else { return [:] }
        return out
    }

    static func encode(_ settings: [String: WorkoutSettings]) throws -> Any {
        try JSONSerialization.jsonObject(with: JSONEncoder().encode(settings))
    }
}
