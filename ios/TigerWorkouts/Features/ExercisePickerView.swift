import SwiftUI

/// The library, searchable, grouped by what you'd walk to in the gym. Your own exercises sit in
/// their groups beside the bundled ones; one that is missing is a "New exercise" away.
struct ExercisePickerView: View {
    var onPick: (LibraryExercise) -> Void

    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var creating = false

    private var groups: [(group: ExerciseGroup, exercises: [LibraryExercise])] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        // Read through the store so adding one redraws the list; the library holds them all.
        _ = store.customExercises.count
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

    private func pick(_ exercise: LibraryExercise) {
        onPick(exercise)
        dismiss()
    }

    var body: some View {
        NavigationStack {
            List {
                let typed = query.trimmingCharacters(in: .whitespaces)
                if !typed.isEmpty {
                    Section {
                        Button {
                            creating = true
                        } label: {
                            Label("Add “\(typed)” as a new exercise", systemImage: "plus.circle.fill")
                                .foregroundStyle(Brand.coral)
                                .frame(minHeight: 44)
                        }
                        .accessibilityIdentifier("add-new-exercise")
                    }
                }
                ForEach(groups, id: \.group) { section in
                    Section(label(section.group)) {
                        ForEach(section.exercises) { exercise in
                            Button {
                                pick(exercise)
                            } label: {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(exercise.name).foregroundStyle(Brand.ink)
                                    let detail = [exercise.isCustom ? "yours" : nil, exercise.unit.isEmpty ? nil : exercise.unit].compactMap { $0 }
                                    if !detail.isEmpty {
                                        Text(detail.joined(separator: " · ")).font(.caption).foregroundStyle(Brand.muted)
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
                ToolbarItem(placement: .primaryAction) {
                    Button("New") { creating = true }
                        .accessibilityLabel("New exercise")
                }
            }
            .navigationDestination(isPresented: $creating) {
                NewExerciseView(name: query.trimmingCharacters(in: .whitespaces)) { exercise in
                    Task { await store.addExercise(exercise) }
                    pick(exercise)
                }
            }
        }
    }
}

/// Name, equipment group, unit and load step: what the timer, the logbook and Health need to
/// treat it like any bundled exercise. Saved on the phone and synced like the web's.
struct NewExerciseView: View {
    var onSave: (LibraryExercise) -> Void

    @State private var name: String
    @State private var group: ExerciseGroup = .body
    @State private var unit = "kg"
    @State private var step = LibraryExercise.defaultStep(unit: "kg")

    init(name: String = "", onSave: @escaping (LibraryExercise) -> Void) {
        self.onSave = onSave
        _name = State(initialValue: name)
    }

    private var trimmed: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }

    private func label(_ group: ExerciseGroup) -> String {
        Library.shared.groupLabels[group.rawValue] ?? group.rawValue.capitalized
    }

    var body: some View {
        Form {
            Section {
                TextField("Name", text: $name)
                    .textInputAutocapitalization(.sentences)
                    .accessibilityIdentifier("new-exercise-name")
            }
            Section {
                Picker("Equipment", selection: $group) {
                    ForEach(ExerciseGroup.allCases.sorted { label($0) < label($1) }, id: \.self) { g in
                        Text(label(g)).tag(g)
                    }
                }
                Picker("Unit", selection: $unit) {
                    ForEach(LibraryExercise.customUnits, id: \.value) { u in
                        Text(u.label).tag(u.value)
                    }
                }
                if !unit.isEmpty {
                    Stepper(value: $step, in: 0.25...20, step: unit == "kph" ? 0.5 : 0.25) {
                        LabeledContent("Load step", value: "\(step.formatted()) \(unit == "kph" ? "kph" : "kg")")
                    }
                }
            } footer: {
                Text("The group decides the calorie estimate and the Apple Health workout type. The step is how much a tap on + adds.")
            }
            Section {
                Button("Add and use") {
                    var e = LibraryExercise.custom(name: trimmed, unit: unit, group: group)
                    e.step = unit.isEmpty ? 1 : step
                    onSave(e)
                }
                .disabled(trimmed.isEmpty)
                .accessibilityIdentifier("save-new-exercise")
            }
        }
        .navigationTitle("New exercise")
        .navigationBarTitleDisplayMode(.inline)
        .onChange(of: unit) { _, u in step = LibraryExercise.defaultStep(unit: u) }
    }
}
