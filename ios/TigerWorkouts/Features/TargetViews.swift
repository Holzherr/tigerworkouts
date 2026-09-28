import SwiftUI

/// Today's target in one line: a coral eyebrow, the aim in bold, where it came from in grey. Used on
/// the Up next card and at the top of a workout page.
struct TodayLine: View {
    var today: Targets.Today

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("Today")
                .font(.caption2.weight(.heavy))
                .textCase(.uppercase)
                .tracking(0.6)
                .foregroundStyle(Brand.coralInk)
            Text(today.text)
                .font(.subheadline.weight(.bold))
                .foregroundStyle(Brand.ink)
                .fixedSize(horizontal: false, vertical: true)
            Text(today.detail)
                .font(.footnote)
                .foregroundStyle(Brand.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("today-target")
    }
}

/// A stall, in place: how long the best has stood, and exactly two ways out. "Not now" hides it for
/// good; it comes back only as a new stall. Never a notification.
struct StallCard: View {
    var stall: Stall.Found
    /// A stall about a workout names the workout; one on an exercise page does not need to.
    var subject: String? = nil
    var onDismiss: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Stuck" + (subject.map { " · \($0)" } ?? ""))
                    .font(.caption2.weight(.heavy))
                    .textCase(.uppercase)
                    .tracking(0.6)
                    .foregroundStyle(Brand.coralInk)
                Text(stall.line)
                    .font(.headline)
                    .foregroundStyle(Brand.ink)
                Text("\(stall.sessions - 1) sessions since without a new best. Two ways out:")
                    .font(.footnote)
                    .foregroundStyle(Brand.muted)
            }
            ForEach(Array(stall.options.enumerated()), id: \.offset) { i, option in
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text("\(i + 1)")
                        .font(.footnote.weight(.heavy))
                        .foregroundStyle(Brand.coralInk)
                        .frame(width: 18)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(option.title).font(.subheadline.weight(.semibold)).foregroundStyle(Brand.ink)
                        Text(option.detail).font(.footnote).foregroundStyle(Brand.muted)
                    }
                    .fixedSize(horizontal: false, vertical: true)
                }
            }
            Button("Not now", action: onDismiss)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Brand.muted)
                .accessibilityIdentifier("stall-dismiss")
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Brand.coralSoft, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Brand.brandLine))
        .accessibilityIdentifier("stall-card")
    }
}

/// "Next time" on the finish screen: the score to aim for, or a line per exercise, read with the
/// session just done as the newest. Self-contained so any finish screen can host it; nothing shows
/// when there is nothing to suggest.
struct NextTimeView: View {
    var runsheet: Runsheet
    var result: SessionResult
    var history: [SessionResult]
    /// A program's own lines (`ProgressionRules.nextLoads`), first: "60 → 62.5 kg".
    var loads: [ProgressionRules.NextLoad] = []
    @AppStorage(Intent.storageKey) private var intent = Intent.maintain.rawValue

    var body: some View {
        let lines = Targets.nextTime(runsheet, done: result, history: history, intent: Intent(rawValue: intent) ?? .maintain, covered: loads.map(\.exerciseKey), kit: Equipment.current())
        if !lines.isEmpty || !loads.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text("Next time")
                    .font(.caption.weight(.heavy))
                    .textCase(.uppercase)
                    .tracking(0.6)
                    .foregroundStyle(Brand.coralInk)
                ForEach(loads) { n in
                    VStack(alignment: .leading, spacing: 1) {
                        HStack(alignment: .firstTextBaseline) {
                            Text(n.name).font(.subheadline.weight(.semibold)).foregroundStyle(Brand.ink).lineLimit(1)
                            Spacer(minLength: 8)
                            HStack(spacing: 4) {
                                Text(n.from.map(Format.number) ?? "?")
                                Image(systemName: "arrow.right").font(.caption2.weight(.bold)).foregroundStyle(Brand.faint)
                                Text("\(n.to.map(Format.number) ?? "?") kg")
                            }
                            .font(.subheadline.weight(n.to != n.from ? .bold : .regular))
                            .foregroundStyle(Brand.ink)
                            .monospacedDigit()
                        }
                        Text(n.reason).font(.caption).foregroundStyle(Brand.muted)
                    }
                    .accessibilityElement(children: .combine)
                }
                ForEach(lines) { line in
                    VStack(alignment: .leading, spacing: 1) {
                        HStack(alignment: .firstTextBaseline) {
                            if line.key != "score" {
                                Text(line.name).font(.subheadline.weight(.semibold)).foregroundStyle(Brand.ink).lineLimit(1)
                                Spacer(minLength: 8)
                            }
                            Text(line.text).font(.subheadline.weight(.bold)).foregroundStyle(Brand.ink).monospacedDigit()
                        }
                        Text(line.reason).font(.caption).foregroundStyle(Brand.muted)
                    }
                }
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Brand.coralSoft, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Brand.brandLine))
            .accessibilityIdentifier("next-time")
        }
    }
}

