import UIKit
import UserNotifications

/// A local notification for the end of a rest, as a fallback for when the app is in the background
/// and its audio has been stopped (another app took the audio session, or iOS suspended it). The
/// tones stay the main cue; this is what still arrives when they cannot.
///
/// Scheduled only while the app is not in front, and replaced whenever the run moves on, so it
/// always matches the rest that is running. Its sound follows the Sound switch on the Me tab.
@MainActor
enum RestNotice {
    static let id = "rest-end"
    /// When the one scheduled now fires, so an unchanged rest is not re-added on every change.
    private static var scheduledFor: Double?

    /// Asked once, at the first session start. UI tests set `UITEST_NO_PROMPTS` so a system alert
    /// does not sit over every walkthrough; the one test about it clears it.
    static func askOnce() {
        guard ProcessInfo.processInfo.environment["UITEST_NO_PROMPTS"] == nil else { return }
        let center = UNUserNotificationCenter.current()
        center.getNotificationSettings { settings in
            guard settings.authorizationStatus == .notDetermined else { return }
            center.requestAuthorization(options: [.alert, .sound]) { _, _ in }
        }
    }

    /// When the running rest ends, if there is one: the instant to notify at, and what comes next.
    nonisolated static func restEnd(_ state: RunState) -> (at: Double, next: String?)? {
        guard state.phase == .running, let slot = Runner.current(state), slot.kind == .rest, let endsAt = state.endsAt else { return nil }
        let next = state.slots.dropFirst(state.i + 1).first { $0.kind == .work }?.exercise?.exercise.name
        return (endsAt, next)
    }

    /// Bring the pending notification in line with the run. In front, nothing is pending: the tones
    /// and haptics are there.
    static func sync(_ state: RunState, now: Double) {
        let inFront = UIApplication.shared.applicationState == .active
        guard !inFront, let end = restEnd(state), end.at > now + 500 else {
            cancel()
            return
        }
        guard scheduledFor != end.at else { return }
        scheduledFor = end.at
        let content = UNMutableNotificationContent()
        content.title = "Rest over"
        content.body = end.next.map { "Next: \($0)" } ?? "Back to it."
        content.sound = Switches.isOn(Switches.sound) ? .default : nil
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: max(1, (end.at - now) / 1000), repeats: false)
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [id])
        center.add(UNNotificationRequest(identifier: id, content: content, trigger: trigger))
    }

    static func cancel() {
        guard scheduledFor != nil else { return }
        scheduledFor = nil
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [id])
    }
}
