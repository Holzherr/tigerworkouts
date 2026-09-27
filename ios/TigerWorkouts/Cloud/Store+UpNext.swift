import Foundation
import WidgetKit

extension Store {
    /// Hand the Up next widget what it shows. Called whenever the cache is written, which is every
    /// time results or workouts change; WidgetKit is only asked to redraw when the answer moved.
    func shareUpNext() {
        guard loaded else { return }
        let snapshot = Self.upNextSnapshot(all: allWorkouts, results: results)
        if UpNextShare.write(snapshot) {
            WidgetCenter.shared.reloadTimelines(ofKind: UpNextShare.kind)
        }
    }

    /// The same pick as the Up next card on the Workouts tab, and the session dates of the last
    /// five weeks — enough to count this week whatever day the widget draws on.
    nonisolated static func upNextSnapshot(all: [Runsheet], results: [SessionResult], now: Date = Date()) -> UpNextSnapshot {
        let since = now.addingTimeInterval(-35 * 86_400)
        let sessions = results.map(\.startedDate).filter { $0 >= since }.sorted()
        guard let next = NextUp.find(in: all, results: results) else { return UpNextSnapshot(sessions: sessions) }
        let detail = ["\(next.runsheet.minutes) min", next.runsheet.program?.day]
            .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
        return UpNextSnapshot(
            workoutId: next.runsheet.key, title: next.runsheet.title, reason: next.reason,
            detail: detail.isEmpty ? nil : detail, sessions: sessions
        )
    }
}
