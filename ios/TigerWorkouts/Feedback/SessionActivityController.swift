import ActivityKit
import Foundation

/// Runs the Lock Screen activity for a session: one per run, updated only when something actually
/// changes. The clock between updates is the Lock Screen's own — see `SessionActivity.timerRange`.
@MainActor
final class SessionActivityController {
    static let shared = SessionActivityController()

    private var activity: Activity<SessionActivityAttributes>?
    /// What was last pushed, so a 10 Hz tick does not become a 10 Hz stream of updates.
    private var pushed: SessionActivityAttributes.ContentState?
    var enabled = true

    var isSupported: Bool { ActivityAuthorizationInfo().areActivitiesEnabled }

    func start(title: String, state: SessionActivityAttributes.ContentState) {
        guard enabled, isSupported, activity == nil else { return }
        activity = try? Activity.request(
            attributes: SessionActivityAttributes(title: title),
            content: ActivityContent(state: state, staleDate: nil),
            pushType: nil
        )
        pushed = state
    }

    func update(_ state: SessionActivityAttributes.ContentState) {
        guard let activity, state != pushed else { return }
        pushed = state
        Task { await activity.update(ActivityContent(state: state, staleDate: nil)) }
    }

    /// Ends immediately rather than lingering: the workout is over, and a stale card on the Lock
    /// Screen is worse than none.
    func end(_ final: SessionActivityAttributes.ContentState? = nil) {
        guard let activity else { return }
        self.activity = nil
        pushed = nil
        let content = final.map { ActivityContent(state: $0, staleDate: nil) }
        Task { await activity.end(content, dismissalPolicy: .immediate) }
    }

    /// An activity left over from a crash mid-session would otherwise sit there for hours.
    func clearStale() {
        for activity in Activity<SessionActivityAttributes>.activities {
            Task { await activity.end(nil, dismissalPolicy: .immediate) }
        }
    }
}
