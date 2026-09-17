import SwiftUI

struct RootView: View {
    @Environment(Store.self) private var store
    @State private var tab = Tab.workouts
    @State private var running: SessionRunner?

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
        .task {
            // Offer to pick up a session the app was killed in the middle of. The catalogue has
            // to be in before the lookup, and loading it twice is a no-op.
            await Task.detached(priority: .userInitiated) { Library.shared.load() }.value
            guard running == nil, let saved = SessionRunner.readSaved(),
                  let sheet = store.workout(id: saved.runsheetId) else { return }
            running = SessionRunner(resuming: sheet)
        }
    }

    private func start(_ sheet: Runsheet) {
        running = SessionRunner(runsheet: sheet, history: store.results)
    }
}

extension SessionRunner: Identifiable {
    nonisolated var id: ObjectIdentifier { ObjectIdentifier(self) }
}
