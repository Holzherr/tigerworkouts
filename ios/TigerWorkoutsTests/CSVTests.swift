import Foundation
import Testing
@testable import TigerWorkouts

/// The export matches the web's `toCsv` row for row (csv.test.ts checks the same sessions).
@Suite("CSV export")
struct CSVTests {
    private let results: [SessionResult] = {
        var padel = SessionResult(runsheetId: "activity:Padel", title: "Padel", startedAt: "2026-09-25T18:00:00.000Z", id: "s-0")
        padel.activity = ActivityLog(name: "Padel", minutes: 60)
        let push = SessionResult(
            runsheetId: "w", title: "Push, heavy", startedAt: "2026-09-26T17:02:00.000Z", durationSec: 3780,
            steps: [
                StepResult(stepId: "a", exerciseKey: "bb_bench", target: nil, incline: nil, reps: nil, success: nil,
                           sets: [SetResult(reps: 5, load: 80, type: .warmup), SetResult(reps: 4, load: 82.5)]),
                StepResult(stepId: "b", exerciseKey: "bw_pullup", target: nil, incline: nil, reps: nil, success: nil, sets: [SetResult(reps: 10, load: nil)]),
                StepResult(stepId: "c", exerciseKey: "u_pec_deck", target: 55, incline: nil, reps: [12], success: nil),
                StepResult(stepId: "d", exerciseKey: "cardio_rower", target: nil, incline: nil, reps: nil, success: nil, sets: [SetResult(reps: nil, load: nil, at: 900, seconds: 101, meters: 500)]),
                StepResult(stepId: "e", exerciseKey: "cardio_assault_bike", target: nil, incline: nil, reps: nil, success: nil, sets: [SetResult(reps: nil, load: nil, seconds: 44, calories: 20)]),
            ],
            notes: "Felt \"strong\"\nshoulder ok", id: "s-1"
        )
        return [push, padel]
    }()

    private func name(_ key: String) -> (name: String, unit: String) {
        switch key {
        case "bb_bench": ("Barbell bench press", "kg")
        case "bw_pullup": ("Pull-up", "")
        case "u_pec_deck": ("Pec deck", "kg")
        case "cardio_rower": ("Rowing machine", "m")
        case "cardio_assault_bike": ("Assault bike", "cal")
        default: (key, "")
        }
    }

    @Test("one row per set, oldest session first, quoted where it has to be")
    func rows() {
        let csv = CSVExport.csv(results, exercise: name)
        let expected = """
        date,workout,exercise,exercise_key,set,set_type,load,unit,reps,seconds,meters,calories,duration_seconds,set_time_seconds,notes
        2026-09-25T18:00:00.000Z,Padel,,,,,,,,,,,3600,,
        2026-09-26T17:02:00.000Z,"Push, heavy",Barbell bench press,bb_bench,1,warmup,80,kg,5,,,,3780,,"Felt ""strong""
        shoulder ok"
        2026-09-26T17:02:00.000Z,"Push, heavy",Barbell bench press,bb_bench,2,normal,82.5,kg,4,,,,3780,,"Felt ""strong""
        shoulder ok"
        2026-09-26T17:02:00.000Z,"Push, heavy",Pull-up,bw_pullup,1,normal,,,10,,,,3780,,"Felt ""strong""
        shoulder ok"
        2026-09-26T17:02:00.000Z,"Push, heavy",Pec deck,u_pec_deck,1,normal,55,kg,12,,,,3780,,"Felt ""strong""
        shoulder ok"
        2026-09-26T17:02:00.000Z,"Push, heavy",Rowing machine,cardio_rower,1,normal,,m,,101,500,,3780,900,"Felt ""strong""
        shoulder ok"
        2026-09-26T17:02:00.000Z,"Push, heavy",Assault bike,cardio_assault_bike,1,normal,,cal,,44,,20,3780,,"Felt ""strong""
        shoulder ok"

        """
        #expect(csv == expected)
    }

    @Test("a Windows line break in notes is quoted like any other")
    func windowsLineBreak() {
        #expect(CSVExport.field("Felt heavy\r\nNext time 60") == "\"Felt heavy\r\nNext time 60\"")
        #expect(CSVExport.field("a\nb") == "\"a\nb\"")
        #expect(CSVExport.field("plain") == "plain")
    }

    @Test("numbers read like the web's")
    func numbers() {
        #expect(CSVExport.number(80) == "80")
        #expect(CSVExport.number(82.5) == "82.5")
        #expect(CSVExport.number(1.0 / 3) == "0.333")
        #expect(CSVExport.number(nil) == "")
    }
}
