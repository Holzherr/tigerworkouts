#if DEBUG
import Foundation

extension Store {
    /// `-seedLogbook` on launch: six weeks of bench press and a few treadmill sprints, so the UI
    /// walkthrough can reach the logbook with a chart and records without a real account. The
    /// ids are fixed, so launching with it again replaces the rows rather than adding more.
    func seedLogbookIfAsked(_ arguments: [String] = ProcessInfo.processInfo.arguments) {
        guard arguments.contains("-seedLogbook") else { return }
        let day: TimeInterval = 86_400
        let start = Date().addingTimeInterval(-42 * day)
        func at(_ d: Double) -> String { ISO8601.string(start.addingTimeInterval(d * day)) }
        func bench(_ sets: [(Double, Double)]) -> StepResult {
            StepResult(stepId: "bench", exerciseKey: "bb_bench", target: sets.map(\.0).max(), incline: nil,
                       reps: sets.map(\.1), success: true, sets: sets.map { SetResult(reps: $0.1, load: $0.0) })
        }
        func sprint(_ kph: [Double]) -> StepResult {
            StepResult(stepId: "sprint", exerciseKey: "sprint", target: kph.last, incline: 2, reps: nil, success: true,
                       sets: kph.map { SetResult(reps: nil, load: $0) })
        }
        let seed: [SessionResult] = [
            SessionResult(runsheetId: "seed-push", title: "Push day", startedAt: at(0), durationSec: 2_700, completed: true,
                          steps: [bench([(60, 8), (60, 8), (60, 7)])], id: "seed-1"),
            SessionResult(runsheetId: "seed-push", title: "Push day", startedAt: at(7), durationSec: 2_700, completed: true,
                          steps: [bench([(62.5, 8), (62.5, 7), (62.5, 6)]), sprint([13, 13.5, 14])], id: "seed-2"),
            SessionResult(runsheetId: "seed-push", title: "Push day", startedAt: at(14), durationSec: 2_700, completed: true,
                          steps: [bench([(65, 6), (65, 6), (60, 10)])], id: "seed-3"),
            SessionResult(runsheetId: "seed-push", title: "Push day", startedAt: at(24), durationSec: 2_700, completed: true,
                          steps: [bench([(65, 7), (67.5, 5), (67.5, 4)]), sprint([14, 14.5, 14.5])], id: "seed-4"),
            SessionResult(runsheetId: "seed-heavy", title: "Heavy singles", startedAt: at(33), durationSec: 1_800, completed: true,
                          steps: [bench([(70, 3), (72.5, 2), (75, 1)])], id: "seed-5"),
            SessionResult(runsheetId: "seed-push", title: "Push day", startedAt: at(40), durationSec: 2_700, completed: true,
                          steps: [bench([(67.5, 6), (67.5, 6), (67.5, 5)])], id: "seed-6"),
        ]
        let ids = Set(seed.compactMap(\.id))
        results = (results.filter { !ids.contains($0.rowId) } + seed).sorted { $0.startedAt > $1.startedAt }
    }
}
#endif
