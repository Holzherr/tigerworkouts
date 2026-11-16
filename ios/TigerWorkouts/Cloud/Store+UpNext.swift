import Foundation
import WidgetKit

extension Store {
    /// Hand the Up next widget what it shows. Called whenever the cache is written, which is every
    /// time results or workouts change; WidgetKit is only asked to redraw when the answer moved.
    func shareUpNext() {
        guard loaded else { return }
        let coach = coachAssignments.compactMap { a in workout(id: a.workoutId).map { (sheet: $0, done: Coaching.isDone(a, results: results)) } }
        let snapshot = Self.upNextSnapshot(own: myWorkouts, all: allWorkouts, saved: saved, coach: coach, results: results)
        if UpNextShare.write(snapshot) {
            WidgetCenter.shared.reloadTimelines(ofKind: UpNextShare.kind)
        }
    }

    /// The same pick as the Up next card on the Workouts tab (review D2: the widget could name a
    /// different workout from Mine): what a coach sent and is not done, else `NextUp.pick` over the
    /// Mine list. With it, the session dates of the last five weeks, enough to count this week
    /// whatever day the widget draws on.
    nonisolated static func upNextSnapshot(own: [Runsheet], all: [Runsheet], saved: Set<String> = [], coach: [(sheet: Runsheet, done: Bool)] = [], results: [SessionResult], now: Date = Date()) -> UpNextSnapshot {
        let since = now.addingTimeInterval(-35 * 86_400)
        let sessions = results.map(\.startedDate).filter { $0 >= since }.sorted()
        let mine = Home.mine(own: own, all: all, saved: saved, results: results, skip: Set(coach.map(\.sheet.key)))
        let sent = coach.first { !$0.done }?.sheet
        let pick = sent == nil ? NextUp.pick(mine, own: Set(own.map(\.key)), results: results, now: now) : nil
        guard let next = sent ?? mine.first(where: { $0.key == pick?.id }) else { return UpNextSnapshot(sessions: sessions) }
        let reason = sent != nil ? "New · made for you" : pick?.why == .new ? Home.badge(next) : NextUp.badge(pick)
        let detail = ["\(next.minutes) min", NextUp.usualLine(pick)].compactMap { $0 }.joined(separator: " · ")
        return UpNextSnapshot(workoutId: next.key, title: next.title, reason: reason, detail: detail, sessions: sessions)
    }
}
