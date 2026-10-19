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

                if step.hasSetting {
                    Section(step.settingLabel) {
                        Stepper(value: Binding(get: { step.target ?? 0 }, set: { step.target = $0 }), in: 0...500, step: increment) {
                            LabeledContent(step.settingLabel, value: step.target.map { "\(Format.number($0)) \(unit)" } ?? "—")
                        }
                    }
                }

                logSection

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
                // A log the new target records itself is dropped: reps counted twice is one too many.
                step.log = step.extraLogs
            }
        }
    }

    /// What to record after the step, beyond its target. Nothing by default; Add to log offers what
    /// the exercise can log and the target does not record already, one at a time, and each row it
    /// adds can be taken off again.
    @ViewBuilder private var logSection: some View {
        let choices = Self.logChoices(step).filter { !step.log.contains($0) }
        if !step.log.isEmpty || !choices.isEmpty {
            Section {
                ForEach(step.log, id: \.self) { log in
                    HStack {
                        LabeledContent("Log", value: log.label)
                        Button { step.log.removeAll { $0 == log } } label: {
                            Image(systemName: "minus.circle.fill").foregroundStyle(Brand.faint)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Stop logging \(log.label.lowercased())")
                        .accessibilityIdentifier("remove-log-\(log.rawValue)")
                    }
                }
                if !choices.isEmpty {
                    Menu {
                        ForEach(choices, id: \.self) { c in
                            Button(c.label) { step.log = StepLog.normalised(step.log + [c]) }
                        }
                    } label: {
                        Label("Add to log", systemImage: "plus")
                    }
                    .accessibilityIdentifier("add-log")
                }
            } footer: {
                if !step.log.isEmpty { Text("Asked for after each set.") }
            }
        }
    }

    /// The measures the editor offers to log: what the exercise can log, less what the target records.
    nonisolated static func logChoices(_ step: ExerciseStep) -> [StepLog] { step.logChoices }

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
