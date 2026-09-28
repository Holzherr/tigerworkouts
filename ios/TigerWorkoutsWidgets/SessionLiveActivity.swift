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
                        Text([context.state.detail, context.state.setLine].compactMap { $0 }.joined(separator: " · "))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                        ProgressView(value: context.state.progress)
                            .tint(tint(context.state))
                        controls(context.state)
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
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(context.state.isPaused ? "\(context.attributes.title) · Paused" : context.attributes.title)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                    Text(context.state.headline)
                        .font(.title3.weight(.bold))
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                    // "Exercise 2 of 3 · Round 4 · 12 s ahead" when there is a last time to race.
                    Text([context.state.detail, context.state.ghost].compactMap { $0 }.joined(separator: " · "))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                    if let line = context.state.setLine {
                        Text(line)
                            .font(.subheadline.weight(.semibold))
                            .monospacedDigit()
                            .lineLimit(1)
                    }
                    capClock(context.state)
                }
                Spacer(minLength: 12)
                clock(context.state)
                    .font(.system(size: 34, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(tint(context.state))
            }
            ProgressView(value: context.state.progress)
                .tint(tint(context.state))
            controls(context.state)
        }
        .padding(14)
    }

    /// Done on a set, Start at a gate, +15 s and Skip on a rest. Each runs in the app's process
    /// (see `SessionIntents`), and the card redraws from the update that follows.
    @ViewBuilder
    private func controls(_ state: SessionActivityAttributes.ContentState) -> some View {
        switch state.action {
        case .none:
            EmptyView()
        case .resume:
            HStack(spacing: 8) {
                Button(intent: ResumeSessionIntent(token: state.token)) { pill("Resume", "play.fill", filled: true, state) }
            }
            .buttonStyle(.plain)
        case .start:
            HStack(spacing: 8) {
                Button(intent: CompleteStepIntent(token: state.token)) { pill("Start", "play.fill", filled: true, state) }
            }
            .buttonStyle(.plain)
        case .done:
            HStack(spacing: 8) {
                Button(intent: CompleteStepIntent(token: state.token)) { pill("Done", "checkmark", filled: true, state) }
            }
            .buttonStyle(.plain)
        case .rest:
            HStack(spacing: 8) {
                Button(intent: ExtendRestIntent(token: state.token)) { pill("+15 s", "plus", filled: false, state) }
                Button(intent: SkipRestIntent(token: state.token)) { pill("Skip rest", "forward.end.fill", filled: true, state) }
            }
            .buttonStyle(.plain)
        }
    }

    private func pill(_ title: String, _ icon: String, filled: Bool, _ state: SessionActivityAttributes.ContentState) -> some View {
        Label(title, systemImage: icon)
            .font(.subheadline.weight(.semibold))
            .frame(maxWidth: .infinity, minHeight: 36)
            .foregroundStyle(filled ? Color.white : tint(state))
            .background(filled ? tint(state) : Color.white.opacity(0.14), in: Capsule())
    }

    /// "4:12 left in the block": the cap on an AMRAP or a for-time block, or the minute on EMOM work,
    /// counted down by the Lock Screen itself to the instant it runs out.
    @ViewBuilder
    private func capClock(_ state: SessionActivityAttributes.ContentState) -> some View {
        if let end = state.capEndsAt, let label = state.capLabel, !state.isPaused, !state.isDone {
            HStack(spacing: 4) {
                Image(systemName: "timer")
                Text(timerInterval: min(Date(), end)...end, countsDown: true, showsHours: false)
                    .monospacedDigit()
                    .frame(maxWidth: 44, alignment: .leading)
                Text(label)
            }
            .font(.caption.weight(.semibold))
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }
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
