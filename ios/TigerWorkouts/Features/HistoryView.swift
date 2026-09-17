import SwiftUI

struct HistoryView: View {
    @Environment(Store.self) private var store

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
                    ContentUnavailableView(
                        store.signedIn ? "No sessions yet" : "Sign in to see your history",
                        systemImage: "clock.arrow.circlepath",
                        description: Text(store.signedIn
                            ? "Finish a workout and it lands here."
                            : "Your workouts sync with the same account as tigerworkouts.com.")
                    )
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
        .padding(.vertical, 2)
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
