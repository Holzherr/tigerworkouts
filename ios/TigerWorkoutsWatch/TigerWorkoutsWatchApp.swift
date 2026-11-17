import SwiftUI

@main
struct TigerWorkoutsWatchApp: App {
    @State private var model = WatchModel()

    var body: some Scene {
        WindowGroup {
            SessionFace(model: model)
                .task { model.activate() }
        }
    }
}

/// The phone's running session at a glance: what you are doing, the clock, and the one button
/// that moves it on. Editing stays on the phone.
struct SessionFace: View {
    let model: WatchModel

    static let coral = Color(red: 1.0, green: 0.302, blue: 0.180)
    static let rest = Color(red: 0.576, green: 0.659, blue: 1.0)

    var body: some View {
        if let state = model.state {
            running(state)
        } else {
            VStack(spacing: 8) {
                Image(systemName: "iphone")
                    .font(.title2)
                    .foregroundStyle(Self.coral)
                Text("Start a workout on your iPhone.")
                    .font(.footnote)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func running(_ state: WatchState) -> some View {
        let tint = state.isRest ? Self.rest : Self.coral
        return VStack(spacing: 4) {
            Text(state.headline)
                .font(.headline)
                .lineLimit(2)
                .minimumScaleFactor(0.7)
                .multilineTextAlignment(.center)
            clock(state)
                .font(.system(size: 40, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(tint)
                .minimumScaleFactor(0.6)
                .lineLimit(1)
            Text(state.setLine ?? state.detail)
                .font(.footnote)
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            Spacer(minLength: 2)
            controls(state, tint: tint)
        }
        .frame(maxWidth: .infinity)
        .navigationTitle(state.title)
    }

    @ViewBuilder
    private func clock(_ state: WatchState) -> some View {
        if state.isDone {
            Image(systemName: "checkmark.circle.fill")
        } else if state.isPaused {
            Text(verbatim: state.pausedLeft.map(Self.minutes) ?? "—")
        } else {
            Text(timerInterval: state.timerRange, countsDown: state.endsAt != nil, showsHours: false)
                .multilineTextAlignment(.center)
        }
    }

    /// The same buttons as the Lock Screen card. Each sends the tap to the phone, which redraws
    /// this screen from the state that follows.
    @ViewBuilder
    private func controls(_ state: WatchState, tint: Color) -> some View {
        switch state.action {
        case .none:
            EmptyView()
        case .start:
            button("Start", "play.fill", .done, tint: tint)
        case .done:
            button("Done", "checkmark", .done, tint: tint)
        case .pause:
            button("Pause", "pause.fill", .pause, tint: tint)
        case .resume:
            button("Resume", "play.fill", .resume, tint: tint)
        case .rest:
            HStack(spacing: 6) {
                Button("+15 s") { model.send(.extendRest) }
                    .tint(tint)
                button("Skip", "forward.end.fill", .skipRest, tint: tint)
            }
        }
    }

    private func button(_ title: String, _ icon: String, _ command: WatchCommand, tint: Color) -> some View {
        Button { model.send(command) } label: {
            Label(title, systemImage: icon).frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .tint(tint)
    }

    /// "1:05": a paused countdown, which must hold still.
    static func minutes(_ seconds: Double) -> String {
        let s = max(0, Int(seconds.rounded(.up)))
        return "\(s / 60):" + String(format: "%02d", s % 60)
    }
}
