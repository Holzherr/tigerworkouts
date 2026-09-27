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

    /// `-seedProgress` on launch: Jack (a 20-minute AMRAP) three times at 7, 7 and 8 rounds, the
    /// newest a minute back so Up next picks it with a Today target, and kettlebell swings stuck at
    /// 24 kg × 10 for five weeks — three sessions of their own plus the swings inside each Jack — so
    /// the card has a stall line and the logbook a stall card. Fixed ids: launching with it again
    /// replaces them.
    func seedProgressIfAsked(_ arguments: [String] = ProcessInfo.processInfo.arguments) {
        guard arguments.contains("-seedProgress") else { return }
        let day: TimeInterval = 86_400
        func ago(_ d: Double) -> String { ISO8601.string(Date().addingTimeInterval(-d * day)) }
        func swings(_ n: Int) -> StepResult {
            StepResult(stepId: "s2", exerciseKey: "kb_swing", target: 24, reps: Array(repeating: 10, count: n), success: true,
                       sets: Array(repeating: SetResult(reps: 10, load: 24), count: n))
        }
        var seed: [SessionResult] = [35, 28, 21].map { d in
            SessionResult(runsheetId: "seed-swings", title: "Swings", startedAt: ago(d), durationSec: 1_800, completed: true,
                          steps: [swings(3)], id: "seed-progress-swings-\(Int(d))")
        }
        for (d, rounds) in [(14.0, 7.0), (7.0, 7.0), (60.0 / day, 8.0)] {
            seed.append(SessionResult(runsheetId: "cf-hero-jack", title: "Jack", startedAt: ago(d), durationSec: 1_200, completed: true,
                                      score: rounds, steps: [swings(Int(rounds))], id: "seed-progress-jack-\(Int(d))"))
        }
        let ids = Set(seed.compactMap(\.id))
        results = (results.filter { !ids.contains($0.rowId) } + seed).sorted { $0.startedAt > $1.startedAt }
    }

    /// `-seedLoads` on launch: a workout of your own, "Loads check", that embeds the NHS 6-minute
    /// warm-up by reference, runs bench as a warm-up, two working sets and a drop set, and presses
    /// at 65% of a 61 kg training max — with home plates set in My equipment, so the press shows
    /// 40 kg on the bar. Fixed id: launching with it again replaces it.
    func seedLoadsIfAsked(_ arguments: [String] = ProcessInfo.processInfo.arguments) {
        guard arguments.contains("-seedLoads") else { return }
        let bench = Library.shared.exercise("bb_bench")?.ref ?? ExerciseRef(key: "bb_bench", name: "Barbell bench press", unit: "kg", step: 2.5)
        let ohp = Library.shared.exercise("bb_ohp")?.ref ?? ExerciseRef(key: "bb_ohp", name: "Barbell overhead press", unit: "kg", step: 2.5)
        var b = ExerciseStep(id: "seed-bench", exercise: bench, target: 60, forMode: .reps, forValue: 8)
        b.sets = [SetPlan(reps: 10, load: 40, type: .warmup), SetPlan(reps: 8, load: 60), SetPlan(reps: 8, load: 60), SetPlan(reps: 8, load: 45, type: .drop)]
        var p = ExerciseStep(id: "seed-ohp", exercise: ohp, forMode: .reps, forValue: 5)
        p.targetPct = 65
        var sheet = Runsheet(id: "seed-loads", title: "Loads check", items: [
            .ref(RefItem(id: "seed-warm", runsheetId: "nhs-6-min-warm-up", role: .warmup)),
            .block(Block(id: "seed-b1", name: "Bench", repeatCount: 4, steps: [.exercise(b), .rest(RestStep(id: "seed-r1", seconds: 90))])),
            .block(Block(id: "seed-b2", name: "Press", repeatCount: 3, steps: [.exercise(p), .rest(RestStep(id: "seed-r2", seconds: 90))])),
        ])
        sheet.creator = "You"
        myWorkouts = [sheet] + myWorkouts.filter { $0.key != "seed-loads" }
        trainingMaxes["bb_ohp"] = 61
        equipment = Equipment(barKg: 20, plates: [PlateCount(kg: 20, count: 2), PlateCount(kg: 10, count: 2), PlateCount(kg: 5, count: 2), PlateCount(kg: 2.5, count: 2), PlateCount(kg: 1.25, count: 2)], kettlebells: [12, 16, 24])
    }
}
#endif
