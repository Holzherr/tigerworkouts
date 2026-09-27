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
                Text("\(stall.sessions) sessions without a new best. Two ways out:")
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
    @AppStorage(Intent.storageKey) private var intent = Intent.maintain.rawValue

    var body: some View {
        let lines = Targets.nextTime(runsheet, done: result, history: history, intent: Intent(rawValue: intent) ?? .maintain)
        if !lines.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text("Next time")
                    .font(.caption.weight(.heavy))
                    .textCase(.uppercase)
                    .tracking(0.6)
                    .foregroundStyle(Brand.coralInk)
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
