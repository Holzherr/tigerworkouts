import SwiftUI

struct DiscoverView: View {
    @Environment(Store.self) private var store
    var onStart: (Runsheet) -> Void

    @State private var query = ""
    @State private var savedOnly = false

    private var shown: [Runsheet] {
        let all = savedOnly ? store.allWorkouts.filter { store.saved.contains($0.key) } : store.allWorkouts
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        guard !q.isEmpty else { return all }
        return all.filter { sheet in
            sheet.title.lowercased().contains(q)
                || (sheet.creator?.lowercased().contains(q) ?? false)
                || (sheet.tags ?? []).contains { $0.lowercased().contains(q) }
                || sheet.exerciseSteps.contains { $0.exercise.name.lowercased().contains(q) }
        }
    }

    var body: some View {
        NavigationStack {
            List {
                if !store.results.isEmpty {
                    Section {
                        ForEach(recent, id: \.key) { sheet in
                            row(sheet)
                        }
                    } header: {
                        Text("Pick up again")
                    }
                }
                Section {
                    ForEach(shown, id: \.key) { sheet in
                        row(sheet)
                    }
                } header: {
                    Text(savedOnly ? "Saved" : "\(shown.count) workouts")
                }
            }
            .listStyle(.insetGrouped)
            .searchable(text: $query, prompt: "Workout, exercise or tag")
            .navigationTitle("Tiger")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        savedOnly.toggle()
                    } label: {
                        Image(systemName: savedOnly ? "bookmark.fill" : "bookmark")
                    }
                    .accessibilityLabel(savedOnly ? "Show all workouts" : "Show saved only")
                }
            }
        }
    }

    /// The four workouts done most often, so the thing you actually do is one tap from launch.
    private var recent: [Runsheet] {
        let counts = Dictionary(grouping: store.results, by: \.runsheetId).mapValues(\.count)
        return counts.sorted { $0.value > $1.value }
            .prefix(4)
            .compactMap { store.workout(id: $0.key) }
    }

    private func row(_ sheet: Runsheet) -> some View {
        NavigationLink {
            WorkoutDetailView(runsheet: sheet, onStart: onStart)
        } label: {
            WorkoutRow(runsheet: sheet, done: store.doneCount(sheet.key))
        }
    }
}

struct WorkoutRow: View {
    let runsheet: Runsheet
    var done: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(runsheet.title)
                .font(.headline)
                .foregroundStyle(Brand.ink)
            HStack(spacing: 8) {
                Label("\(runsheet.minutes) min", systemImage: "clock")
                if let creator = runsheet.creator { Text("· \(creator)") }
                if let level = runsheet.level { Text("· \(level)") }
            }
            .font(.footnote)
            .foregroundStyle(Brand.muted)

            if done > 0 {
                Text("done \(done)×")
                    .font(.caption.weight(.semibold))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Brand.coralSoft, in: Capsule())
                    .foregroundStyle(Brand.coralInk)
            }
        }
        .padding(.vertical, 4)
    }
}
