import SwiftUI

/// A straight-set block (one exercise, rounds) in the editor: sets alike in a row fold into one row
/// (`8×`) whose steppers change them all; Vary sets gives each set its own load and
/// reps, so a pyramid or ramping sets are written as they are done. The set number is a button
/// that steps the set through warm-up (W), normal, drop set (D) and to failure (F). The Sets stepper
/// under the grid copies the last row or drops it, changing how many times the block repeats.
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

    @State private var varying = false
    @State private var entry: NumberEntryRequest?

    private var marks: [String] { SetType.marks((0..<block.repeatCount).map { step.plannedType($0) }) }

    /// One row per run of alike sets, or one per set while varying.
    private var runs: [Edit.SetRun] {
        guard varying else { return Edit.setRuns(block) }
        return (0..<block.repeatCount).map { round in
            let p = step.plannedSet(round)
            return Edit.SetRun(from: round, count: 1, type: step.plannedType(round), reps: p.reps, load: p.load)
        }
    }

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
                            MiniStepper(value: incline.wrappedValue ?? 0, label: "Incline", neutral: true) { presses in
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
                if step.hasSetLoad { Text(step.shownUnit).frame(maxWidth: .infinity) }
                if let count = step.countLabel { Text(count).frame(maxWidth: .infinity) }
            }
            .font(.caption.weight(.bold))
            .textCase(.uppercase)
            .tracking(0.8)
            .foregroundStyle(Brand.muted)
            .padding(.bottom, 4)

            ForEach(runs, id: \.from) { run in
                let round = run.from
                let label = run.count > 1 ? "Sets \(round + 1) to \(round + run.count)" : "Set \(round + 1)"
                Divider()
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 8) {
                        SetMarkButton(mark: run.count > 1 ? "\(run.count)×" : marks[round], type: run.type, label: label, cycle: locked ? nil : {
                            apply { Edit.editRun($0, block: block.id, run: run, type: run.type.next) }
                        })
                        .frame(width: 36, alignment: .leading)
                        if step.hasSetLoad {
                            if Plates.kit(step.exercise) == .barbell { PlatesButton(load: run.load) }
                            MiniStepper(value: run.load ?? 0, label: "\(label) load", unit: step.shortUnit, disabled: locked, neutral: true, onTapValue: locked ? nil : {
                                entry = NumberEntryRequest(title: "\(label) \(step.settingLabel.lowercased())", unit: step.shortUnit, current: run.load) { v in
                                    apply { Edit.editRun($0, block: block.id, run: run, load: v) }
                                }
                            }) { direction in
                                // Read from the sheet as it is now: a held button fires many times
                                // before this view is drawn again.
                                apply { r in
                                    let now = r.exerciseSteps.first { $0.id == step.id }?.plannedSet(round).load ?? run.load
                                    let next = Units.stepped(now ?? 0, by: direction, step: StepSizes.load(step.exercise), unit: step.shortUnit)
                                    return Edit.editRun(r, block: block.id, run: run, load: next)
                                }
                            }
                            .frame(maxWidth: .infinity)
                        }
                        if let count = step.countLabel {
                            MiniStepper(value: run.reps, label: "\(label) \(count.lowercased())", disabled: locked, neutral: true, onTapValue: locked ? nil : {
                                entry = NumberEntryRequest(title: "\(label) \(count.lowercased())", unit: step.forMode == .meters ? "m" : count.lowercased(), current: run.reps) { v in
                                    apply { Edit.editRun($0, block: block.id, run: run, reps: max(1, step.forMode == .reps ? v.rounded() : v)) }
                                }
                            }) { direction in
                                apply { r in
                                    let now = r.exerciseSteps.first { $0.id == step.id }?.plannedSet(round).reps ?? run.reps
                                    return Edit.editRun(r, block: block.id, run: run, reps: max(1, now + direction * (step.forMode == .meters ? StepSizes.meters(step.exercise, fallback: 10) : 1)))
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
                // How many sets is one stepper, not an Add set and a Remove set that wrapped onto
                // two lines each (Nick, 1 Nov 2026).
                HStack(spacing: 10) {
                    Text("Sets").font(.subheadline.weight(.semibold)).foregroundStyle(Brand.body)
                    MiniStepper(value: Double(block.repeatCount), label: "Sets", neutral: true) { direction in
                        apply { r in
                            let now = r.items.compactMap(\.asBlock).first { $0.id == block.id }?.repeatCount ?? block.repeatCount
                            let steps = Int(abs(direction))
                            if direction > 0 { return (0..<steps).reduce(r) { r, _ in Edit.addSet(r, block: block.id) } }
                            return (0..<min(steps, now - 1)).reduce(r) { r, _ in Edit.removeSet(r, block: block.id) }
                        }
                    }
                    .fixedSize()
                    Spacer(minLength: 8)
                    if !varying, block.repeatCount > 1 {
                        Button("Vary sets") { varying = true }
                            .font(.subheadline.weight(.semibold))
                            .lineLimit(1)
                    }
                }
                .padding(.vertical, 8)
            }
        }
        // Back to folded rows once an edit leaves every set alike.
        .onChange(of: Edit.setRuns(block).count) { _, count in if count == 1 { varying = false } }
        .numberEntry($entry)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("set-grid")
    }
}

