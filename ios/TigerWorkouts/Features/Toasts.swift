import SwiftUI

/// Hold a stepper button and it repeats (`buttonRepeatBehavior`), and the repeats speed up: one
/// step at a time for the first half second or so, then two, then five. 20 → 100 kg is a hold,
/// not 32 taps. Taps as fast as a thumb can go stay one step each: only the system's repeat comes
/// in under `repeatGap`.
struct Accelerator {
    static let repeatGap: TimeInterval = 0.12
    private var last: Date?
    private var run = 0

    /// How many steps this press is worth.
    mutating func factor(now: Date = Date()) -> Double {
        if let last, now.timeIntervalSince(last) < Self.repeatGap { run += 1 } else { run = 0 }
        last = now
        return run >= 16 ? 5 : run >= 6 ? 2 : 1
    }
}

/// A line at the bottom of the screen for five seconds: what just happened, and Undo.
struct UndoToast: View {
    var label: String
    var dark = false
    var onUndo: () -> Void
    var onExpire: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Text(label)
                .font(.subheadline.weight(.semibold))
                .lineLimit(1)
                .foregroundStyle(dark ? Brand.ink : .white)
            Spacer(minLength: 8)
            Button("Undo", action: onUndo)
                .font(.subheadline.weight(.bold))
                .foregroundStyle(dark ? Brand.coralInk : Brand.coral)
                .frame(minWidth: 44, minHeight: 44)
                .accessibilityIdentifier("undo")
        }
        .padding(.leading, 16)
        .padding(.trailing, 8)
        .background(dark ? Color.white : Brand.ink, in: Capsule())
        .shadow(color: .black.opacity(0.18), radius: 10, y: 4)
        .padding(.horizontal, 16)
        .transition(.move(edge: .bottom).combined(with: .opacity))
        .task(id: label) {
            try? await Task.sleep(for: .seconds(5))
            if !Task.isCancelled { onExpire() }
        }
    }
}

/// "New record · Bench press 100 × 5", for three seconds over the timer.
struct RecordToast: View {
    var text: String
    var onExpire: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "medal.fill").foregroundStyle(Brand.coral)
            Text("New record · \(text)")
                .font(.subheadline.weight(.bold))
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .foregroundStyle(Brand.ink)
        .padding(.horizontal, 16)
        .frame(minHeight: 40)
        .background(.white, in: Capsule())
        .shadow(color: .black.opacity(0.25), radius: 10, y: 4)
        .transition(.move(edge: .top).combined(with: .opacity))
        .accessibilityIdentifier("record-toast")
        .task(id: text) {
            try? await Task.sleep(for: .seconds(3))
            if !Task.isCancelled { onExpire() }
        }
    }
}
