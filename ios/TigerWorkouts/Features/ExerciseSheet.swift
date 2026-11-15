import SwiftUI

/// One exercise, read and changed in the same place. The steppers appear because the host passed
/// a binding — a screen that only shows an exercise passes none and gets the read-only version,
/// so there is never an edit mode to find.
struct ExerciseSheet: View {
    let step: ExerciseStep
    /// The workout it is in, so last time reads this step's own sets first.
    var workout: Runsheet? = nil
    /// Each set as it stands, when the host knows them better than the plan (the timer's rows).
    var sets: [SetLine]? = nil
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
    @Environment(Store.self) private var store
    @State private var entry: NumberEntryRequest?
    /// The steps picked for this exercise (`StepSizes`), read once and kept as they change here.
    @State private var loadStep: Double?
    @State private var meterStep: Double?

    /// One set of the step: its type, load and count (reps, metres, seconds).
    struct SetLine: Hashable {
        var type: SetType = .normal
        var load: Double?
        var count: Double
    }

    /// Every set of the step, when it has more than one written out: the host's, else the plan's.
    private var setLines: [SetLine]? {
        if let sets, sets.count > 1 { return sets }
        guard let plans = step.sets, plans.count > 1 else { return nil }
        return plans.indices.map { i in
            let p = step.plannedSet(i)
            return SetLine(type: step.plannedType(i), load: p.load, count: p.reps)
        }
    }

    /// The working sets differ (a pyramid, ramping sets): one load stepper cannot say them.
    private var setsDiffer: Bool {
        let work = (setLines ?? []).filter { $0.type != .warmup && $0.type != .drop }
        guard let first = work.first else { return false }
        return work.contains { $0.load != first.load || $0.count != first.count }
    }

    private var lastTime: String? {
        LastTime.lastSessionLabel(store.results, for: step, in: workout).map { $0.prefix(1).uppercased() + $0.dropFirst() }
    }

    private var countsMeters: Bool { step.forMode == .meters || step.amountLogs.contains(.meters) }

    private var hasHistory: Bool {
        store.results.contains { $0.steps.contains { $0.exerciseKey == step.exercise.key } }
    }

    private var unit: String { step.shortUnit }
    private var increment: Double { loadStep ?? StepSizes.load(step.exercise) }
    private var alternatives: [Alternatives.Option] { Alternatives.options(for: step, kit: Equipment.current()) }

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

