import SwiftUI

/// The Me tab as a profile: who you are and whether you are signed in, your numbers, the streak
/// and the body map from the finish screen over the last four weeks, then bodyweight. Settings
/// sit one level down.
struct MeView: View {
    @Environment(Store.self) private var store
    @State private var signingIn = false

    private var streak: Streak { EffortModel.streak(store.results) }

    /// Each muscle's share of the last four weeks' work.
    private var recentLoad: MuscleShare {
        let since = Date().addingTimeInterval(-28 * 86_400)
        let worked = store.results
            .filter { $0.startedDate >= since }
            .flatMap { EffortModel.workedFrom($0, runsheet: store.workout(id: $0.runsheetId)) }
        return Muscles.load(worked)
    }

    var body: some View {
        NavigationStack {
            List {
                Section { identity }

                Section {
                    numbers
                    if !store.results.isEmpty {
                        StreakCard(streak: streak)
                    }
                    let load = recentLoad
                    if !load.isEmpty {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Last 4 weeks").font(.headline)
                            BodyMapView(load: load)
                            FlowChips(items: load.sorted { $0.value > $1.value }.map(\.key.label))
                        }
                        .padding(16)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .cardSurface()
                    }
                    if store.results.isEmpty {
                        Text("Finish a workout and your weeks, streak and what you worked show up here.")
                            .font(.footnote)
                            .foregroundStyle(Brand.muted)
                    }
                }
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
                .listRowInsets(EdgeInsets(top: 5, leading: 0, bottom: 5, trailing: 0))

                Section("You") {
                    NavigationLink {
                        ExerciseListView()
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: "dumbbell").foregroundStyle(Brand.coral)
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Exercises").foregroundStyle(Brand.ink)
                                Text("Every exercise you have logged, and how it is going").font(.footnote).foregroundStyle(Brand.muted)
                            }
                        }
                    }

                    Stepper(
                        value: Binding(
                            get: { store.bodyweightKg ?? EffortModel.defaultBodyweightKg },
                            set: { kg in Task { await store.setBodyweight(kg) } }
                        ),
                        in: 35...200,
                        step: 0.5
                    ) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Bodyweight").foregroundStyle(Brand.ink)
                            Text(store.bodyweightKg.map { "\(Format.number($0)) kg" } ?? "Not set · calories assume \(Int(EffortModel.defaultBodyweightKg)) kg")
                                .font(.footnote)
                                .foregroundStyle(Brand.muted)
                        }
                    }
                }

                Section {
                    NavigationLink {
                        SettingsView()
                    } label: {
                        Label("Settings", systemImage: "gearshape")
                    }
                }
            }
            .navigationTitle("Me")
            .scrollContentBackground(.hidden)
            .background(Brand.canvas)
            .sheet(isPresented: $signingIn) {
                SignInView { await store.sync() }
            }
        }
    }

    private var identity: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 14) {
                Group {
                    if let user = store.user {
                        Text(Self.initials(user.email))
                            .font(.system(size: 22, weight: .heavy, design: .rounded))
                            .foregroundStyle(.white)
                    } else {
                        Image(systemName: "person.fill")
                            .font(.system(size: 24, weight: .semibold))
                            .foregroundStyle(Brand.coral)
                    }
                }
                .frame(width: 56, height: 56)
                .background(store.user == nil ? Brand.coralSoft : Brand.coral, in: Circle())

                VStack(alignment: .leading, spacing: 2) {
                    Text(store.user?.email ?? "You").font(.headline).foregroundStyle(Brand.ink)
                    Text(status).font(.footnote).foregroundStyle(Brand.muted)
                }
            }
            if store.user == nil {
                Button("Sign in to sync") { signingIn = true }
                    .buttonStyle(BigButtonStyle(filled: false))
            }
        }
        .padding(.vertical, 6)
    }

    private var status: String {
        guard store.signedIn else { return "Not signed in · sessions are kept on this phone" }
        return store.syncing ? "Syncing…" : "Synced with tigerworkouts.com"
    }

    private var numbers: some View {
        let s = streak
        return Grid(horizontalSpacing: 10, verticalSpacing: 10) {
            GridRow {
                tile("\(store.results.count)", "sessions")
                tile("\(s.thisWeek)", "this week")
            }
            GridRow {
                tile("\(s.weeks)", s.weeks == 1 ? "week running" : "weeks running")
                tile(NextUp.format(minutes: NextUp.totalMinutes(store.results)), "trained")
            }
        }
    }

    private func tile(_ value: String, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value).font(.system(size: 28, weight: .bold, design: .rounded)).monospacedDigit().foregroundStyle(Brand.ink)
            Text(label).font(.footnote).foregroundStyle(Brand.muted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .cardSurface()
        .accessibilityElement(children: .combine)
    }

    static func initials(_ email: String?) -> String {
        guard let email, let first = email.first else { return "?" }
        return String(first).uppercased()
    }

    /// Work's double tap, then the finish roll half a second later: the two shapes that matter
    /// most, close enough together to feel in one go.
    @MainActor
    static func testBuzz(play: @MainActor (Haptics.Cue) -> Void) async {
        play(.work)
        try? await Task.sleep(for: .milliseconds(500))
        play(.finish)
    }
}

