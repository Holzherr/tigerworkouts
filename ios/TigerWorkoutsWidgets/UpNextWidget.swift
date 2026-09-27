import SwiftUI
import WidgetKit

/// What to do next, on the home screen: the same pick as the Up next card, and this week's count.
/// Tapping it opens that workout's page, one tap from Start.
struct UpNextWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: UpNextShare.kind, provider: UpNextProvider()) { entry in
            UpNextEntryView(entry: entry)
        }
        .configurationDisplayName("Up next")
        .description("Your next workout and how many you have done this week.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct UpNextEntry: TimelineEntry {
    var date: Date
    var snapshot: UpNextSnapshot?
}

/// The app redraws the widget whenever what it would show changes. The only change it cannot see
/// coming is the week turning over, so the timeline carries one more entry at Monday midnight.
struct UpNextProvider: TimelineProvider {
    func placeholder(in context: Context) -> UpNextEntry {
        UpNextEntry(date: Date(), snapshot: UpNextSnapshot(workoutId: "x", title: "Upper body", reason: "Your last workout", detail: "45 min"))
    }

    func getSnapshot(in context: Context, completion: @escaping (UpNextEntry) -> Void) {
        completion(context.isPreview && UpNextShare.read() == nil ? placeholder(in: context) : UpNextEntry(date: Date(), snapshot: UpNextShare.read()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<UpNextEntry>) -> Void) {
        let now = Date()
        let snapshot = UpNextShare.read()
        var entries = [UpNextEntry(date: now, snapshot: snapshot)]
        if let week = Calendar.iso8601Monday.dateInterval(of: .weekOfYear, for: now) {
            entries.append(UpNextEntry(date: week.end, snapshot: snapshot))
        }
        completion(Timeline(entries: entries, policy: .atEnd))
    }
}

struct UpNextEntryView: View {
    @Environment(\.widgetFamily) private var family
    var entry: UpNextEntry

    var body: some View {
        UpNextWidgetView(snapshot: entry.snapshot, now: entry.date, family: family)
    }
}
