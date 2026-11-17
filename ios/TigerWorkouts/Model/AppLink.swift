import Foundation

/// Where a link into the app goes. The website's links (universal links, the Safari banner's Open)
/// arrive as `https://tigerworkouts.com/#/w/<id>` and `#/join/<code>`; the app's own scheme as
/// `tigerworkouts://w/<id>`, `tigerworkouts://join/<code>` and `tigerworkouts://do/<id>` (the Up
/// next widget). `tigerworkouts://coach` is a coach's note (a push notification).
enum AppLink: Equatable {
    case workout(String)
    case join(String)
    case start(String)
    case coach

    static func parse(_ url: URL) -> AppLink? {
        if let code = JoinLink.code(from: url) { return .join(code) }
        if url.scheme == "tigerworkouts" {
            switch url.host {
            case "w": return first(url.pathComponents.dropFirst()).map(AppLink.workout)
            case "do": return UpNextSnapshot.workoutId(fromStart: url).map(AppLink.start)
            case "coach": return .coach
            default: return nil
            }
        }
        guard url.scheme == "https" || url.scheme == "http",
              let host = url.host, host == "tigerworkouts.com" || host == "www.tigerworkouts.com" else { return nil }
        // The web router is hash-based: `#/w/<id>`.
        let parts = (url.fragment ?? "").split(separator: "/", omittingEmptySubsequences: true).map(String.init)
        guard parts.count >= 2, parts[0] == "w" else { return nil }
        return first(parts.dropFirst()).map(AppLink.workout)
    }

    /// The id, without a query or trailing junk a messenger appended.
    private static func first<S: Sequence>(_ parts: S) -> String? where S.Element == String {
        guard let raw = parts.first(where: { _ in true }),
              let id = raw.split(separator: "?").first.map(String.init)?.removingPercentEncoding,
              !id.isEmpty else { return nil }
        return id
    }
}
