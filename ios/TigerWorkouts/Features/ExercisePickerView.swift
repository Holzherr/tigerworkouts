import SwiftUI

/// The library, searchable, grouped by what you'd walk to in the gym.
struct ExercisePickerView: View {
    var onPick: (LibraryExercise) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var query = ""

    private var groups: [(group: ExerciseGroup, exercises: [LibraryExercise])] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        let all = Library.shared.exercises.values.filter { exercise in
            q.isEmpty || exercise.name.lowercased().contains(q) || exercise.key.lowercased().contains(q)
        }
        return Dictionary(grouping: all, by: \.group)
            .map { (group: $0.key, exercises: $0.value.sorted { $0.name < $1.name }) }
            .sorted { label($0.group) < label($1.group) }
    }

    private func label(_ group: ExerciseGroup) -> String {
        Library.shared.groupLabels[group.rawValue] ?? group.rawValue.capitalized
    }

    var body: some View {
        NavigationStack {
            List {
                ForEach(groups, id: \.group) { section in
                    Section(label(section.group)) {
                        ForEach(section.exercises) { exercise in
                            Button {
                                onPick(exercise)
                                dismiss()
                            } label: {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(exercise.name).foregroundStyle(Brand.ink)
                                    if !exercise.unit.isEmpty {
                                        Text(exercise.unit).font(.caption).foregroundStyle(Brand.muted)
                                    }
                                }
                                .frame(minHeight: 44)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .searchable(text: $query, prompt: "Exercise")
            .navigationTitle("Add exercise")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
        }
    }
}
