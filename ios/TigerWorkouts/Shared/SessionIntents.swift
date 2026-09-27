import AppIntents
import Foundation

/// The buttons on the Lock Screen card. Compiled into both targets because the widget draws the
/// buttons, but a `LiveActivityIntent` always runs in the app's process: the widget never performs
/// one, it only hands it to iOS. In the app, the running session registers itself here, so a tap
/// reaches the one `SessionRunner` there is instead of a copy.
enum SessionControl: String, Sendable {
    case done, skipRest, extendRest, resume
}

@MainActor
protocol SessionControllable: AnyObject {
    /// `token` is what the card was drawn for; nil (from Shortcuts) means whatever is running now.
    func control(_ control: SessionControl, token: String?)
}

@MainActor
enum SessionControls {
    /// Held weakly: the timer screen owns the runner, and a closed session must not linger here.
    static weak var active: (any SessionControllable)?

    static func send(_ control: SessionControl, token: String?) {
        active?.control(control, token: token)
    }
}

struct CompleteStepIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Complete set"
    static var description = IntentDescription("Marks the running set or step done, the same as Done in the app.")

    @Parameter(title: "Card")
    var token: String?

    init() {}
    init(token: String) { self.token = token }

    @MainActor
    func perform() async throws -> some IntentResult {
        SessionControls.send(.done, token: token)
        return .result()
    }
}

struct SkipRestIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Skip rest"
    static var description = IntentDescription("Ends the running rest and starts what comes next.")

    @Parameter(title: "Card")
    var token: String?

    init() {}
    init(token: String) { self.token = token }

    @MainActor
    func perform() async throws -> some IntentResult {
        SessionControls.send(.skipRest, token: token)
        return .result()
    }
}

struct ExtendRestIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Add 15 seconds of rest"
    static var description = IntentDescription("Adds 15 seconds to the running rest.")

    @Parameter(title: "Card")
    var token: String?

    init() {}
    init(token: String) { self.token = token }

    @MainActor
    func perform() async throws -> some IntentResult {
        SessionControls.send(.extendRest, token: token)
        return .result()
    }
}

struct ResumeSessionIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Resume workout"
    static var description = IntentDescription("Resumes a paused session.")

    @Parameter(title: "Card")
    var token: String?

    init() {}
    init(token: String) { self.token = token }

    @MainActor
    func perform() async throws -> some IntentResult {
        SessionControls.send(.resume, token: token)
        return .result()
    }
}
