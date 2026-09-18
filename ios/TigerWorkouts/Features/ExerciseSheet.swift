import SwiftUI

/// One exercise, read and changed in the same place. The steppers appear because the host passed
/// a binding — a screen that only shows an exercise passes none and gets the read-only version,
/// so there is never an edit mode to find.
struct ExerciseSheet: View {
    let step: ExerciseStep
    var target: Binding<Double?>?
    var incline: Binding<Double?>?
    /// Shown mid-session: a change from here applies to this round and every one after it.
    var appliesFromHere = false
    var onDrop: (() -> Void)?
    var dropLabel = "Drop for the rest of the session"

    @Environment(\.dismiss) private var dismiss

    private var unit: String { step.shortUnit }
    private var increment: Double { step.exercise.step == 0 ? 1 : step.exercise.step }
    private var showsIncline: Bool {
        incline != nil && (step.incline != nil || Library.shared.group(step.exercise.key).map { [.treadmill, .walk, .run].contains($0) } ?? false)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(step.forLabel)
                            .font(.caption.weight(.semibold))
                            .textCase(.uppercase)
                            .tracking(0.6)
                            .foregroundStyle(Brand.coralInk)
                        if let cue = step.exercise.cue ?? Library.shared.exercise(step.exercise.key)?.cue, !cue.isEmpty {
                            Text(cue).font(.callout).foregroundStyle(Brand.body)
                        }
                    }

                    if let target, step.hasSetting {
                        stepper(title: step.settingLabel, unit: unit, value: target, by: increment)
                    }
                    if showsIncline, let incline {
                        stepper(title: "Incline", unit: "%", value: incline, by: 0.5)
                    }

                    if appliesFromHere, target != nil {
                        Label("Applies from here to the end of the session", systemImage: "arrow.right.circle")
                            .font(.footnote)
                            .foregroundStyle(Brand.muted)
                    }

                    if let onDrop {
                        Button(role: .destructive) {
                            onDrop()
                            dismiss()
                        } label: {
                            Text(dropLabel)
                        }
                        .buttonStyle(BigButtonStyle(tint: .red, filled: false))
                    }
                }
                .padding(20)
            }
            .background(Brand.canvas)
            .navigationTitle(step.exercise.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private func stepper(title: String, unit: String, value: Binding<Double?>, by amount: Double) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(Brand.body)
            HStack(spacing: 14) {
                nudge("minus", enabled: (value.wrappedValue ?? 0) > 0) {
                    value.wrappedValue = max(0, (value.wrappedValue ?? amount) - amount)
                }
                VStack(spacing: 0) {
                    Text(value.wrappedValue.map(Format.number) ?? "—")
                        .font(.system(size: 34, weight: .semibold, design: .rounded))
                        .monospacedDigit()
                    Text(unit).font(.caption).foregroundStyle(Brand.muted)
                }
                .frame(maxWidth: .infinity)
                nudge("plus", enabled: true) {
                    value.wrappedValue = (value.wrappedValue ?? 0) + amount
                }
            }
        }
        .padding(16)
        .cardSurface()
    }

    private func nudge(_ symbol: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button {
            action()
            Haptics.shared.play(.tick)
        } label: {
            Image(systemName: symbol)
                .font(.system(size: 22, weight: .bold))
                .frame(width: Tap.big, height: Tap.big)
                .background(Brand.coralSoft, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .foregroundStyle(Brand.coralInk)
        }
        .disabled(!enabled)
        .opacity(enabled ? 1 : 0.4)
    }
}