/// Made it / Missed on each exercise a program's rule reads, and the reps on its AMRAP sets: what
/// the rule makes of the session, set right before the finish screen closes (the web result
/// sheet's rows). Only exercises the session logged get a row.
struct MadeItCard: View {
    var runsheet: Runsheet
    var result: SessionResult
    var onSuccess: (_ stepId: String, Bool) -> Void
    var onReps: (_ stepId: String, _ reps: Double, _ planned: Double) -> Void

    /// The first ruled step of each exercise with a logged row; AMRAP and max steps each get one.
    static func rows(_ r: Runsheet, result: SessionResult) -> [(step: ExerciseStep, row: StepResult)] {
        var seen = Set<String>()
        return r.exerciseSteps.compactMap { s in
            guard Targets.ruled(r, s),
                  let row = result.steps.first(where: { $0.stepId == s.id && $0.exerciseKey == s.exercise.key }) ?? result.steps.first(where: { $0.stepId == s.id }) else { return nil }
            let open = s.forMode == .amrap || s.forMode == .max
            guard open || seen.insert(s.exercise.key).inserted else { return nil }
            return (s, row)
        }
    }

    var body: some View {
        let rows = Self.rows(runsheet, result: result)
        if !rows.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(rows.enumerated()), id: \.element.step.id) { i, item in
                    if i > 0 { Divider() }
                    row(item.step, item.row)
                        .padding(.vertical, 8)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 6)
            .frame(maxWidth: .infinity, alignment: .leading)
            .cardSurface()
        }
    }

    @ViewBuilder
    private func row(_ s: ExerciseStep, _ r: StepResult) -> some View {
        let open = s.forMode == .amrap || s.forMode == .max
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text(s.exercise.name).font(.subheadline.weight(.semibold)).foregroundStyle(Brand.ink).lineLimit(1)
                Spacer(minLength: 8)
                if let load = r.target, s.exercise.unit != "reps", Measure.of(s.exercise.unit) == nil {
                    Text("\(Format.number(load)) \(s.exercise.unit)").font(.footnote).foregroundStyle(Brand.muted).monospacedDigit()
                }
            }
            HStack {
                if open {
                    Text("Reps done").font(.footnote).foregroundStyle(Brand.muted)
                    Spacer()
                    MiniStepper(value: r.reps?.last ?? s.forValue, label: "Reps done") { d in
                        onReps(s.id, max(0, min(200, (r.reps?.last ?? s.forValue) + d)), s.forValue)
                    }
                } else {
                    Text("All sets done?").font(.footnote).foregroundStyle(Brand.muted)
                    Spacer()
                    chip("Made it", systemImage: "checkmark", on: r.success == true, tint: Brand.ink) { onSuccess(s.id, true) }
                    chip("Missed", systemImage: "xmark", on: r.success == false, tint: Color(light: 0xB91C1C, dark: 0xF87171)) { onSuccess(s.id, false) }
                }
            }
        }
    }

    private func chip(_ title: String, systemImage: String, on: Bool, tint: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: systemImage)
                .font(.footnote.weight(.semibold))
                .padding(.horizontal, 12)
                .frame(minHeight: 36)
                .foregroundStyle(on ? Color.white : Brand.ink)
                .background(on ? tint : Brand.lineSoft, in: Capsule())
        }
        .buttonStyle(.plain)
        .frame(minHeight: 44)
        .accessibilityAddTraits(on ? .isSelected : [])
        .accessibilityIdentifier(title == "Made it" ? "made-it-yes" : "made-it-no")
    }
}

extension Stall {
    /// The one stall worth a line on the Up next card for this workout: the workout's own, else the
    /// first of its exercises, skipping dismissed ones.
    static func forCard(_ r: Runsheet, results: [SessionResult], dismissed: Set<String> = StallDismissals.all()) -> Found? {
        if let w = workout(r, results: results), !dismissed.contains(w.id) { return w }
        var seen = Set<String>()
        for s in r.exerciseSteps where seen.insert(s.exercise.key).inserted {
            if let x = exercise(results, key: s.exercise.key), !dismissed.contains(x.id) { return x }
        }
        return nil
    }
}
