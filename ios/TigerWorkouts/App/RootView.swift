import SwiftUI

struct RootView: View {
    @Environment(Store.self) private var store
    @Environment(\.scenePhase) private var scenePhase
    @State private var tab = Tab.workouts
    @State private var running: SessionRunner?
    @State private var interrupted: Interrupted?

    /// A session the app was killed in the middle of, waiting for a decision.
    private struct Interrupted {
        var sheet: Runsheet
        var state: RunState
        var savedAt: Date
        var partial: SessionResult?
    }

    enum Tab: Hashable { case workouts, history, me }

    var body: some View {
        TabView(selection: $tab) {
            DiscoverView(onStart: start)
                .tabItem { Label("Workouts", systemImage: "square.grid.2x2") }
                .tag(Tab.workouts)

            HistoryView()
                .tabItem { Label("History", systemImage: "clock.arrow.circlepath") }
                .tag(Tab.history)

            MeView()
                .tabItem { Label("Me", systemImage: "person.crop.circle") }
                .tag(Tab.me)
        }
        .fullScreenCover(item: $running) { runner in
            TimerView(runner: runner) { result in
                Task { await store.save(result) }
                running = nil
            }
        }
        // Asked, not assumed: reopening the app after abandoning a workout must not throw you
        // back into its timer. The lookup waits for the catalogue, or it finds nothing.
        .onChange(of: store.loaded, initial: true) { _, loaded in
            guard loaded, running == nil, interrupted == nil, let saved = SessionRunner.readSaved() else { return }
            guard let sheet = store.workout(id: saved.state.runsheetId) else {
                SessionRunner.clearSaved()
                return
            }
            SessionActivityController.shared.clearStale()
            interrupted = Interrupted(
                sheet: sheet, state: saved.state, savedAt: saved.savedAt,
                partial: SessionRunner.partialResult(of: saved.state, savedAt: saved.savedAt, runsheet: sheet)
            )
        }
        .alert(
            "Pick up where you left off?",
            isPresented: Binding(get: { interrupted != nil }, set: { if !$0 { interrupted = nil } }),
            presenting: interrupted
        ) { pending in
            Button("Resume") {
                running = SessionRunner(resuming: pending.sheet)
                interrupted = nil
            }
            // The workout happened whether or not the app survived it.
            if let partial = pending.partial {
                Button("Save what I did") {
                    SessionRunner.clearSaved()
                    interrupted = nil
                    Task { await store.save(partial) }
                }
            }
            Button("Discard", role: .destructive) {
                SessionRunner.clearSaved()
                interrupted = nil
            }
        } message: { pending in
            Text("\(pending.sheet.title) was still running when the app closed, \(pending.savedAt.formatted(.relative(presentation: .named))).")
        }
        .onChange(of: scenePhase) { _, phase in Self.scenePhaseChanged(to: phase) }
    }

    private func start(_ sheet: Runsheet) {
        running = SessionRunner(runsheet: sheet)
    }

    /// iOS stops the haptic engine when the app leaves the foreground. Coming back is the moment
    /// to start it again, rather than the first cue of a session in the gym.
    @MainActor
    static func scenePhaseChanged(to phase: ScenePhase, restart: @MainActor () -> Void = { Haptics.shared.restart() }) {
        guard phase == .active else { return }
        restart()
    }
}

extension SessionRunner: Identifiable {
    nonisolated var id: ObjectIdentifier { ObjectIdentifier(self) }
}
