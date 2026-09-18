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
                Section {
                    if let user = store.user {
                        HStack(spacing: 14) {
                            Text(initials(user.email))
                                .font(.system(size: 20, weight: .heavy, design: .rounded))
                                .foregroundStyle(.white)
                                .frame(width: 52, height: 52)
                                .background(Brand.coral, in: Circle())
                            VStack(alignment: .leading, spacing: 2) {
                                Text(user.email ?? "Signed in").font(.headline).foregroundStyle(Brand.ink)
                                Text(store.syncing ? "Syncing…" : "\(store.results.count) session\(store.results.count == 1 ? "" : "s") · synced with tigerworkouts.com")
                                    .font(.footnote)
                                    .foregroundStyle(Brand.muted)
                            }
                        }
                        .padding(.vertical, 4)
                        Button("Sync now") { Task { await store.sync() } }
                            .disabled(store.syncing)
                        Button("Sign out", role: .destructive) { Task { await store.signOut() } }
                    } else {
                        VStack(alignment: .leading, spacing: 12) {
                            HStack(spacing: 12) {
                                Stripes().frame(width: 30, height: 26)
                                Text("Sign in to sync").font(.headline).foregroundStyle(Brand.ink)
                            }
                            Text("Same account as tigerworkouts.com, so your workouts and history are one list on both.")
                                .font(.footnote)
                                .foregroundStyle(Brand.muted)
                            Button("Sign in") { signingIn = true }
                                .buttonStyle(BigButtonStyle())
                        }
                        .padding(.vertical, 6)
                    }
                }

                Section {
                    Toggle("Buzz on every change", isOn: $haptics)
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
                        Text(healthError).font(.footnote).foregroundStyle(.red)
                    }
                } header: {
                    Text("Health")
                } footer: {
                    Text("Workouts count towards your rings, and your heart rate turns the calorie estimate into a measurement.")
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
                    Text("Used for the calorie estimate after a workout.")
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
            .scrollContentBackground(.hidden)
            .background(Brand.canvas)
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

    private func initials(_ email: String?) -> String {
        guard let email, let first = email.first else { return "?" }
        return String(first).uppercased()
    }
}
