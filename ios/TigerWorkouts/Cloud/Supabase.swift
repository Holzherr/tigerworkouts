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

/// One refresh at a time: a refresh token is single-use, so callers that find the access token
/// stale while a refresh is out wait for that refresh instead of spending the token again (a
/// second spend is refused with 400 and used to sign the person out).
actor Supabase {
    static let shared = Supabase()

    /// Posts a refresh token to GoTrue; answers the body and the status. A parameter so tests can
    /// count and pace the calls.
    typealias RefreshTransport = @Sendable (String) async throws -> (Data, Int)

    private var session: AuthSession?
    /// Keychain key; nil keeps the session in memory only (tests).
    private let store: String?
    private let refreshTransport: RefreshTransport
    private var refreshing: Task<String?, any Error>?

    var user: AuthUser? { session?.user }
    var isSignedIn: Bool { session != nil }

    init() {
        store = "supabase.session"
        refreshTransport = Self.liveRefresh
        if let raw = Keychain.get("supabase.session"), let data = raw.data(using: .utf8) {
            session = try? JSONDecoder().decode(AuthSession.self, from: data)
        }
    }

    /// For tests: a given session, nothing read from or written to the Keychain.
    init(session: AuthSession?, refresh: @escaping RefreshTransport) {
        store = nil
        refreshTransport = refresh
        self.session = session
    }

    private func persist() {
        guard let store else { return }
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

    /// Deletes everything the server holds for this account, then the account. The rows go first,
    /// under row-level security, so the data is gone even before `delete_account()` (migration
    /// 0006) is applied; that function removes the sign-in and the profile. Signs out once the
    /// data is gone. Returns whether the sign-in itself went too.
    func deleteAccount() async throws -> Bool {
        guard let uid = session?.user.id else { throw SupabaseError(message: "Not signed in") }
        for table in ["sessions", "workouts", "exercises", "user_state", "device_metrics"] {
            _ = try await request("rest/v1/\(table)?owner=eq.\(uid)", method: "DELETE", headers: ["Prefer": "return=minimal"])
        }
        let account = (try? await request("rest/v1/rpc/delete_account", method: "POST", body: [String: Any]())) != nil
        signOut()
        return account
    }

    // MARK: - Requests

    /// `path` carries its own query string, so it is appended as text: appending it as a path
    /// component would percent-encode the `?`, and PostgREST would see a table called
    /// `sessions?select=id,data`.
    static func endpoint(_ path: String) -> URL {
        URL(string: SupabaseConfig.url.absoluteString + "/" + path)!
    }

    /// Internal rather than private so the coaching calls (Supabase+Coaching.swift) go through it.
    func request(_ path: String, method: String = "GET", body: Any? = nil, headers: [String: String] = [:], authed: Bool = true) async throws -> (Data, HTTPURLResponse) {
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
        if !Self.fromServer(data: data, contentType: http.value(forHTTPHeaderField: "Content-Type")) {
            throw SupabaseError(message: "The network answered instead of the server. Try again on another connection.")
        }
        return (data, http)
    }

    /// Supabase answers in JSON or with nothing. A Wi-Fi sign-in page answers 200 with HTML: taken
    /// as the server, its "no rows" emptied History and its "OK" took a session off the queue.
    nonisolated static func fromServer(data: Data, contentType: String?) -> Bool {
        data.isEmpty || (contentType ?? "").lowercased().contains("json")
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

    /// For the in-app feedback note's Authorization header, so the intake Worker can verify who sent it.
    func feedbackToken() async -> String? { try? await validAccessToken() }

    func validAccessToken() async throws -> String? {
        guard let current = session else { return nil }
        if current.isFresh { return current.accessToken }
        if let refreshing { return try await refreshing.value }
        let task = Task { try await self.refresh(current.refreshToken) }
        refreshing = task
        defer { refreshing = nil }
        return try await task.value
    }

    private func refresh(_ token: String) async throws -> String? {
        let (data, status) = try await refreshTransport(token)
        // Signed out, or signed in again, while the refresh was out: that answer is for a session
        // that no longer exists, so it must neither bring it back nor sign the new one out.
        guard session?.refreshToken == token else { return session?.accessToken }
        guard (200..<300).contains(status) else {
            // The refresh token is spent or revoked: sign out rather than loop. Anything else (a
            // rate limit, a server error) says nothing about the token, and signing out on it
            // emptied History.
            if Self.refreshRefused(status) {
                session = nil
                persist()
            }
            throw SupabaseError(message: Self.message(from: data, status: status))
        }
        session = try JSONDecoder().decode(AuthSession.self, from: data)
        persist()
        return session?.accessToken
    }

    private static let liveRefresh: RefreshTransport = { token in
        var req = URLRequest(url: endpoint("auth/v1/token?grant_type=refresh_token"))
        req.httpMethod = "POST"
        req.setValue(SupabaseConfig.anonKey, forHTTPHeaderField: "apikey")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: ["refresh_token": token])
        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse else { throw SupabaseError(message: "No response") }
        return (data, http.statusCode)
    }

    /// The statuses GoTrue answers a refresh token it will not take with.
    static func refreshRefused(_ status: Int) -> Bool { status == 400 || status == 401 }

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

    /// Email and password, for an account that has one (App Review's demo login). Email codes stay
    /// the default; this stores the session the same way.
    func signInWithPassword(email: String, password: String) async throws -> AuthUser {
        let grant = Self.passwordGrant(email: email, password: password)
        let (data, _) = try await request(grant.path, method: "POST", body: grant.body, authed: false)
        session = try JSONDecoder().decode(AuthSession.self, from: data)
        persist()
        return session!.user
    }

    nonisolated static func passwordGrant(email: String, password: String) -> (path: String, body: [String: String]) {
        ("auth/v1/token?grant_type=password", ["email": email, "password": password])
    }

    // MARK: - Apple, id token

    /// Sign in with Apple: the identity token Apple hands the app, exchanged for a session. Supabase
    /// checks the token's nonce against the raw one sent here (Apple saw only its SHA-256).
    func signInWithApple(idToken: String, nonce: String) async throws -> AuthUser {
        let (data, _) = try await request("auth/v1/token?grant_type=id_token", method: "POST", body: ["provider": "apple", "id_token": idToken, "nonce": nonce], authed: false)
        session = try JSONDecoder().decode(AuthSession.self, from: data)
        persist()
        return session!.user
    }

    /// The worker route that revokes a Sign in with Apple token (`mcp/src/apple.ts`).
    static let appleRevoke = URL(string: "https://mcp.tigerworkouts.com/apple/revoke")!

    /// Whether the signed-in account has an Apple identity (`app_metadata.providers`, or its
    /// identities). False when it cannot be read.
    func signedInWithApple() async -> Bool {
        guard let token = try? await validAccessToken(), let info = try? await userInfo(accessToken: token) else { return false }
        return Self.hasAppleIdentity(info)
    }

    nonisolated static func hasAppleIdentity(_ user: [String: Any]) -> Bool {
        let meta = user["app_metadata"] as? [String: Any]
        let providers = (meta?["providers"] as? [String] ?? []) + [meta?["provider"] as? String].compactMap { $0 }
        let identities = (user["identities"] as? [[String: Any]] ?? []).compactMap { $0["provider"] as? String }
        return (providers + identities).contains("apple")
    }

    /// Ends the app's access to the Apple ID before the account is deleted (App Review 5.1.1(v),
    /// review D15): a fresh authorization code goes to the worker, which swaps it for a refresh
    /// token and revokes that at Apple. False when it could not be done (the route not configured
    /// yet, no network); deleting the account goes ahead either way.
    @discardableResult
    func revokeApple(code: String) async -> Bool {
        guard let token = try? await validAccessToken() else { return false }
        var req = URLRequest(url: Self.appleRevoke)
        req.httpMethod = "POST"
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try? JSONSerialization.data(withJSONObject: ["code": code])
        req.timeoutInterval = 20
        guard let (_, response) = try? await URLSession.shared.data(for: req) else { return false }
        return (response as? HTTPURLResponse)?.statusCode == 200
    }

    /// A random string for Apple's request; its SHA-256 goes to Apple, the raw value to Supabase.
    static func randomNonce() -> String { randomVerifier() }

    static func sha256(_ s: String) -> String {
        SHA256.hash(data: Data(s.utf8)).map { String(format: "%02x", $0) }.joined()
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

    /// Every session this account has logged, in either app. Read in pages: the server hands back
    /// at most 1000 rows to a request, and a phone that took those for the whole history dropped
    /// the rest.
    func sessions() async throws -> [SessionResult] {
        // Thrown, not an empty list: a sync would take that for an account with no sessions.
        guard let uid = session?.user.id else { throw SupabaseError(message: "Not signed in") }
        let rows = try await Self.allPages { offset, size in
            try await self.request("rest/v1/sessions?select=id,data&owner=eq.\(uid)&order=started_at.desc,id.asc&limit=\(size)&offset=\(offset)").0
        }
        return rows.compactMap { row in
            guard let id = row["id"] as? String, let payload = row["data"], JSONSerialization.isValidJSONObject(payload),
                  let body = try? JSONSerialization.data(withJSONObject: payload) else { return nil }
            return SessionRow.decode(id: id, data: body)
        }
        .sorted { $0.startedAt > $1.startedAt }
    }

    static let pageSize = 1000

    /// Every row of a paged read: pages are asked for until one comes back short. A page that is
    /// not a list of rows throws, so a partial read is never taken for the whole.
    nonisolated static func allPages(size: Int = pageSize, page: (_ offset: Int, _ size: Int) async throws -> Data) async throws -> [[String: Any]] {
        var all: [[String: Any]] = []
        while true {
            let data = try await page(all.count, size)
            guard let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
                throw SupabaseError(message: "Could not read the server's answer")
            }
            all += rows
            if rows.count < size { return all }
        }
    }

    /// Upserts the session, laid over the row's `data` as the server has it: an edit made here must
    /// not drop what the web app keeps on the row and this app does not read. The server sends the
    /// row's id back; without it the session stays queued.
    func save(_ result: SessionResult) async throws {
        guard let uid = session?.user.id else { throw SupabaseError(message: "Not signed in") }
        let (data, _) = try await request("rest/v1/sessions?select=data&id=eq.\(Self.escape(result.rowId))&owner=eq.\(uid)")
        let existing = (try? JSONSerialization.jsonObject(with: data) as? [[String: Any]])?.first?["data"] as? [String: Any]
        let (saved, _) = try await request(
            "rest/v1/sessions?on_conflict=id&select=id",
            method: "POST",
            body: [SessionRow.encode(result, owner: uid, existing: existing)],
            headers: ["Prefer": "resolution=merge-duplicates,return=representation"]
        )
        guard Self.confirmed(saved, id: result.rowId) else {
            throw SupabaseError(message: "The server did not confirm the save")
        }
    }

    /// Whether a `return=representation` answer holds the row with this id.
    nonisolated static func confirmed(_ data: Data, id: String) -> Bool {
        let rows = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]]
        return rows?.contains { $0["id"] as? String == id } ?? false
    }

    /// Deletes one session row; the web app drops it from its own list on its next sync.
    func deleteSession(id: String) async throws {
        guard let uid = session?.user.id else { throw SupabaseError(message: "Not signed in") }
        _ = try await request(
            "rest/v1/sessions?id=eq.\(Self.escape(id))&owner=eq.\(uid)",
            method: "DELETE",
            headers: ["Prefer": "return=minimal"]
        )
    }

    static func escape(_ id: String) -> String {
        id.addingPercentEncoding(withAllowedCharacters: .alphanumerics.union(CharacterSet(charactersIn: "-_"))) ?? id
    }

    /// A `workouts` row as the server has it: the workout, its `data` as it came (with what this
    /// app does not model, `Passthrough`), and when the row last changed.
    struct WorkoutRow: Codable, Hashable, Sendable {
        var sheet: Runsheet
        var raw: JSONValue?
        var updatedAt: String?
    }

    private static let workoutColumns = "id,data,creator,title,public,updated_at"

    /// The account's own workouts, on top of the bundled catalogue.
    func workouts() async throws -> [WorkoutRow] {
        guard let uid = session?.user.id else { throw SupabaseError(message: "Not signed in") }
        let rows = try await Self.allPages { offset, size in
            try await self.request("rest/v1/workouts?select=\(Self.workoutColumns)&owner=eq.\(uid)&order=updated_at.desc,id.asc&limit=\(size)&offset=\(offset)").0
        }
        return Self.decodeWorkoutRows(try JSONSerialization.data(withJSONObject: rows))
    }

    /// One of the account's workouts as the server has it now; nil when it is gone.
    func workout(id: String) async throws -> WorkoutRow? {
        guard let uid = session?.user.id else { throw SupabaseError(message: "Not signed in") }
        let (data, _) = try await request("rest/v1/workouts?select=\(Self.workoutColumns)&id=eq.\(Self.escape(id))&owner=eq.\(uid)")
        return Self.decodeWorkoutRows(data).first
    }

    /// `workouts` rows into runsheets; a row whose `data` is not a runsheet is skipped.
    static func decodeWorkouts(_ data: Data) -> [Runsheet] { decodeWorkoutRows(data).map(\.sheet) }

    static func decodeWorkoutRows(_ data: Data) -> [WorkoutRow] {
        guard let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { return [] }
        let decoder = Library.shared.decoder
        return rows.compactMap { row in
            guard let payload = row["data"] as? [String: Any], payload["items"] != nil,
                  let body = try? JSONSerialization.data(withJSONObject: payload),
                  var sheet = try? decoder.decode(Runsheet.self, from: body) else { return nil }
            if let id = row["id"] as? String { sheet.id = id }
            if let creator = row["creator"] as? String { sheet.creator = creator }
            // The column decides who can see it; `data` may predate the flag.
            sheet.isPublic = row["public"] as? Bool
            return WorkoutRow(sheet: sheet, raw: try? JSONDecoder().decode(JSONValue.self, from: body), updatedAt: row["updated_at"] as? String)
        }
    }

    /// Writes a workout this account owns. Private unless its creator made it public.
    func saveWorkout(_ r: Runsheet, sendPublic: Bool) async throws {
        guard let uid = session?.user.id else { throw SupabaseError(message: "Not signed in") }
        guard r.id != nil else { throw SupabaseError(message: "Workout has no id") }
        _ = try await request(
            "rest/v1/workouts?on_conflict=id",
            method: "POST",
            body: [try Self.workoutRow(r, owner: uid, sendPublic: sendPublic)],
            headers: ["Prefer": "resolution=merge-duplicates,return=minimal"]
        )
    }

    /// Writes a workout only while the server's row is as this phone last saw it (`since`, the
    /// row's `updated_at` from the last pull). Returns the row's new `updated_at`; nil when the
    /// row has changed or gone since, and nothing was written. A phone that had not synced once
    /// put its old copy over a newer edit made from Claude or the web (review D14).
    func saveWorkout(_ r: Runsheet, sendPublic: Bool, ifUnchangedSince since: String, raw: JSONValue?) async throws -> String? {
        guard let uid = session?.user.id else { throw SupabaseError(message: "Not signed in") }
        guard let id = r.id else { throw SupabaseError(message: "Workout has no id") }
        var row = try Self.workoutRow(r, owner: uid, sendPublic: sendPublic, raw: raw)
        row["id"] = nil
        row["owner"] = nil
        let (data, _) = try await request(
            "rest/v1/workouts?id=eq.\(Self.escape(id))&owner=eq.\(uid)&updated_at=eq.\(Self.escapeStamp(since))&select=updated_at",
            method: "PATCH",
            body: row,
            headers: ["Prefer": "return=representation"]
        )
        return Self.updatedStamp(data)
    }

    /// A timestamp as a filter value: its `+` and `:` must not read as a space or a separator.
    static func escapeStamp(_ stamp: String) -> String {
        stamp.addingPercentEncoding(withAllowedCharacters: .alphanumerics.union(CharacterSet(charactersIn: "-_."))) ?? stamp
    }

    /// The `updated_at` of the one row a conditional write returned; nil when it matched none.
    static func updatedStamp(_ data: Data) -> String? {
        ((try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]])?.first?["updated_at"] as? String
    }

    /// The `workouts` row for an upsert. `public` goes only when this phone set it: an upsert
    /// updates the columns it is sent, so leaving it out keeps what the server has (a new row
    /// starts private). The copy inside `data` goes with it, since both apps read the column first.
    ///
    /// `raw` is the row's `data` as last pulled: what this app does not model in it (an import's
    /// credit handle and review state, a field a newer web app added) is put back, so an edit on
    /// the phone does not drop it (`Passthrough`, review D14).
    static func workoutRow(_ r: Runsheet, owner: String, sendPublic: Bool, raw: JSONValue? = nil) throws -> [String: Any] {
        var data = try JSONSerialization.jsonObject(with: JSONEncoder().encode(r)) as? [String: Any] ?? [:]
        if let raw { data = Passthrough.carried(from: raw, into: data) }
        var row: [String: Any] = [
            "id": r.id ?? r.key,
            "owner": owner,
            "creator": r.creator.map { $0 as Any } ?? NSNull(),
            "title": r.title,
        ]
        if sendPublic {
            row["public"] = r.isPublic ?? false
        } else {
            data["public"] = nil
        }
        row["data"] = data
        return row
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

    /// Exercises this account made, in either app. `data` is the exercise as the web stores it.
    func exercises() async throws -> [LibraryExercise] {
        guard let uid = session?.user.id else { return [] }
        let (data, _) = try await request("rest/v1/exercises?select=key,data&owner=eq.\(uid)")
        return Self.decodeExercises(data)
    }

    /// Rows of `key, data` into exercises; the column key wins over whatever `data` says.
    static func decodeExercises(_ data: Data) -> [LibraryExercise] {
        guard let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { return [] }
        return rows.compactMap { row in
            guard let key = row["key"] as? String, var payload = row["data"] as? [String: Any] else { return nil }
            payload["key"] = key
            guard let body = try? JSONSerialization.data(withJSONObject: payload),
                  let e = try? JSONDecoder().decode(LibraryExercise.self, from: body) else { return nil }
            return e
        }
    }

    /// Upserts exercises as the web's sync does: owned by this account, `public` so a shared
    /// workout that names one still resolves for whoever opens it.
    func saveExercises(_ list: [LibraryExercise]) async throws {
        guard let uid = session?.user.id else { throw SupabaseError(message: "Not signed in") }
        guard !list.isEmpty else { return }
        let rows: [[String: Any]] = try list.map { e in
            let data = try JSONSerialization.jsonObject(with: JSONEncoder().encode(e))
            return ["key": e.key, "owner": uid, "public": true, "data": data]
        }
        _ = try await request(
            "rest/v1/exercises?on_conflict=key",
            method: "POST",
            body: rows,
            headers: ["Prefer": "resolution=merge-duplicates,return=minimal"]
        )
    }

    /// What the phone keeps on `user_state.prefs`, beside what only the web reads (name, units,
    /// avatar).
    struct Prefs {
        var bodyweightKg: Double?
        var saved: [String] = []
        var trainingMaxes: [String: Double] = [:]
        var equipment: Equipment?
        var suggestions = SuggestPrefs()
    }

    /// The whole prefs JSON as the server has it. Throws rather than answering "nothing" when it
    /// cannot be read: a write built on an empty read would wipe the web's name and avatar.
    func rawPrefs() async throws -> [String: Any] {
        guard let uid = session?.user.id else { throw SupabaseError(message: "Not signed in") }
        let (data, _) = try await request("rest/v1/user_state?select=prefs&owner=eq.\(uid)")
        guard let rows = try JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            throw SupabaseError(message: "Could not read settings")
        }
        return rows.first?["prefs"] as? [String: Any] ?? [:]
    }

    /// Writes the prefs JSON whole; the caller has merged it over `rawPrefs()` (PrefsMerge.row).
    func writePrefs(_ prefs: [String: Any]) async throws {
        guard let uid = session?.user.id else { throw SupabaseError(message: "Not signed in") }
        _ = try await request(
            "rest/v1/user_state?on_conflict=owner",
            method: "POST",
            body: [["owner": uid, "prefs": prefs]],
            headers: ["Prefer": "resolution=merge-duplicates,return=minimal"]
        )
    }

    /// Bodyweight, the saved list, training maxes and equipment, kept on `user_state.prefs` by
    /// the web app.
    func prefs() async throws -> Prefs {
        guard let uid = session?.user.id else { return Prefs() }
        let (data, _) = try await request("rest/v1/user_state?select=prefs&owner=eq.\(uid)")
        guard let rows = try JSONSerialization.jsonObject(with: data) as? [[String: Any]],
              let prefs = rows.first?["prefs"] as? [String: Any] else { return Prefs() }
        return Self.prefs(from: prefs)
    }

    /// The prefs JSON read into what the phone uses; a field it cannot read is left unset.
    nonisolated static func prefs(from json: [String: Any]) -> Prefs {
        var out = Prefs(bodyweightKg: (json["bodyweightKg"] as? NSNumber)?.doubleValue, saved: json["saved"] as? [String] ?? [])
        if let tm = json["trainingMaxes"] as? [String: Any] {
            out.trainingMaxes = tm.compactMapValues { ($0 as? NSNumber)?.doubleValue }
        }
        if let e = json["equipment"], JSONSerialization.isValidJSONObject(e),
           let data = try? JSONSerialization.data(withJSONObject: e) {
            out.equipment = try? JSONDecoder().decode(Equipment.self, from: data)
        }
        out.suggestions = SuggestPrefs.from(json: json["suggestions"])
        return out
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
