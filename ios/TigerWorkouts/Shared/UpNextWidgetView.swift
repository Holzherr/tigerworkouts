import SwiftUI
import WidgetKit

/// The Up next widget's face. Compiled into the app as well as the widget so a unit test can draw
/// it — the simulator has no way to screenshot a home-screen widget from a test.
struct UpNextWidgetView: View {
    var snapshot: UpNextSnapshot?
    var now: Date
    var family: WidgetFamily

    private static let coral = Color(red: 1.0, green: 0.302, blue: 0.180)

    private var thisWeek: Int { snapshot?.thisWeek(now: now) ?? 0 }
    private var weekLine: String { thisWeek == 1 ? "1 this week" : "\(thisWeek) this week" }

    var body: some View {
        Group {
            if let snapshot, let title = snapshot.title {
                if family == .systemMedium { medium(snapshot, title) } else { small(snapshot, title) }
            } else {
                empty
            }
        }
        .widgetURL(snapshot?.url ?? URL(string: "tigerworkouts://")!)
        .containerBackground(for: .widget) { Color(.systemBackground) }
    }

    private func small(_ s: UpNextSnapshot, _ title: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Label("Up next", systemImage: "play.circle.fill")
                .font(.caption.weight(.bold))
                .foregroundStyle(Self.coral)
            Text(title)
                .font(.headline)
                .lineLimit(3)
                .minimumScaleFactor(0.8)
            if let detail = s.detail {
                Text(detail).font(.caption).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer(minLength: 0)
            week
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func medium(_ s: UpNextSnapshot, _ title: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(s.reason ?? "Up next")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(Self.coral)
                    .lineLimit(1)
                Text(title)
                    .font(.title3.weight(.bold))
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
                if let detail = s.detail {
                    Text(detail).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                }
                Spacer(minLength: 0)
                week
            }
            Spacer(minLength: 0)
            Label("Start", systemImage: "play.fill")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.white)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(Self.coral, in: Capsule())
        }
    }

    /// No history yet: say so, and open the catalogue rather than invent a pick.
    private var empty: some View {
        VStack(alignment: .leading, spacing: 4) {
            Label("Tiger", systemImage: "figure.strengthtraining.functional")
                .font(.caption.weight(.bold))
                .foregroundStyle(Self.coral)
            Text("Pick a workout")
                .font(family == .systemMedium ? .title3.weight(.bold) : .headline)
            Text("Your next one shows here once you have done one.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(3)
            Spacer(minLength: 0)
            week
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var week: some View {
        Label(weekLine, systemImage: "chart.line.uptrend.xyaxis")
            .font(.caption.weight(.semibold))
            .foregroundStyle(.secondary)
            .lineLimit(1)
    }
}
