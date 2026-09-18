import SwiftUI

struct MeView: View {
    @Environment(Store.self) private var store
    @AppStorage("haptics") private var haptics = true
    @AppStorage("sound") private var sound = true
    @AppStorage("liveActivity") private var liveActivity = true
    @AppStorage("health") private var health = false
    @State private var signingIn = false
    @State private var healthError: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Account") {
                    if let user = store.user {
                        LabeledContent("Signed in", value: user.email ?? "—")
                        Button("Sync now") { Task { await store.sync() } }
                            .disabled(store.syncing)
                        Button("Sign out", role: .destructive) { Task { await store.signOut() } }
                    } else {
                        Text("Sign in with the same account as tigerworkouts.com and your history is one list on both.")
                            .font(.footnote)
                            .foregroundStyle(Brand.muted)
                        Button("Sign in") { signingIn = true }
                    }
                }

                Section {
                    Toggle("Buzz on every change", isOn: $haptics)
                    Toggle("Tones", isOn: $sound)
                    Toggle("Lock Screen card", isOn: $liveActivity)
                } header: {
                    Text("In the gym")
                } footer: {
                    Text("Tones carry when the screen has locked; the buzz is a foreground-only API on iOS, so it reaches you while the app is open. Both fire on every work, rest and block change, and at the finish. The Lock Screen card shows the exercise and the countdown without unlocking.")
                }

                Section {
                    Toggle("Apple Health", isOn: $health)
                    if let healthError {
                        Text(healthError).font(.footnote).foregroundStyle(.red)
                    }
                } header: {
                    Text("Health")
                } footer: {
                    Text("Saves each workout to Health so it counts towards your rings, and reads back your bodyweight and your heart rate over the session — which turns the calorie figure from an estimate into a measurement.")
                }

                Section {
                    Stepper(
                        value: Binding(
                            get: { store.bodyweightKg ?? EffortModel.defaultBodyweightKg },
                            set: { kg in Task { await store.setBodyweight(kg) } }
                        ),
                        in: 35...200,
                        step: 0.5
                    ) {
                        LabeledContent("Bodyweight", value: "\(Format.number(store.bodyweightKg ?? EffortModel.defaultBodyweightKg)) kg")
                    }
                } header: {
                    Text("You")
                } footer: {
                    Text("Calories after a workout are a METs estimate built from time, effort type and this number. Without a heart rate it is a scale to beat, not a measurement.")
                }

                Section {
                    LabeledContent("Workouts bundled", value: "\(store.catalogue.count)")
                    LabeledContent("Sessions logged", value: "\(store.results.count)")
                }
            }
            .navigationTitle("Me")
            .sheet(isPresented: $signingIn) {
                SignInView { await store.sync() }
            }
            .onChange(of: haptics, initial: true) { _, on in Haptics.shared.enabled = on }
            .onChange(of: sound, initial: true) { _, on in Cues.shared.enabled = on }
            .onChange(of: liveActivity, initial: true) { _, on in SessionActivityController.shared.enabled = on }
            .onChange(of: health) { _, on in
                guard on else { return }
                Task {
                    do {
                        try await Health.shared.requestAuthorisation()
                        healthError = nil
                        await store.readBodyweightFromHealth()
                    } catch {
                        // Turn the switch back rather than leave it claiming something untrue.
                        health = false
                        healthError = error.localizedDescription
                    }
                }
            }
        }
    }
}
