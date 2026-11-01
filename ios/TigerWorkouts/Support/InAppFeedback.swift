import SwiftUI
import UIKit

/// The hidden feedback box (specs/in-app-feedback.md): hold three fingers on the screen for 1.5 s,
/// anywhere, timer included. The note and what the app was doing go to feedback.nickholzherr.com, and
/// from there to the agent team's queue as a triage card.
enum InAppFeedback {
    static let endpoint = URL(string: "https://feedback.nickholzherr.com/v1/feedback")!
    /// Names the app to the intake Worker. Public (it ships in the app and the repo is public): it only keeps out drive-by posts.
    static let appKey = "3203bd3dbc491f7e649c2b6572b5c2fa"

    /// What a developer needs to find the report: account, screen, the run in progress, versions.
    /// Never a token: the access token travels in the Authorization header and the Worker checks it.
    static func context(user: AuthUser?, screen: String, recentScreens: [String], run: RunState?,
                        info: [String: Any] = Bundle.main.infoDictionary ?? [:], now: Date = Date()) -> [String: Any] {
        var c: [String: Any] = [
            "screen": ["name": screen],
            "recent_screens": Array(recentScreens.suffix(5)),
            "client_time": ISO8601DateFormatter().string(from: now),
            "app": [
                "platform": "ios",
                "version": "\(info["CFBundleShortVersionString"] ?? "?") (\(info["CFBundleVersion"] ?? "?"))",
                "device": deviceModel(), "os": "\(UIDevice.current.systemName) \(UIDevice.current.systemVersion)",
                "locale": Locale.current.identifier, "timezone": TimeZone.current.identifier,
            ],
        ]
        c["user"] = user.map { u -> [String: Any] in ["id": u.id, "email": u.email ?? NSNull()] } ?? NSNull()
        c["session"] = run.map { runSummary($0, now: now) } ?? NSNull()
        return c
    }

    static func runSummary(_ s: RunState, now: Date) -> [String: Any] {
        let slot = s.slots.indices.contains(s.i) ? s.slots[s.i] : nil
        let end = s.endedAt ?? now.timeIntervalSince1970 * 1000
        var out: [String: Any] = [
            "workout_id": s.runsheetId, "workout_title": s.title, "phase": s.phase.rawValue,
            "slot": "\(s.i + 1) of \(s.slots.count)",
            "elapsed_s": Int(((end - s.startedAt - s.pausedMs) / 1000).rounded()),
            "sets_done": s.actuals.values.filter { $0.doneAt != nil }.count,
            "started_at": ISO8601DateFormatter().string(from: Date(timeIntervalSince1970: s.startedAt / 1000)),
        ]
        if let slot {
            out["slot_kind"] = slot.kind.rawValue
            out["mode"] = slot.mode.rawValue
            out["round"] = "\(slot.round) of \(slot.rounds)"
            out["block"] = slot.blockName ?? NSNull()
            out["step"] = slot.step.asExercise?.exercise.name ?? "rest"
        }
        return out
    }

    static func payload(text: String, context: [String: Any]) -> [String: Any] {
        ["app": "tigerworkouts", "text": String(text.trimmingCharacters(in: .whitespacesAndNewlines).prefix(4000)), "context": context]
    }

    static func send(text: String, context: [String: Any], token: String?) async throws {
        var req = URLRequest(url: endpoint)
        req.httpMethod = "POST"
        req.timeoutInterval = 20
        req.setValue("application/json", forHTTPHeaderField: "content-type")
        req.setValue(appKey, forHTTPHeaderField: "x-feedback-key")
        if let token { req.setValue("Bearer \(token)", forHTTPHeaderField: "authorization") }
        req.httpBody = try JSONSerialization.data(withJSONObject: payload(text: text, context: context))
        let (data, response) = try await URLSession.shared.data(for: req)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else {
            let msg = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String
            throw SupabaseError(message: msg ?? "Couldn't send. Check the connection and try again.")
        }
    }

    private static func deviceModel() -> String {
        var sys = utsname()
        uname(&sys)
        return withUnsafeBytes(of: &sys.machine) { String(decoding: $0.prefix(while: { $0 != 0 }), as: UTF8.self) }
    }

    /// Shows the sheet over whatever is on top (a sheet or the full-screen timer included), so the
    /// running workout underneath is never dismissed or paused.
    @MainActor static func present(context: [String: Any]) {
        guard let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first(where: { $0.activationState == .foregroundActive }),
              var top = scene.keyWindow?.rootViewController else { return }
        while let next = top.presentedViewController { top = next }
        if top is UIHostingController<FeedbackSheet> { return }
        top.present(UIHostingController(rootView: FeedbackSheet(context: context)), animated: true)
    }
}

struct FeedbackSheet: View {
    let context: [String: Any]
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var sending = false
    @State private var sent = false
    @State private var error: String?
    @FocusState private var focused: Bool

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextEditor(text: $text).focused($focused).frame(minHeight: 160).accessibilityLabel("Feedback")
                } footer: {
                    Text("What went wrong, or what would make it better? It goes to the agent team with this screen, your account and any workout in progress.")
                }
                if let error { Text(error).foregroundStyle(.red) }
                if sent { Label("Sent, thanks", systemImage: "checkmark.circle.fill").foregroundStyle(.green) }
                Section {
                    DisclosureGroup("What gets sent") {
                        Text(preview).font(.caption.monospaced()).textSelection(.enabled)
                    }
                }
            }
            .navigationTitle("Feedback")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(sending ? "Sending…" : "Send") { Task { await send() } }
                        .disabled(sending || sent || text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .onAppear { focused = true }
        }
    }

    private var preview: String {
        let data = (try? JSONSerialization.data(withJSONObject: context, options: [.prettyPrinted, .sortedKeys])) ?? Data()
        return String(decoding: data, as: UTF8.self)
    }

    private func send() async {
        sending = true
        error = nil
        do {
            try await InAppFeedback.send(text: text, context: context, token: await Supabase.shared.feedbackToken())
            sent = true
            try? await Task.sleep(for: .seconds(1))
            dismiss()
        } catch { self.error = error.localizedDescription }
        sending = false
    }
}

/// Puts the three-finger hold on the window itself, so it works on every screen and over the timer,
/// without taking any touch away from the views underneath.
struct ThreeFingerHold: UIViewRepresentable {
    var action: @MainActor () -> Void

    func makeUIView(context: Context) -> HoldHost { HoldHost(action: action) }
    func updateUIView(_ view: HoldHost, context: Context) { view.action = action }

    final class HoldHost: UIView, UIGestureRecognizerDelegate {
        var action: @MainActor () -> Void
        private var hold: UILongPressGestureRecognizer?
        init(action: @escaping @MainActor () -> Void) {
            self.action = action
            super.init(frame: .zero)
            isUserInteractionEnabled = false
        }
        required init?(coder: NSCoder) { fatalError() }

        override func didMoveToWindow() {
            super.didMoveToWindow()
            guard let window, hold == nil else { return }
            let g = UILongPressGestureRecognizer(target: self, action: #selector(fired(_:)))
            g.numberOfTouchesRequired = 3
            g.minimumPressDuration = 1.5
            g.cancelsTouchesInView = false
            g.delegate = self
            window.addGestureRecognizer(g)
            hold = g
        }

        @objc private func fired(_ g: UILongPressGestureRecognizer) {
            guard g.state == .began else { return }
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            MainActor.assumeIsolated { action() }
        }

        func gestureRecognizer(_ g: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool { true }
    }
}
