import Foundation

/// The contract between the phone and the watch. Compiled into the app and the watch app.
///
/// The phone runs the session (`SessionRunner`); the watch draws what it is sent and sends taps
/// back. It never runs a clock of its own, so the two cannot disagree about where the workout is.
/// Like the Lock Screen card, the countdown travels as the instant it ends, and the phone only
/// sends on an actual transition.
struct WatchState: Codable, Equatable, Sendable {
    var title: String
    /// The exercise, "Rest", "Get ready", "Done".
    var headline: String
    /// "Exercise 2 of 3", "Next: Sprints", "Paused · Squat".
    var detail: String
    /// "60 kg × 8": the set in front of you, or during a rest the one coming up.
    var setLine: String?
    var isRest: Bool
    var isPaused: Bool
    var isDone: Bool
    /// When the countdown ends. Nil for a user-paced step, which counts up from `startedAt`.
    var endsAt: Date?
    var startedAt: Date
    /// Seconds left on a paused countdown, drawn as a still number.
    var pausedLeft: Double?
    var action: Action
    /// The phase and slot this was drawn for (`SessionRunner.token`). A tap carries it back, so a
    /// tap on a screen that is behind the session does nothing.
    var token: String

    /// Which buttons the watch offers; the same set as the Lock Screen card.
    enum Action: String, Codable, Sendable {
        case none, start, done, pause, resume, rest
    }

    var timerRange: ClosedRange<Date> {
        if let endsAt, endsAt > startedAt { return startedAt...endsAt }
        return startedAt...startedAt.addingTimeInterval(3_600)
    }
}

/// What a tap on the watch asks the phone to do.
enum WatchCommand: String, Codable, CaseIterable, Sendable {
    case done, skipRest, extendRest, pause, resume
}

enum WatchMessage: Equatable, Sendable {
    /// What the phone is running; nil when nothing is. `sentAt` orders states that arrive by two
    /// routes (message and application context).
    case state(WatchState?, sentAt: Date)
    case command(WatchCommand, token: String)

    static let version = 1

    /// A property-list dictionary, as WatchConnectivity requires.
    func encoded() -> [String: Any] {
        switch self {
        case let .state(state, sentAt):
            var out: [String: Any] = ["v": Self.version, "kind": "state", "sentAt": sentAt.timeIntervalSince1970]
            if let state, let data = try? JSONEncoder().encode(state) { out["state"] = data }
            return out
        case let .command(command, token):
            return ["v": Self.version, "kind": "command", "command": command.rawValue, "token": token]
        }
    }

    /// Nil for anything malformed or from a newer version of the other side.
    static func decode(_ dict: [String: Any]) -> WatchMessage? {
        guard let v = dict["v"] as? Int, v <= version else { return nil }
        switch dict["kind"] as? String {
        case "state":
            guard let sentAt = dict["sentAt"] as? Double else { return nil }
            var state: WatchState?
            if let data = dict["state"] as? Data {
                guard let decoded = try? JSONDecoder().decode(WatchState.self, from: data) else { return nil }
                state = decoded
            }
            return .state(state, sentAt: Date(timeIntervalSince1970: sentAt))
        case "command":
            guard let raw = dict["command"] as? String, let command = WatchCommand(rawValue: raw),
                  let token = dict["token"] as? String else { return nil }
            return .command(command, token: token)
        default:
            return nil
        }
    }
}
