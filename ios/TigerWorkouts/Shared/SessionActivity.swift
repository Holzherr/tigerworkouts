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
        /// "Round 4 · 12 s ahead" against the last session of this workout. Nil without one.
        var ghost: String? = nil
        /// What is on the bar and how many, for the set in front of you — or, during a rest, the one
        /// coming up: "60 kg × 8", "12 reps". Nil for a timed step with nothing to load.
        var setLine: String?
        /// Which buttons the card offers: Resume while paused, none once done.
        var action: Action = .none
        /// When the block's own clock runs out — an AMRAP's or a for-time block's cap, the minute on
        /// EMOM work — and what to call it. Nil for a block without one.
        var capEndsAt: Date?
        var capLabel: String?
        /// Names the phase and slot the card was drawn for. A tap carries it back, so a button on a
        /// card that is behind the session (a rest that already ran out) does nothing rather than
        /// acting on whatever is running now.
        var token = ""

        enum Action: String, Codable, Hashable {
            /// Nothing to tap: finished.
            case none
            /// Paused: Resume.
            case resume
            /// Lead-in or a block gate: Start.
            case start
            /// A set or step: Done.
            case done
            /// A counted-down rest: +15 s and Skip rest.
            case rest
        }

        /// What the Lock Screen shows as the clock, either way round.
        var timerRange: ClosedRange<Date> {
            if let endsAt, endsAt > startedAt { return startedAt...endsAt }
            return startedAt...startedAt.addingTimeInterval(3_600)
        }

        var countsDown: Bool { endsAt != nil }
    }

    var title: String
}
