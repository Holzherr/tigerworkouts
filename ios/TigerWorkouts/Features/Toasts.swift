import SwiftUI

/// Hold a stepper button and it repeats, and the repeats speed up: one step at a time for about
/// a second, then two, then five. 20 → 100 kg is a hold, not 32 taps. SwiftUI's own
/// `buttonRepeatBehavior` repeats at a steady, slow rate, so the timing is done here.
enum Accelerator {
    /// First repeat after this long held; a shorter press is a tap.
    static let delay: Duration = .milliseconds(400)

    /// Steps the n-th repeat is worth (n from 0).
    static func factor(repeat n: Int) -> Double { n >= 16 ? 5 : n >= 6 ? 2 : 1 }

    /// The wait before the next repeat: a little slower while it is one step at a time.
    static func gap(repeat n: Int) -> Duration { .milliseconds(n < 6 ? 150 : 100) }
}

/// A button that takes one step when tapped and keeps stepping, faster, while held. `action` gets
/// how many steps each firing is worth.
struct RepeatButton<Label: View>: View {
    var action: (Double) -> Void
    @ViewBuilder var label: () -> Label

    @State private var task: Task<Void, Never>?
    @State private var repeated = false

    var body: some View {
        Button {
            // The release after a hold is not one more step.
            if repeated { repeated = false } else { action(1) }
        } label: { label() }
        .buttonStyle(PressWatch { pressed in
            task?.cancel()
            task = nil
            guard pressed else { return }
            repeated = false
            task = Task { @MainActor in
                try? await Task.sleep(for: Accelerator.delay)
                var n = 0
                while !Task.isCancelled {
                    repeated = true
                    action(Accelerator.factor(repeat: n))
                    try? await Task.sleep(for: Accelerator.gap(repeat: n))
                    n += 1
                }
            }
        })
        .onDisappear { task?.cancel() }
    }
}

/// Hands the button's pressed state out, so a hold can be timed. A scroll that takes the touch
/// over releases it.
private struct PressWatch: ButtonStyle {
    var onChange: (Bool) -> Void
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .opacity(configuration.isPressed ? 0.7 : 1)
            .onChange(of: configuration.isPressed) { _, pressed in onChange(pressed) }
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