                    if let lastTime {
                        Text(lastTime)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Brand.coralInk)
                            .accessibilityIdentifier("sheet-last-time")
                    }

                    if let lines = setLines {
                        setList(lines)
                    }

                    if let target, step.hasSetting, !setsDiffer {
                        stepper(title: step.settingLabel, unit: unit, value: target, by: increment)
                    }

                    if step.hasSetting || countsMeters {
                        stepSizes
                    }
                    if showsIncline, let incline {
                        stepper(title: "Incline", unit: "%", value: incline, by: 0.5)
                    }

                    if hasHistory {
                        NavigationLink { ExerciseHistoryView(exerciseKey: step.exercise.key) } label: {
                            HStack {
                                Text("History").foregroundStyle(Brand.body)
                                Spacer()
                                Text("Chart and records").font(.footnote).foregroundStyle(Brand.muted)
                                Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(Brand.faint)
                            }
                            .padding(16)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .cardSurface()
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
            .numberEntry($entry)
            .onAppear {
                loadStep = StepSizes.custom(step.exercise.key, .load)
                meterStep = StepSizes.custom(step.exercise.key, .meters)
            }
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
                Button {
                    entry = NumberEntryRequest(title: title, unit: unit, current: value.wrappedValue) { value.wrappedValue = $0 }
                } label: {
                    VStack(spacing: 0) {
                        Text(value.wrappedValue.map(Format.number) ?? "—")
                            .font(.system(size: 34, weight: .semibold, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(Brand.ink)
                        Text(unit).font(.caption).foregroundStyle(Brand.muted)
                    }
                    .frame(maxWidth: .infinity, minHeight: Tap.big)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(title)
                .accessibilityValue(value.wrappedValue.map(Format.number) ?? "none")
                .accessibilityHint("Type a number")
                nudge("plus", enabled: true) {
                    value.wrappedValue = (value.wrappedValue ?? 0) + amount
                }
            }
        }
        .padding(16)
        .cardSurface()
    }

    /// "Set 1   100 kg × 8": each set on its own line, so sets that differ are never shown as one.
    private func setList(_ lines: [SetLine]) -> some View {
        let marks = SetType.marks(lines.map(\.type))
        return VStack(alignment: .leading, spacing: 8) {
            Text("Sets").font(.subheadline.weight(.semibold)).foregroundStyle(Brand.body)
            ForEach(Array(lines.enumerated()), id: \.offset) { i, line in
                HStack {
                    Text(line.type == .normal ? "Set \(marks[i])" : marks[i]).foregroundStyle(Brand.muted).frame(width: 56, alignment: .leading)
                    Text(Self.setText(line, step: step)).font(.body.weight(.semibold)).monospacedDigit().foregroundStyle(Brand.ink)
                    Spacer()
                }
            }
            if setsDiffer, target != nil {
                Text("Each set is changed on its own row.").font(.footnote).foregroundStyle(Brand.muted)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface()
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("sheet-sets")
    }

    /// "100 kg × 8", "400 m", "8 reps".
    static func setText(_ line: SetLine, step: ExerciseStep) -> String {
        let count = Format.number(line.count)
        let what: String = switch step.forMode {
        case .meters: "\(count) m"
        case .seconds: "\(count) s"
        case .minutes: "\(count) min"
        case .calories: "\(count) cal"
        default: count
        }
        guard let load = line.load, step.hasSetLoad else { return step.forMode == .reps ? "\(count) reps" : what }
        return "\(Format.number(load)) \(step.shortUnit) × \(what)".replacingOccurrences(of: "  ", with: " ")
    }

    /// What − and + move by on this exercise, everywhere: the load step and, on a distance, metres.
    private var stepSizes: some View {
        VStack(alignment: .leading, spacing: 0) {
            if step.hasSetting {
                stepMenu(title: "\(step.settingLabel) steps", unit: unit, value: increment, custom: loadStep != nil, choices: StepSizes.loadChoices) { v in
                    StepSizes.set(v, for: step.exercise.key, .load)
                    loadStep = StepSizes.custom(step.exercise.key, .load)
                }
            }
            if step.hasSetting && countsMeters { Divider().padding(.horizontal, 16) }
            if countsMeters {
                let fallback: Double = step.forMode == .meters ? 10 : max(10, step.exercise.step)
                stepMenu(title: "Distance steps", unit: "m", value: meterStep ?? fallback, custom: meterStep != nil, choices: StepSizes.meterChoices) { v in
                    StepSizes.set(v, for: step.exercise.key, .meters)
                    meterStep = StepSizes.custom(step.exercise.key, .meters)
                }
            }
        }
        .cardSurface()
        .accessibilityIdentifier("step-sizes")
    }

    private func stepMenu(title: String, unit: String, value: Double, custom: Bool, choices: [Double], set: @escaping (Double?) -> Void) -> some View {
        Menu {
            ForEach(choices, id: \.self) { c in
                Button { set(c) } label: {
                    if c == value { Label("\(StepSizes.text(c)) \(unit)", systemImage: "checkmark") } else { Text("\(StepSizes.text(c)) \(unit)") }
                }
            }
            Button("Other…") {
                entry = NumberEntryRequest(title: title, unit: unit, current: value) { set($0) }
            }
            if custom {
                Button("The exercise's own") { set(nil) }
            }
        } label: {
            HStack {
                Text(title).foregroundStyle(Brand.body)
                Spacer()
                Text("\(StepSizes.text(value)) \(unit)").font(.body.weight(.semibold)).monospacedDigit().foregroundStyle(Brand.ink)
                Image(systemName: "chevron.up.chevron.down").font(.footnote.weight(.semibold)).foregroundStyle(Brand.faint)
            }
            .padding(16)
            .contentShape(Rectangle())
        }
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
            Text("Swap exercise")
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
