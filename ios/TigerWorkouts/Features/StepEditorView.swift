import SwiftUI

/// One step of a workout being written, as opposed to `ExerciseSheet`, which is one step being
/// read or adjusted during a session. This is where "30 seconds" becomes "12 reps each side".
struct StepEditorView: View {
    @State var step: ExerciseStep
    var onChange: (ExerciseStep) -> Void
    var onRemove: () -> Void

    @Environment(\.dismiss) private var dismiss

    private var unit: String { step.shortUnit }
    private var increment: Double { step.exercise.step == 0 ? 1 : step.exercise.step }
    private var showsIncline: Bool {
        Library.shared.group(step.exercise.key).map { [.treadmill, .walk, .run].contains($0) } ?? false
    }

    private var countLabel: String {
        switch step.forMode {
        case .seconds: "Seconds"
        case .minutes: "Minutes"
        case .reps, .amrap: "Reps"
        case .meters: "Metres"
        case .calories: "Calories"
        case .max, .segment: ""
        }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Measured in", selection: $step.forMode) {
                        Text("Seconds").tag(ForMode.seconds)
                        Text("Reps").tag(ForMode.reps)
                        Text("Minutes").tag(ForMode.minutes)
                        Text("Max reps").tag(ForMode.max)
                        Text("Metres").tag(ForMode.meters)
                        Text("Calories").tag(ForMode.calories)
                    }
                    if !countLabel.isEmpty {
                        Stepper(value: $step.forValue, in: 1...3_600, step: stepSize) {
                            LabeledContent(countLabel, value: Format.number(step.forValue))
                        }
                    }
                    Toggle("Each side", isOn: Binding(get: { step.perSide ?? false }, set: { step.perSide = $0 ? true : nil }))
                } header: {
                    Text(step.exercise.name)
                } footer: {
                    if let cue = Library.shared.exercise(step.exercise.key)?.cue, !cue.isEmpty {
                        Text(cue)
                    }
                }

                if !unit.isEmpty {
                    Section(unit == "kph" ? "Speed" : "Load") {
                        Stepper(value: Binding(get: { step.target ?? 0 }, set: { step.target = $0 }), in: 0...500, step: increment) {
                            LabeledContent(unit == "kph" ? "Speed" : "Weight", value: step.target.map { "\(Format.number($0)) \(unit)" } ?? "—")
                        }
                    }
                }

                if showsIncline {
                    Section("Incline") {
                        Stepper(value: Binding(get: { step.incline ?? 0 }, set: { step.incline = $0 == 0 ? nil : $0 }), in: 0...30, step: 0.5) {
                            LabeledContent("Incline", value: step.incline.map { "\(Format.number($0))%" } ?? "—")
                        }
                    }
                }

                Section {
                    Button("Remove from workout", role: .destructive) {
                        onRemove()
                        dismiss()
                    }
                }
            }
            .navigationTitle("Step")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        onChange(step)
                        dismiss()
                    }
                }
            }
            // Changing the unit of measure makes the old number meaningless: 30 seconds is a set,
            // 30 reps is a punishment.
            .onChange(of: step.forMode) { old, new in
                guard old != new else { return }
                step.forValue = defaultValue(for: new)
            }
        }
    }

    private var stepSize: Double {
        switch step.forMode {
        case .seconds: 5
        case .meters: 50
        default: 1
        }
    }

    private func defaultValue(for mode: ForMode) -> Double {
        switch mode {
        case .seconds: 30
        case .minutes: 10
        case .reps, .amrap: 12
        case .meters: 400
        case .calories: 15
        case .max, .segment: step.forValue
        }
    }
}

struct RestEditorView: View {
    @State var seconds: Double
    var onChange: (Double) -> Void
    var onRemove: () -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section("Rest") {
                    Stepper(value: $seconds, in: 5...600, step: 5) {
                        LabeledContent("Length", value: Format.clock(seconds))
                    }
                }
                Section {
                    Button("Remove from workout", role: .destructive) {
                        onRemove()
                        dismiss()
                    }
                }
            }
            .navigationTitle("Rest")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        onChange(seconds)
                        dismiss()
                    }
                }
            }
        }
    }
}
