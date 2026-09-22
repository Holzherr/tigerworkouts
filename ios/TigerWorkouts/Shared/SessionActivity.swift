import ActivityKit
import Foundation

/// The contract between the app and the Lock Screen. Compiled into both targets, so a change here
/// reaches the widget without a shared framework.
///
/// The countdown is sent as the instant it ends rather than as a number of seconds: `Text` can
/// tick an interval down by itself on the Lock Screen, so the clock stays right between updates
/// and the app only has to push a state on an actual transition.
struct SessionActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        /// The exercise, or "Rest".
        var headline: String
        /// "Exercise 2 of 3", "Next: Sprints", "Paused".
        var detail: String
        var isRest: Bool
        var isPaused: Bool
        /// When the current countdown ends. Nil for a user-paced step, which counts up instead.
        var endsAt: Date?
        /// When the current step started, for the count-up and for a paused clock.
        var startedAt: Date
        /// 0 to 1 across the whole session.
        var progress: Double
        /// The session is over. The clock then holds still at what it came to: with nothing left to
        /// count down, an interval counts up instead and the card reads as a workout still running.
        var isDone = false

        /// What the Lock Screen shows as the clock, either way round.
        var timerRange: ClosedRange<Date> {
            if let endsAt, endsAt > startedAt { return startedAt...endsAt }
            return startedAt...startedAt.addingTimeInterval(3_600)
        }

        var countsDown: Bool { endsAt != nil }
    }

    var title: String
}
