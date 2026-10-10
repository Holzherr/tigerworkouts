import SwiftUI

/// A straight-set block (one exercise, rounds) in the editor: one row per set with its own load and
/// reps, so a pyramid or ramping sets are written as they are done. The set number is a button
/// that steps the set through warm-up (W), normal, drop set (D) and to failure (F). Add set copies the last row;
/// Remove set drops it. Both change how many times the block repeats.
struct SetPlanGrid: View {
    var block: Block
    var step: ExerciseStep
    var locked = false
    /// Grey line under a set, e.g. last time's set of the same number.
    var hint: (Int) -> String? = { _ in nil }
    /// The treadmill's incline, one for the whole step, drawn as a row above the sets. Nil: no row.
    var incline: Binding<Double?>? = nil
    /// Last time's incline, grey under the row.
    var lastIncline: Double? = nil
    var apply: (_ change: (Runsheet) -> Runsheet) -> Void

    private var marks: [String] { SetType.marks((0..<block.repeatCount).map { step.plannedType($0) }) }

    /// The rule the timer's incline line uses: a step with an incline, or any treadmill, walk or run.
    nonisolated static func showsIncline(_ incline: Double?, for step: ExerciseStep) -> Bool {
        TimerView.inclineLabel(incline, for: step) != nil
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let incline, Self.showsIncline(incline.wrappedValue, for: step) {
                HStack(spacing: 8) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Incline").font(.subheadline.weight(.semibold)).foregroundStyle(Brand.body)
                        if let lastIncline {
                            Text("last time \(Format.number(lastIncline))%").font(.caption).foregroundStyle(Brand.muted)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    Group {
                        if locked {
                            Text(incline.wrappedValue.map { "\(Format.number($0))%" } ?? "—")
                                .font(.system(size: 18, weight: .bold, design: .rounded))
                                .foregroundStyle(Brand.ink)
                        } else {
                            // The binding reads the runner as it is now, so a held button keeps counting up.
                            MiniStepper(value: incline.wrappedValue ?? 0, label: "Incline") { presses in
                                incline.wrappedValue = TimerView.inclineStep(incline.wrappedValue, by: presses)
                            }
                        }
                    }
                    .frame(maxWidth: .infinity)
                }
                .padding(.bottom, 10)
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("grid-incline")
            }
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
                        SetMarkButton(mark: marks[round], type: step.plannedType(round), label: "Set \(round + 1)", cycle: locked ? nil : {
                            apply { Edit.editSet($0, block: block.id, round: round, type: step.plannedType(round).next) }
                        })
                        .frame(width: 36, alignment: .leading)
                        if step.hasSetLoad {
                            if Plates.kit(step.exercise) == .barbell { PlatesButton(load: planned.load) }
                            MiniStepper(value: planned.load ?? 0, label: "Set \(round + 1) load", disabled: locked) { direction in
                                // Read from the sheet as it is now: a held button fires many times
                                // before this view is drawn again.
                                apply { r in
                                    let now = r.exerciseSteps.first { $0.id == step.id }?.plannedSet(round) ?? planned
                                    let next = max(0, (now.load ?? 0) + direction * (step.exercise.step == 0 ? 1 : step.exercise.step))
                                    return Edit.editSet(r, block: block.id, round: round, load: next)
                                }
                            }
                            .frame(maxWidth: .infinity)
                        }
                        if let count = step.countLabel {
                            MiniStepper(value: planned.reps, label: "Set \(round + 1) \(count.lowercased())", disabled: locked) { direction in
                                apply { r in
                                    let now = r.exerciseSteps.first { $0.id == step.id }?.plannedSet(round) ?? planned
                                    return Edit.editSet(r, block: block.id, round: round, reps: max(1, now.reps + direction))
                                }
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

/// Minus, the number, plus, small enough that two sit side by side on a set row with a tick, on a
/// 390 pt phone. Each button keeps a 44 pt tap target around a narrower chip; a long number
/// shrinks before it pushes the row wider. Narrower still (a 375 pt phone), the targets drop to
/// 38 pt rather than overflow the screen.
struct MiniStepper: View {
    var value: Double
    var label: String
    var disabled = false
    /// On a coral-tinted row the buttons go white, or they vanish into it.
    var onTint = false
    var nudge: (Double) -> Void

    var body: some View {
        ViewThatFits(in: .horizontal) {
            stepper(hit: 44)
            stepper(hit: 38)
        }
        .opacity(disabled ? 0.5 : 1)
        .disabled(disabled)
    }

    private func stepper(hit: CGFloat) -> some View {
        HStack(spacing: 0) {
            button("minus", "\(label), less", hit: hit) { nudge(-$0) }
            Text(Format.number(value))
                .font(.system(size: 18, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(Brand.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
                // The ideal width is fixed so a long number never makes ViewThatFits drop to the
                // small targets; it shrinks the text instead.
                .frame(minWidth: 28, idealWidth: 28, maxWidth: 56)
                .accessibilityLabel(label)
                .accessibilityValue(Format.number(value))
            button("plus", "\(label), more", hit: hit) { nudge($0) }
        }
    }

    /// Held, it repeats and the steps grow; `action` gets 1, 2 or 5.
    private func button(_ symbol: String, _ label: String, hit: CGFloat, action: @escaping (Double) -> Void) -> some View {
        RepeatButton(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 14, weight: .bold))
                .frame(width: 36, height: 38)
                .background(onTint ? Brand.surface : Brand.coralSoft, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(onTint ? Brand.brandLine : .clear))
                .foregroundStyle(Brand.coralInk)
                .frame(width: hit, height: 44)
                .contentShape(Rectangle())
        }
        .accessibilityLabel(label)
    }
}
