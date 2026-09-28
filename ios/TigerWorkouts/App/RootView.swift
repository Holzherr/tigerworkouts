import SwiftUI

struct RootView: View {
    @Environment(Store.self) private var store
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.colorScheme) private var colorScheme
    @State private var tab = Tab.workouts
    @State private var running: SessionRunner?
    @State private var interrupted: Interrupted?
    /// A workout the Up next widget asked to start, waiting for the catalogue on a cold launch.
    @State private var widgetStart: String?

    /// A session the app was killed in the middle of, waiting for a decision.
    private struct Interrupted {
        var sheet: Runsheet
        var state: RunState
        var savedAt: Date
        var partial: SessionResult?
        var canResume: Bool
    }

    enum Tab: Hashable { case workouts, history, me }

    var body: some View {
        TabView(selection: $tab) {
            DiscoverView(onStart: start)
                .tabItem { Label("Workouts", systemImage: "square.grid.2x2") }
                .tag(Tab.workouts)

            HistoryView(onStart: start)
                .tabItem { Label("History", systemImage: "clock.arrow.circlepath") }
                .tag(Tab.history)

            MeView()
                .tabItem { Label("Me", systemImage: "person.crop.circle") }
                .tag(Tab.me)
        }
        .environment(\.startSession, StartSession(run: start))
        .fullScreenCover(item: $running) { runner in
            TimerView(runner: runner, appearance: colorScheme) { running = nil }
        }
        // Asked, not assumed: reopening the app after abandoning a workout must not throw you
        // back into its timer. The lookup waits for the catalogue, or it finds nothing.
        .onChange(of: store.loaded, initial: true) { _, loaded in
            guard loaded, running == nil, interrupted == nil, let saved = SessionRunner.readSaved() else { return }
            // A workout no longer here (deleted, never saved) still gives its session back.
            let found = SessionRunner.recovery(of: saved.state, savedAt: saved.savedAt, lookup: { store.workout(id: $0) })
            // Finished, but the app died before the store had it: log it, no question to ask.
            if saved.state.phase == .done {
                if let result = found.partial {
                    Task { await store.save(result) { SessionRunner.clearSaved(startedAt: saved.state.startedAt) } }
                } else {
                    SessionRunner.clearSaved()
                }
                return
            }
            guard found.canResume || found.partial != nil else {
                SessionRunner.clearSaved()
                return
            }
            SessionActivityController.shared.clearStale()
            interrupted = Interrupted(sheet: found.sheet, state: saved.state, savedAt: saved.savedAt, partial: found.partial, canResume: found.canResume)
        }
        .alert(
            "Pick up where you left off?",
            isPresented: Binding(get: { interrupted != nil }, set: { if !$0 { interrupted = nil } }),
            presenting: interrupted
        ) { pending in
            if pending.canResume {
                Button("Resume") {
                    running = SessionRunner(resuming: store.prepared(pending.sheet), history: store.results).map(logOnFinish)
                    interrupted = nil
                }
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
        // A workout link lands on the Workouts tab, whichever tab was open.
        .onOpenURL { url in
            if url.host == "w" { tab = .workouts }
            // The Up next widget: tigerworkouts://do/<id> starts the session, as home's Start does.
            if url.host == "do", let id = UpNextSnapshot.workoutId(fromStart: url) {
                widgetStart = id
                startFromWidget()
            }
        }
        .onChange(of: store.loaded) { _, _ in startFromWidget() }
    }

    /// Runs once the catalogue is in (the lookup finds nothing before), and not over a session
    /// already running or one waiting for its resume question.
    private func startFromWidget() {
        guard let id = widgetStart, store.loaded else { return }
        widgetStart = nil
        guard running == nil, interrupted == nil, SessionRunner.readSaved() == nil, let sheet = store.workout(id: id) else { return }
        tab = .workouts
        start(store.seeded(sheet), from: .home)
    }

    private func start(_ sheet: Runsheet, from origin: SessionOrigin?) {
        guard running == nil else { return }
        // Refs inlined and % TM / × bodyweight loads worked out, so every loaded set shows a weight.
        running = logOnFinish(SessionRunner(runsheet: store.prepared(sheet), startedFrom: origin, history: store.results))
    }

    /// The workout is logged when it finishes, not when Done is tapped: the finished screen says
    /// "Workout saved", and a phone that dies on it must not make that untrue.
    private func logOnFinish(_ runner: SessionRunner) -> SessionRunner {
        let startedAt = runner.state.startedAt
        runner.onFinished = { [store] result in
            Task { await store.save(result) { SessionRunner.clearSaved(startedAt: startedAt) } }
        }
        return runner
    }

    /// iOS stops the haptic engine when the app leaves the foreground. Coming back is the moment
    /// to start it again, rather than the first cue of a session in the gym.
    @MainActor
    static func scenePhaseChanged(to phase: ScenePhase, restart: @MainActor () -> Void = { Haptics.shared.restart() }) {
        guard phase == .active else { return }
        restart()
    }
}

/// Starts a session from anywhere below the root, however deep the navigation: a past session
/// opened from an exercise's history has no closure handed down to it.
struct StartSession {
    var run: (Runsheet, SessionOrigin?) -> Void = { _, _ in }
}

private struct StartSessionKey: EnvironmentKey {
    static let defaultValue = StartSession()
}

extension EnvironmentValues {
    var startSession: StartSession {
        get { self[StartSessionKey.self] }
        set { self[StartSessionKey.self] = newValue }
    }
}

extension SessionRunner: Identifiable {
    nonisolated var id: ObjectIdentifier { ObjectIdentifier(self) }
}
