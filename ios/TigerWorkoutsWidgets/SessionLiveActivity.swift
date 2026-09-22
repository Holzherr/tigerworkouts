import ActivityKit
import SwiftUI
import WidgetKit

/// The session on the Lock Screen and in the Dynamic Island. The point is the glance: what you are
/// doing and how long is left, without unlocking and without the app in front of you.
struct SessionLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: SessionActivityAttributes.self) { context in
            lockScreen(context)
                .activityBackgroundTint(Color.black.opacity(0.55))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label(context.attributes.title, systemImage: "figure.strengthtraining.functional")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    clock(context.state)
                        .font(.system(size: 17, weight: .semibold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(tint(context.state))
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(context.state.headline)
                            .font(.headline)
                            .lineLimit(1)
                        Text(context.state.detail)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                        ProgressView(value: context.state.progress)
                            .tint(tint(context.state))
                    }
                }
            } compactLeading: {
                Image(systemName: context.state.isRest ? "pause.circle.fill" : "bolt.fill")
                    .foregroundStyle(tint(context.state))
            } compactTrailing: {
                clock(context.state)
                    .font(.caption2.weight(.semibold))
                    .monospacedDigit()
                    .frame(maxWidth: 44)
            } minimal: {
                Image(systemName: context.state.isRest ? "pause.circle.fill" : "bolt.fill")
                    .foregroundStyle(tint(context.state))
            }
            .keylineTint(tint(context.state))
        }
    }

    private func lockScreen(_ context: ActivityViewContext<SessionActivityAttributes>) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(context.attributes.title)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                Spacer()
                if context.state.isPaused {
                    Text("Paused").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                }
            }
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(context.state.headline)
                        .font(.title3.weight(.bold))
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                    Text(context.state.detail)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                Spacer(minLength: 12)
                clock(context.state)
                    .font(.system(size: 34, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(tint(context.state))
            }
            ProgressView(value: context.state.progress)
                .tint(tint(context.state))
        }
        .padding(16)
    }

    /// A paused clock has to be a still number: an interval keeps running whatever the app does.
    @ViewBuilder
    private func clock(_ state: SessionActivityAttributes.ContentState) -> some View {
        if state.isDone {
            Image(systemName: "checkmark.circle.fill")
        } else if state.isPaused {
            Text(verbatim: "—")
        } else {
            Text(timerInterval: state.timerRange, pauseTime: nil, countsDown: state.countsDown, showsHours: false)
                .multilineTextAlignment(.trailing)
        }
    }

    private func tint(_ state: SessionActivityAttributes.ContentState) -> Color {
        state.isRest ? Color(red: 0.42, green: 0.55, blue: 1.0) : Color(red: 1.0, green: 0.302, blue: 0.180)
    }
}
