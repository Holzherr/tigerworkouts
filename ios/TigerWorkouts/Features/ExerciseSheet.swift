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
    /// Offered when the host can act on it: swapping mid-session changes this step from here on.
    var onSwap: ((Alternatives.Option) -> Void)?
    var dropLabel = "Drop for the rest of the session"
    /// Offered where the workout itself is being edited: how long or how many.
    var onAmount: (() -> Void)?

    @Environment(\.dismiss) private var dismiss

    private var unit: String { step.shortUnit }
    private var increment: Double { step.exercise.step == 0 ? 1 : step.exercise.step }
    private var alternatives: [Alternatives.Option] { Alternatives.options(for: step) }

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

                    if let onAmount {
                        Button(action: onAmount) {
                            HStack {
                                Text("How long or how many").foregroundStyle(Brand.body)
                                Spacer()
                                Text(step.forLabel).font(.body.weight(.semibold)).monospacedDigit().foregroundStyle(Brand.ink)
                                Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(Brand.faint)
                            }
                            .padding(16)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .cardSurface()
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

                    if let onSwap, !alternatives.isEmpty {
                        SwapList(options: alternatives, onPick: { option in
                            onSwap(option)
                            dismiss()
                        })
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

/// What to do instead when the kit is taken: the same movement, other equipment, the load
/// converted into that exercise's own terms.
private struct SwapList: View {
    let options: [Alternatives.Option]
    let onPick: (Alternatives.Option) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("If it is busy")
                .font(.caption.weight(.semibold))
                .textCase(.uppercase)
                .tracking(0.6)
                .foregroundStyle(Brand.muted)
            ForEach(options) { option in
                Button { onPick(option) } label: { row(option) }
                    .buttonStyle(.plain)
            }
            Text("Swapping keeps the rounds you have already done.")
                .font(.footnote)
                .foregroundStyle(Brand.muted)
        }
    }

    private func row(_ option: Alternatives.Option) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(option.exercise.name).foregroundStyle(Brand.ink)
                Text(subtitle(option)).font(.footnote).foregroundStyle(Brand.muted)
            }
            Spacer(minLength: 8)
            Image(systemName: "arrow.left.arrow.right")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(Brand.coralInk)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Brand.line))
        .contentShape(Rectangle())
    }

    /// "45 kg · Machine" — the load in the new exercise's own terms, and where to find it.
    private func subtitle(_ option: Alternatives.Option) -> String {
        guard let target = option.target else { return option.why }
        return "\(Format.number(target)) \(option.exercise.unit) · \(option.why)"
    }
}