/// Minus, the number, plus, small enough that two sit side by side on a set row with a tick, on a
/// 390 pt phone. Each button keeps a 44 pt tap target around a narrower chip; a long number
/// shrinks before it pushes the row wider. Narrower still (a 375 pt phone), the targets stay 44 pt
/// and reach 6 pt over the number between them, rather than drop to 38 pt or overflow the screen.
struct MiniStepper: View {
    /// As stored; a weight shows in lb when weights do (U11).
    var value: Double
    var label: String
    /// The stored unit of `value` ("kg", "kph"); empty for a count.
    var unit = ""
    var disabled = false
    /// On a coral-tinted row the buttons go white, or they vanish into it.
    var onTint = false
    /// Grey buttons, for the workout page: coral there is Start alone (review D8, 15 Nov 2026).
    var neutral = false
    /// A tap on the number, to type one in (`NumberEntryRequest`); nil leaves it a label.
    var onTapValue: (() -> Void)? = nil
    var nudge: (Double) -> Void

    var body: some View {
        ViewThatFits(in: .horizontal) {
            stepper(overlap: 0)
            stepper(overlap: 6)
        }
        .opacity(disabled ? 0.5 : 1)
        .disabled(disabled)
    }

    private func stepper(overlap: CGFloat) -> some View {
        HStack(spacing: -overlap) {
            button("minus", "\(label), less", edge: overlap > 0 ? .leading : .center) { nudge(-$0) }
            number
            button("plus", "\(label), more", edge: overlap > 0 ? .trailing : .center) { nudge($0) }
        }
    }

    @ViewBuilder
    private var number: some View {
        let text = Text(shownValue)
            .scaledFont(18, weight: .bold, design: .rounded, relativeTo: .body)
            .monospacedDigit()
            .foregroundStyle(Brand.ink)
            .lineLimit(1)
            .minimumScaleFactor(0.5)
            // The ideal width is fixed so a long number never makes ViewThatFits drop to the
            // small targets; it shrinks the text instead.
            .frame(minWidth: 28, idealWidth: 28, maxWidth: 56)
        if let onTapValue {
            Button(action: onTapValue) {
                text.frame(minHeight: 44).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(label)
            .accessibilityValue(shownValue)
            .accessibilityHint("Type a number")
        } else {
            text
                .accessibilityLabel(label)
                .accessibilityValue(shownValue)
        }
    }

    private var shownValue: String { Units.number(value, unit: unit) }

    /// Held, it repeats and the steps grow; `action` gets 1, 2 or 5.
    private func button(_ symbol: String, _ label: String, edge: Alignment, action: @escaping (Double) -> Void) -> some View {
        RepeatButton(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 14, weight: .bold))
                .frame(width: 36, height: 38)
                .background(neutral ? Brand.well : onTint ? Brand.surface : Brand.coralSoft, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(onTint && !neutral ? Brand.brandLine : .clear))
                .foregroundStyle(neutral ? Brand.body : Brand.coralInk)
                .frame(width: 44, height: 44, alignment: edge)
                .contentShape(Rectangle())
        }
        .accessibilityLabel(label)
    }
}
