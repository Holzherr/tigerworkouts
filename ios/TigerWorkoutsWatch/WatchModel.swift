import Foundation
import Observation
import WatchConnectivity
import WatchKit

/// The watch's side of `WatchLink`: holds the last state the phone sent and sends taps back.
@MainActor
@Observable
final class WatchModel: NSObject {
    private(set) var state: WatchState?
    @ObservationIgnored private var sentAt = Date.distantPast

    /// A session last heard of this long ago is one the phone stopped without saying so (the app
    /// was closed mid-workout): show nothing rather than a clock that never moves on.
    static let staleAfter: TimeInterval = 6 * 3_600

    func activate() {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        session.delegate = self
        session.activate()
    }

    func apply(_ message: WatchMessage?, now: Date = Date()) {
        guard case let .state(next, at) = message, at >= sentAt else { return }
        let restEnded = state?.isRest == true && next?.isRest == false && next?.isDone == false
        sentAt = at
        state = now.timeIntervalSince(at) > Self.staleAfter ? nil : next
        if restEnded { WKInterfaceDevice.current().play(.start) }
    }

    func send(_ command: WatchCommand) {
        guard let token = state?.token else { return }
        let message = WatchMessage.command(command, token: token).encoded()
        let session = WCSession.default
        WKInterfaceDevice.current().play(.click)
        if session.isReachable {
            session.sendMessage(message, replyHandler: nil) { _ in
                // Not reachable after all: queue it. The token keeps a late one from acting on a
                // later set.
                session.transferUserInfo(message)
            }
        } else {
            session.transferUserInfo(message)
        }
    }
}

extension WatchModel: WCSessionDelegate {
    nonisolated func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        let message = WatchMessage.decode(session.receivedApplicationContext)
        Task { @MainActor in self.apply(message) }
    }

    nonisolated func session(_ session: WCSession, didReceiveApplicationContext context: [String: Any]) {
        let message = WatchMessage.decode(context)
        Task { @MainActor in self.apply(message) }
    }

    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        let decoded = WatchMessage.decode(message)
        Task { @MainActor in self.apply(decoded) }
    }
}
