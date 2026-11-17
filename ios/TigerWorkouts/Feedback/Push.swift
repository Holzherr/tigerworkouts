import UIKit
import UserNotifications

/// Push notifications from a coach (review round 2, U3): a new workout or a note. The phone's APNs
/// token goes to the account it is signed in to (`register_push_device`, migration 0017); the
/// database tells the MCP worker, which sends the alert (mcp/src/push.ts). A tap opens the alert's
/// `link` as if it had been tapped in a browser.
///
/// The token is asked for on every launch while signed in, as Apple recommends; whether the alert
/// shows is the notification permission the app already asks for.
@MainActor
@Observable
final class Push {
    static let shared = Push()

    /// The token this phone has now, hex.
    private(set) var token: String?
    /// A tapped notification's link, waiting for the app's screens to open it.
    var opened: URL?
    private var signedIn = false

    /// A debug build from Xcode gets a sandbox token; TestFlight and the App Store a production one.
    #if DEBUG
    nonisolated static let sandbox = true
    #else
    nonisolated static let sandbox = false
    #endif

    /// Only the paid team's build carries the aps-environment entitlement.
    private var available: Bool {
        Bundle.main.object(forInfoDictionaryKey: "TigerEntitlements") as? String == "Paid"
            && ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] == nil
    }

    /// Signed in (or into another account): ask for the token and give it to this account.
    func signedIn(_ yes: Bool) {
        signedIn = yes
        guard yes, available else { return }
        if token != nil { Task { await upload() } }
        UIApplication.shared.registerForRemoteNotifications()
    }

    func received(token data: Data) {
        token = Self.hex(data)
        Task { await upload() }
    }

    /// Before signing out: this phone stops hearing about the account.
    func forget() async {
        guard let token else { return }
        _ = try? await Supabase.shared.request("rest/v1/rpc/unregister_push_device", method: "POST", body: ["p_token": token])
    }

    private func upload() async {
        guard signedIn, let token else { return }
        // Fails quietly until migration 0017 has run; the next launch tries again.
        _ = try? await Supabase.shared.request("rest/v1/rpc/register_push_device", method: "POST", body: ["p_token": token, "p_sandbox": Self.sandbox])
    }

    nonisolated static func hex(_ data: Data) -> String { data.map { String(format: "%02x", $0) }.joined() }

    /// Where a tap on this notification goes: its `link`, if it is one of the app's own.
    nonisolated static func link(from userInfo: [AnyHashable: Any]) -> URL? {
        guard let s = userInfo["link"] as? String, let url = URL(string: s), url.scheme == "tigerworkouts" else { return nil }
        return url
    }
}

/// The app delegate SwiftUI needs for remote notifications: the token, and taps on an alert.
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Task { @MainActor in Push.shared.received(token: deviceToken) }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {}

    /// In front: a coach's alert still shows. The rest notice is only scheduled while the app is in
    /// the background and stays silent in front, as before there was a delegate.
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        notification.request.identifier == "rest-end" /* RestNotice.id */ ? [] : [.banner, .list, .sound]
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        guard let url = Push.link(from: response.notification.request.content.userInfo) else { return }
        await MainActor.run { Push.shared.opened = url }
    }
}
