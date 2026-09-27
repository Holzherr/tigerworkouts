import SwiftUI

/// A straight-set block (one exercise, rounds) in the editor: one row per set with its own load and
/// reps, so a pyramid or ramping sets are written as they are done. Add set copies the last row;
/// Remove set drops it. Both change how many times the block repeats.
struct SetPlanGrid: View {
    var block: Block
    var step: ExerciseStep
    var locked = false
    /// Grey line under a set, e.g. last time's set of the same number.
    var hint: (Int) -> String? = { _ in nil }
    var apply: (_ change: (Runsheet) -> Runsheet) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                Text("Set").frame(width: 36, alignment: .leading)
                if step.hasSetLoad { Text(step.shortUnit).frame(maxWidth: .infinity) }
                if let count = step.countLabel { Text(count).frame(maxWidth: .infinity) }
            }
            .font(.caption.weight(.bold))
            .textCase(.uppercase)
            .tracking(0.8)
            .foregroundStyle(Brand.muted)
            .padding(.bottom, 4)

            ForEach(0..<block.repeatCount, id: \.self) { round in
                let planned = step.plannedSet(round)
                Divider()
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 8) {
                        Text("\(round + 1)")
                            .font(.body.weight(.heavy))
                            .monospacedDigit()
                            .foregroundStyle(Brand.ink)
                            .frame(width: 36, alignment: .leading)
                        if step.hasSetLoad {
                            MiniStepper(value: planned.load ?? 0, label: "Set \(round + 1) load", disabled: locked) { direction in
                                let next = max(0, (planned.load ?? 0) + direction * (step.exercise.step == 0 ? 1 : step.exercise.step))
                                apply { Edit.editSet($0, block: block.id, round: round, load: next) }
                            }
                            .frame(maxWidth: .infinity)
                        }
                        if let count = step.countLabel {
                            MiniStepper(value: planned.reps, label: "Set \(round + 1) \(count.lowercased())", disabled: locked) { direction in
                                let next = max(1, planned.reps + direction)
                                apply { Edit.editSet($0, block: block.id, round: round, reps: next) }
                            }
                            .frame(maxWidth: .infinity)
                        }
                    }
                    if let hint = hint(round) {
                        Text(hint).font(.caption).foregroundStyle(Brand.muted).padding(.leading, 44)
                    }
                }
                .padding(.vertical, 6)
            }

            if !locked {
                Divider()
                HStack(spacing: 20) {
                    Button { apply { Edit.addSet($0, block: block.id) } } label: {
                        Label("Add set", systemImage: "plus")
                    }
                    Button { apply { Edit.removeSet($0, block: block.id) } } label: {
                        Label("Remove set", systemImage: "minus")
                    }
                    .disabled(block.repeatCount <= 1)
                    Spacer()
                }
                .padding(.top, 10)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("set-grid")
    }
}

/// Minus, the number, plus, small enough that two sit side by side on a set row.
struct MiniStepper: View {
    var value: Double
    var label: String
    var disabled = false
    /// On a coral-tinted row the buttons go white, or they vanish into it.
    var onTint = false
    var nudge: (Double) -> Void

    var body: some View {
        HStack(spacing: 0) {
            button("minus", "\(label), less") { nudge(-1) }
            Text(Format.number(value))
                .font(.system(size: 18, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(Brand.ink)
                .frame(minWidth: 48)
                .accessibilityLabel(label)
                .accessibilityValue(Format.number(value))
            button("plus", "\(label), more") { nudge(1) }
        }
        .opacity(disabled ? 0.5 : 1)
        .disabled(disabled)
    }

    private func button(_ symbol: String, _ label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 14, weight: .bold))
                .frame(width: 38, height: 38)
                .background(onTint ? Brand.surface : Brand.coralSoft, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(onTint ? Brand.brandLine : .clear))
                .foregroundStyle(Brand.coralInk)
        }
        .buttonStyle(.borderless)
        .accessibilityLabel(label)
    }
}
