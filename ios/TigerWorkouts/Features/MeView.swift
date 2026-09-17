import SwiftUI

struct MeView: View {
    @Environment(Store.self) private var store
    @AppStorage("haptics") private var haptics = true
    @AppStorage("sound") private var sound = true
    @State private var signingIn = false

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
                } header: {
                    Text("In the gym")
                } footer: {
                    Text("Tones carry when the screen has locked; the buzz is a foreground-only API on iOS, so it reaches you while the app is open. Both fire on every work, rest and block change, and at the finish.")
                }

                Section {
                    Stepper(
                        value: Binding(get: { store.bodyweightKg ?? EffortModel.defaultBodyweightKg }, set: { store.bodyweightKg = $0 }),
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
                    LabeledContent("Workouts bundled", value: "\(Library.shared.workouts.count)")
                    LabeledContent("Sessions logged", value: "\(store.results.count)")
                }
            }
            .navigationTitle("Me")
            .sheet(isPresented: $signingIn) {
                SignInView { await store.sync() }
            }
            .onChange(of: haptics, initial: true) { _, on in Haptics.shared.enabled = on }
            .onChange(of: sound, initial: true) { _, on in Cues.shared.enabled = on }
        }
    }
}
