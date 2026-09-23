import SwiftUI

struct HistoryView: View {
    @Environment(Store.self) private var store
    @State private var signingIn = false

    private var months: [(label: String, sessions: [SessionResult])] {
        let f = DateFormatter()
        f.dateFormat = "MMMM yyyy"
        let grouped = Dictionary(grouping: store.results.sorted { $0.startedAt > $1.startedAt }) {
            f.string(from: $0.startedDate)
        }
        return grouped
            .sorted { ($0.value.first?.startedAt ?? "") > ($1.value.first?.startedAt ?? "") }
            .map { (label: $0.key, sessions: $0.value) }
    }

    var body: some View {
        NavigationStack {
            Group {
                if store.results.isEmpty {
                    VStack(spacing: 18) {
                        Spacer()
                        Image(systemName: store.signedIn ? "figure.strengthtraining.functional" : "clock.arrow.circlepath")
                            .font(.system(size: 44, weight: .semibold))
                            .foregroundStyle(Brand.coral)
                            .frame(width: 96, height: 96)
                            .background(Brand.coralSoft, in: Circle())
                        Text(store.signedIn ? "No sessions yet" : "Your history lives in your account")
                            .font(.title2.weight(.heavy))
                            .foregroundStyle(Brand.ink)
                            .multilineTextAlignment(.center)
                        Text(store.signedIn
                             ? "Finish a workout and it lands here, with what you lifted and what you worked."
                             : "Sign in and every session you've logged — here or on tigerworkouts.com — shows up.")
                            .font(.callout)
                            .foregroundStyle(Brand.muted)
                            .multilineTextAlignment(.center)
                        if !store.signedIn {
                            Button("Sign in") { signingIn = true }
                                .buttonStyle(BigButtonStyle())
                                .padding(.top, 6)
                        }
                        Spacer()
                        Spacer()
                    }
                    .padding(.horizontal, 32)
                    .frame(maxWidth: .infinity)
                    .background(Brand.canvas)
                } else {
                    List {
                        ForEach(months, id: \.label) { month in
                            Section(month.label) {
                                ForEach(month.sessions) { session in
                                    NavigationLink {
                                        SessionDetailView(result: session)
                                    } label: {
                                        row(session)
                                    }
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("History")
            .sheet(isPresented: $signingIn) {
                SignInView { await store.sync() }
            }
            .refreshable { await store.sync() }
            .overlay(alignment: .bottom) {
                if let error = store.syncError {
                    Text(error)
                        .font(.caption)
                        .padding(10)
                        .background(.thinMaterial, in: Capsule())
                        .padding(.bottom, 8)
                }
            }
        }
    }

    private func row(_ s: SessionResult) -> some View {
        HStack(spacing: 14) {
            // A session whose workout is gone still gets its own colours, from its title.
            WorkoutIcon(runsheet: store.workout(id: s.runsheetId) ?? Runsheet(id: s.runsheetId, title: s.displayTitle), size: 44)
            VStack(alignment: .leading, spacing: 4) {
                Text(s.displayTitle).font(.headline).foregroundStyle(Brand.ink)
                HStack(spacing: 8) {
                    Text(s.startedDate.formatted(date: .abbreviated, time: .shortened))
                    if let d = s.durationSec, d > 0 { Text("· \(Format.duration(d))") }
                    if s.completed == false { Text("· part done") }
                }
                .font(.footnote)
                .foregroundStyle(Brand.muted)
            }
        }
        .padding(.vertical, 4)
    }
}

struct SessionDetailView: View {
    @Environment(Store.self) private var store
    let result: SessionResult

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                SessionStatsView(
                    result: result,
                    runsheet: store.workout(id: result.runsheetId),
                    history: store.results,
                    bodyweightKg: store.bodyweightKg
                )

                if !result.steps.isEmpty {
                    VStack(alignment: .leading, spacing: 0) {
                        Text("Logged").font(.headline).padding(14)
                        ForEach(result.steps) { step in
                            Divider().padding(.leading, 14)
                            HStack {
                                Text(Library.shared.name(step.exerciseKey)).foregroundStyle(Brand.ink)
                                Spacer()
                                Text(detail(step)).font(.footnote).foregroundStyle(Brand.muted)
                            }
                            .padding(14)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .cardSurface()
                }
            }
            .padding(16)
        }
        .background(Brand.canvas)
        .navigationTitle(result.displayTitle)
        .navigationBarTitleDisplayMode(.inline)
    }

    private func detail(_ s: StepResult) -> String {
        var parts: [String] = []
        if let t = s.target {
            let unit = Library.shared.exercise(s.exerciseKey)?.unit ?? ""
            parts.append(unit.isEmpty ? Format.number(t) : "\(Format.number(t)) \(unit.replacingOccurrences(of: " per arm", with: ""))")
        }
        if let i = s.incline { parts.append("\(Format.number(i))% incline") }
        if let reps = s.reps, !reps.isEmpty {
            parts.append(reps.count > 1 ? "\(reps.count) sets" : "\(Format.number(reps[0])) reps")
        }
        return parts.joined(separator: " · ")
    }
}