/// Account, the gym switches, Health and what the app holds: everything Me used to be.
struct SettingsView: View {
    @Environment(Store.self) private var store
    @AppStorage(Switches.haptics) private var haptics = true
    @AppStorage(Switches.sound) private var sound = true
    @AppStorage(Switches.liveActivity) private var liveActivity = true
    @AppStorage("health") private var health = false
    @State private var signingIn = false
    @State private var healthError: String?

    var body: some View {
        Form {
            Section {
                if let user = store.user {
                    LabeledContent("Signed in as", value: user.email ?? "your account")
                    Button("Sync now") { Task { await store.sync() } }
                        .disabled(store.syncing)
                    if let error = store.syncError {
                        Text(error).font(.footnote).foregroundStyle(.red)
                    }
                    Button("Sign out", role: .destructive) { Task { await store.signOut() } }
                } else {
                    Button("Sign in") { signingIn = true }
                }
            } header: {
                Text("Account")
            } footer: {
                Text(store.signedIn
                     ? "Signing out keeps what is on this phone."
                     : "Same account as tigerworkouts.com. Sessions logged before you sign in go up with it.")
            }

            Section {
                Toggle("Buzz on every change", isOn: $haptics)
                // The simulator cannot buzz, so this is the two-second check in the gym.
                Button("Test buzz") { Task { await MeView.testBuzz { Haptics.shared.play($0) } } }
                    .disabled(!haptics)
                Text("Haptic engine: \(Haptics.shared.status.label)")
                    .font(.footnote)
                    .foregroundStyle(Brand.muted)
                Toggle("Tones", isOn: $sound)
                Toggle("Lock Screen card", isOn: $liveActivity)
            } header: {
                Text("In the gym")
            } footer: {
                Text("Every change of exercise, rest or block. Tones still play with the phone locked; the buzz works while Tiger is open.")
            }

            Section {
                Toggle("Apple Health", isOn: $health)
                if let healthError {
                    Label(healthError, systemImage: "exclamationmark.triangle.fill")
                        .font(.footnote)
                        .foregroundStyle(.red)
                        .accessibilityIdentifier("health-error")
                }
            } header: {
                Text("Health")
            } footer: {
                Text("Workouts count towards your rings, your bodyweight comes from Health, and your heart rate turns the calorie estimate into a measurement.")
            }

            Section {
                LabeledContent("Workouts bundled", value: "\(store.catalogue.count)")
                LabeledContent("Sessions logged", value: "\(store.results.count)")
            }
        }
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
        .scrollContentBackground(.hidden)
        .background(Brand.canvas)
        .sheet(isPresented: $signingIn) {
            SignInView { await store.sync() }
        }
        .onChange(of: haptics) { _, on in Haptics.shared.enabled = on }
        .onChange(of: sound) { _, on in Cues.shared.enabled = on }
        .onChange(of: liveActivity) { _, on in SessionActivityController.shared.enabled = on }
        .onChange(of: health) { _, on in
            guard on else { return }
            healthError = nil
            Task {
                do {
                    try await Health.shared.requestAuthorisation()
                    // The request returns quietly when the question was answered before, sheet or
                    // no sheet. Whether writing is allowed is the only answer iOS gives back.
                    guard Health.shared.canWrite else {
                        health = false
                        healthError = HealthError.notAllowed.localizedDescription
                        return
                    }
                    await store.readBodyweightFromHealth()
                } catch {
                    // Turn the switch back rather than leave it claiming something untrue, and say why.
                    health = false
                    healthError = error.localizedDescription
                }
            }
        }
    }
}
