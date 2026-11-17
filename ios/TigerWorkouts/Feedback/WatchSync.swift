import Foundation
import os
import WatchConnectivity

let watchLog = Logger(subsystem: "dev.brambruesch.tigerworkouts", category: "watch")

/// Mirrors the running session on the watch, and runs the watch's taps on the phone's session.
/// Sends only when what the watch shows changes, like `SessionActivityController`.
@MainActor
final class WatchSync: NSObject {
    static let shared = WatchSync()

    /// What was last handed over: nil inside means no session.
    private var pushed: WatchState??
    private var session: WCSession? { WCSession.isSupported() ? .default : nil }

    func push(_ state: WatchState?) {
        guard let session else { return }
        if session.delegate == nil {
            session.delegate = self
            session.activate()
        }
        guard pushed != .some(state) else { return }
        pushed = .some(state)
        send()
    }

    private func send() {
        guard let session, session.activationState == .activated, session.isPaired, session.isWatchAppInstalled,
              case let .some(state) = pushed else { return }
        let message = WatchMessage.state(state, sentAt: Date()).encoded()
        // The context is what the watch app finds when it opens; the message reaches it at once if
        // it is already open.
        do { try session.updateApplicationContext(message) } catch {
            watchLog.error("context: \(error.localizedDescription, privacy: .public)")
        }
        if session.isReachable { session.sendMessage(message, replyHandler: nil, errorHandler: nil) }
    }

    /// A message from the watch, run against the session through the same door as the Lock Screen
    /// buttons, token check included. False when it was not a command.
    @discardableResult
    nonisolated static func handle(_ dict: [String: Any], send: (SessionControl, String?) -> Void) -> Bool {
        guard case let .command(command, token) = WatchMessage.decode(dict) else { return false }
        send(control(for: command), token)
        return true
    }

    nonisolated static func control(for command: WatchCommand) -> SessionControl {
        switch command {
        case .done: .done
        case .skipRest: .skipRest
        case .extendRest: .extendRest
        case .pause: .pause
        case .resume: .resume
        }
    }

    private func received(_ dict: [String: Any]) {
        Self.handle(dict) { control, token in
            watchLog.info("tap \(control.rawValue, privacy: .public)")
            SessionControls.send(control, token: token)
        }
    }
}

extension WatchSync: WCSessionDelegate {
    nonisolated func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        if let error { watchLog.error("activate: \(error.localizedDescription, privacy: .public)") }
        Task { @MainActor in self.send() }
    }

    nonisolated func sessionDidBecomeInactive(_ session: WCSession) {}

    /// The user switched watches: activate again for the new one.
    nonisolated func sessionDidDeactivate(_ session: WCSession) {
        session.activate()
    }

    nonisolated func sessionWatchStateDidChange(_ session: WCSession) {
        Task { @MainActor in self.send() }
    }

    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        Task { @MainActor in self.received(message) }
    }

    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
        replyHandler([:])
        Task { @MainActor in self.received(message) }
    }

    nonisolated func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        Task { @MainActor in self.received(userInfo) }
    }
}

extension SessionRunner {
    /// What the watch shows: the Lock Screen card's state, plus the time left on a paused countdown
    /// (the card shows a dash there because it cannot be redrawn often enough). Holds still for the
    /// length of a slot.
    nonisolated static func watchState(_ state: RunState, runsheet: Runsheet, now: Double) -> WatchState {
        let card = lockScreenState(state, runsheet: runsheet, now: now)
        let action: WatchState.Action = switch card.action {
        case .none: .none
        case .start: .start
        case .done: .done
        case .pause: .pause
        case .resume: .resume
        case .rest: .rest
        }
        return WatchState(
            title: runsheet.title,
            headline: card.headline,
            detail: card.detail,
            setLine: card.setLine,
            isRest: card.isRest,
            isPaused: card.isPaused,
            isDone: card.isDone,
            endsAt: card.endsAt,
            startedAt: card.startedAt,
            pausedLeft: state.phase == .paused ? state.remainingMs.map { $0 / 1000 } : nil,
            action: action,
            token: card.token
        )
    }
}
