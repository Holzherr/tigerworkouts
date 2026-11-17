import SwiftUI

/// Today's target in one line — "Today: Shoulder press 27.5 kg × 8 (+2.5 kg)" — with the reasoning
/// and any other exercise's target behind a tap (Priyanka, 14 Nov 2026: the two-line version was
/// heavy and repeated the rows below). Display only: the numbers are `Targets.today`'s.
struct TodayLine: View {
    var today: Targets.Today
    /// What changed from last time on the first target: "+2.5 kg", "+1 rep".
    var delta: String? = nil
    @State private var open = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Button {
                withAnimation(.easeOut(duration: 0.2)) { open.toggle() }
            } label: {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    (Text("Today: ").foregroundStyle(Brand.coralInk)
                        + Text(today.text).foregroundStyle(Brand.ink)
                        + Text(delta.map { " (\($0))" } ?? "").foregroundStyle(Brand.coralInk))
                        .font(.subheadline.weight(.bold))
                        .lineLimit(1)
                        .minimumScaleFactor(0.85)
                    Spacer(minLength: 4)
                    Image(systemName: open ? "chevron.up" : "chevron.down")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(Brand.faint)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint(open ? "Hides why" : "Shows why")
            .accessibilityIdentifier("today-target")
            if open {
                VStack(alignment: .leading, spacing: 4) {
                    Text(Self.why(today.detail))
                    ForEach(today.sets.dropFirst(), id: \.stepId) { t in
                        Text("\(t.name) \(t.text): \(t.reason)")
                    }
                }
                .font(.footnote)
                .foregroundStyle(Brand.muted)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("today-why")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// The reason without the "· 1 more on the workout page" tail: the others are listed here.
    static func why(_ detail: String) -> String {
        guard let r = detail.range(of: " · ", options: .backwards), detail[r.upperBound...].hasSuffix("on the workout page") else { return detail }
        return String(detail[..<r.lowerBound])
    }

    /// The change on today's target against last time's working sets: the load if it moves
    /// ("+2.5 kg"), else the reps ("+1 rep/set" when every set gains the same, else the total).
    static func delta(_ t: Targets.SetTarget, last: [SetResult]?, unit: String) -> String? {
        let work = (last ?? []).filter { $0.type != .warmup && $0.type != .drop }
        guard !work.isEmpty else { return nil }
        let top = work.compactMap(\.load).max()
        if let load = t.load, let top, top > 0, load != top {
            let d = load - top
            return "\(d > 0 ? "+" : "−")\(Units.label(abs(d), unit: unit))"
        }
        let before = work.filter { top == nil || $0.load == top }.compactMap(\.reps)
        guard !before.isEmpty, before.count == t.reps.count else { return nil }
        let diffs = zip(t.reps, before).map { $0 - $1 }
        let each = diffs.allSatisfy { $0 == diffs[0] }
        let d = each ? diffs[0] : diffs.reduce(0, +)
        guard d != 0 else { return nil }
        return "\(d > 0 ? "+" : "−")\(Format.number(abs(d))) rep\(abs(d) == 1 ? "" : "s")\(each && diffs.count > 1 ? "/set" : "")"
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
                                Text(n.from.map { Units.weightNumber($0) } ?? "?")
                                Image(systemName: "arrow.right").font(.caption2.weight(.bold)).foregroundStyle(Brand.faint)
                                Text("\(n.to.map { Units.weightNumber($0) } ?? "?") \(Units.word())")
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
                    Text(Units.label(load, unit: s.exercise.unit)).font(.footnote).foregroundStyle(Brand.muted).monospacedDigit()
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

/// How hard each lift was, RPE 1–10, on the finish screen — only for lifts progressed by effort
/// (`ProgressMode.effort`), whose next target reads it. Written onto every working set of that
/// exercise in the session (`SetResult.rpe`).
struct LiftEffortCard: View {
    var runsheet: Runsheet
    var result: SessionResult
    var suggest: SuggestPrefs
    var onRate: (_ exerciseKey: String, _ rpe: Double?) -> Void

    /// The exercises to ask about: progressed by effort, in the main work, not moved by a
    /// programme's rules, and logged in sets this session. In workout order, once each.
    static func lifts(_ r: Runsheet, result: SessionResult, suggest: SuggestPrefs) -> [(key: String, name: String)] {
        guard suggest.on(for: r) else { return [] }
        var seen = Set<String>()
        return r.exerciseSteps.compactMap { s in
            let key = s.exercise.key
            guard suggest.mode(for: key) == .effort, (s.role ?? .main) == .main, !Targets.ruled(r, s),
                  result.steps.contains(where: { $0.exerciseKey == key && ($0.sets ?? []).contains { $0.isWorking && ($0.reps ?? 0) > 0 } }),
                  seen.insert(key).inserted else { return nil }
            return (key, s.exercise.name)
        }
    }

    /// The session with `rpe` on every working set of the exercise (nil clears it).
    static func rated(_ r: SessionResult, key: String, rpe: Double?) -> SessionResult {
        var r = r
        r.steps = r.steps.map { row in
            guard row.exerciseKey == key, var sets = row.sets else { return row }
            for i in sets.indices where sets[i].isWorking { sets[i].rpe = rpe }
            var row = row
            row.sets = sets
            return row
        }
        return r
    }

    static func value(_ r: SessionResult, key: String) -> Double? {
        r.steps.filter { $0.exerciseKey == key }.flatMap { $0.sets ?? [] }.compactMap(\.rpe).max()
    }

    var body: some View {
        let lifts = Self.lifts(runsheet, result: result, suggest: suggest)
        if !lifts.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("How hard was each lift?").font(.subheadline.weight(.bold)).foregroundStyle(Brand.ink)
                    Text("RPE: 10 is nothing left, 7 is three more reps in the tank. Weight goes up once it is 7 or less.")
                        .font(.footnote)
                        .foregroundStyle(Brand.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                ForEach(lifts, id: \.key) { lift in
                    let value = Self.value(result, key: lift.key)
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text(lift.name).font(.footnote.weight(.semibold)).foregroundStyle(Brand.ink).lineLimit(1)
                            Spacer()
                            Text(value.map { "RPE \(Format.number($0))" } ?? "Tap 1–10").font(.caption).foregroundStyle(Brand.muted)
                        }
                        HStack(spacing: 3) {
                            ForEach(1...10, id: \.self) { n in
                                let on = value.map(Int.init) == n
                                Button { onRate(lift.key, on ? nil : Double(n)) } label: {
                                    Text("\(n)")
                                        .font(.system(size: 14, weight: .bold, design: .rounded))
                                        .monospacedDigit()
                                        .frame(maxWidth: .infinity, minHeight: 36)
                                        .foregroundStyle(on ? Color.white : Brand.ink)
                                        .background(on ? Brand.ink : Brand.lineSoft, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel("\(lift.name) RPE \(n)")
                                .accessibilityAddTraits(on ? .isSelected : [])
                            }
                        }
                    }
                }
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .cardSurface()
            .accessibilityIdentifier("lift-effort")
        }
    }
}
