import SwiftUI

/// The workout's score, put right after the session: minutes and seconds for time, rounds and
/// extra reps for an AMRAP, one stepper for total reps, kg or metres. Nothing for an unscored
/// workout. Follows `score-entry.tsx`; the value is stored the same way (time in seconds, rounds
/// as rounds + reps / 1000), and `scoreText` is written from it as the web writes it.
struct ScoreEntryView: View {
    let type: ScoreType
    var value: Double?
    var onChange: (Double?) -> Void

    @State private var timeText = ""
    @FocusState private var timeFocused: Bool

    var body: some View {
        switch type {
        case .none:
            EmptyView()
        case .time:
            HStack {
                Text("Time")
                Spacer()
                TextField("mm:ss", text: $timeText)
                    .keyboardType(.numbersAndPunctuation)
                    .multilineTextAlignment(.center)
                    .font(.title3.weight(.bold))
                    .monospacedDigit()
                    .frame(width: 96, height: 44)
                    .background(Brand.surface, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Brand.line))
                    .focused($timeFocused)
                    .onSubmit(commitTime)
                    .accessibilityLabel("Minutes and seconds")
                    .accessibilityIdentifier("score-time")
            }
            .onAppear { timeText = value.map(Format.clock) ?? "" }
            .onChange(of: timeFocused) { _, focused in if !focused { commitTime() } }
        case .rounds:
            let rounds = Int(value ?? 0)
            let reps = Int((((value ?? 0).truncatingRemainder(dividingBy: 1)) * 1000).rounded())
            VStack(spacing: 4) {
                Stepper(value: Binding(get: { rounds }, set: { onChange(Double($0) + Double(reps) / 1000) }), in: 0...200) {
                    row("Rounds", "\(rounds)")
                }
                .accessibilityIdentifier("score-rounds")
                Stepper(value: Binding(get: { reps }, set: { onChange(Double(rounds) + Double($0) / 1000) }), in: 0...999) {
                    row("+ reps into the next round", "\(reps)")
                }
                .accessibilityIdentifier("score-reps")
            }
        case .reps, .load, .distance:
            let label = type == .reps ? "Total reps" : type == .load ? "Load (kg)" : "Distance (m)"
            let step: Double = type == .load ? 2.5 : type == .distance ? 50 : 1
            Stepper(value: Binding(get: { value ?? 0 }, set: { onChange(max(0, $0)) }), in: 0...99_999, step: step) {
                row(label, Format.number(value ?? 0))
            }
            .accessibilityIdentifier("score-total")
        }
    }

    private func row(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label)
            Spacer()
            Text(value).font(.body.weight(.bold)).monospacedDigit().foregroundStyle(Brand.ink)
        }
    }

    private func commitTime() {
        guard let seconds = Self.parseTime(timeText) else {
            timeText = value.map(Format.clock) ?? ""
            return
        }
        if seconds != value { onChange(seconds) }
        timeText = Format.clock(seconds)
    }

    /// "12:34", "12.34" or "12" (minutes); nil for anything else.
    nonisolated static func parseTime(_ text: String) -> Double? {
        let t = text.trimmingCharacters(in: .whitespaces)
        let parts = t.split(whereSeparator: { $0 == ":" || $0 == "." }).map(String.init)
        if parts.count == 2, let m = Int(parts[0]), let s = Int(parts[1]), parts[1].count <= 2, s < 60 { return Double(m * 60 + s) }
        if parts.count == 1, !t.contains(":"), !t.contains("."), let m = Int(parts[0]) { return Double(m * 60) }
        return nil
    }

    /// The result with a new score and the text the web shows for it.
    nonisolated static func scored(_ r: SessionResult, _ score: Double?, type: ScoreType) -> SessionResult {
        // A capped for-time stays capped, with its reps, until its score is changed by hand.
        if r.capped == true, score == r.score { return r }
        var out = r
        out.score = score
        out.scoreText = score.map { Celebrate.formatScore(type, $0) }
        out.capped = nil
        out.capReps = nil
        return out
    }
}
