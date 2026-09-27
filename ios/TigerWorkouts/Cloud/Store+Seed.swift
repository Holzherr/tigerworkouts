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

    /// `-seedPace` on launch: a timed Cindy (a round a minute) and a timed Iron Base A, dated an
    /// hour back — newer than earlier runs' sessions, older than anything this run logs — so the
    /// timer has a last time to race and last-time sets to tap. Fixed ids, so launching with it
    /// again replaces them.
    func seedPaceIfAsked(_ arguments: [String] = ProcessInfo.processInfo.arguments) {
        guard arguments.contains("-seedPace") else { return }
        let then = ISO8601.string(Date().addingTimeInterval(-3_600))
        let rounds: [Double] = (1...8).map { Double($0) * 60 }
        var cindy = SessionResult(runsheetId: "cf-girls-cindy", title: "Cindy", startedAt: then, durationSec: 1_200, completed: true,
                                  steps: [
                                    StepResult(stepId: "s1", exerciseKey: "bw_pullup", sets: rounds.map { SetResult(reps: 5, at: $0 - 40) }),
                                    StepResult(stepId: "s2", exerciseKey: "bw_pushup", sets: rounds.map { SetResult(reps: 10, at: $0 - 20) }),
                                    StepResult(stepId: "s3", exerciseKey: "bw_squat", sets: rounds.map { SetResult(reps: 15, at: $0) }),
                                  ],
                                  id: "seed-pace-cindy")
        cindy.splits = [RoundSplit(blockId: "b1", at: rounds)]
        let iron = SessionResult(runsheetId: "coach-iron-30", title: "Iron Base · Whole Body A", startedAt: then, durationSec: 1_800, completed: true,
                                 steps: [StepResult(stepId: "s3", exerciseKey: "cable_lat_pulldown", target: 45, sets: [
                                    SetResult(reps: 10, load: 45, at: 900), SetResult(reps: 9, load: 45, at: 990),
                                    SetResult(reps: 8, load: 45, at: 1_080), SetResult(reps: 8, load: 42.5, at: 1_170),
                                 ])],
                                 id: "seed-pace-iron")
        let seed = [cindy, iron]
        let ids = Set(seed.compactMap(\.id))
        results = (results.filter { !ids.contains($0.rowId) } + seed).sorted { $0.startedAt > $1.startedAt }
    }
}
#endif
