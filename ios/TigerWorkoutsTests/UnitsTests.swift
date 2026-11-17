import Foundation
import Testing
@testable import TigerWorkouts

/// Pounds as a display unit (U11): stored kg shown in lb, typed and stepped lb stored as kg. The
/// same cases as the web's units test, so both apps show the same number.
@Suite("units")
struct UnitsTests {
    @Test("a stored kg shows in lb to 0.1, a trailing .0 dropped; kg mode unchanged")
    func shown() {
        #expect(Units.number(20, unit: "kg", lb: true) == "44.1")
        #expect(Units.number(43.091, unit: "kg", lb: true) == "95")
        #expect(Units.number(20, unit: "kg", lb: false) == "20")
        #expect(Units.label(20, unit: "kg per arm", lb: true) == "44.1 lb per arm")
        #expect(Units.label(12, unit: "kph", lb: true) == "12 kph")
        #expect(Units.label(12, unit: "", lb: true) == "12")
        #expect(Units.weight(70, lb: true) == "154.3 lb")
        #expect(Units.weight(70, lb: false) == "70 kg")
    }

    @Test("a logged load with no unit counts as kg; a speed does not")
    func loadUnit() {
        #expect(Units.loadUnit("") == "kg")
        #expect(Units.loadUnit(nil) == "kg")
        #expect(Units.loadUnit("kph") == "kph")
        #expect(Units.number(20, unit: Units.loadUnit(""), lb: true) == "44.1")
    }

    @Test("unit words: kg… becomes lb…, nothing else changes")
    func unitText() {
        #expect(Units.unit("kg", lb: true) == "lb")
        #expect(Units.unit("kg per arm", lb: true) == "lb per arm")
        #expect(Units.unit("kph", lb: true) == "kph")
        #expect(Units.unit("m", lb: true) == "m")
        #expect(Units.unit("", lb: true) == "")
        #expect(Units.unit("kg", lb: false) == "kg")
    }

    @Test("a typed lb is stored as kg to 3 places, and shows back as typed")
    func entry() {
        #expect(Units.stored(95, unit: "kg", lb: true) == 43.091)
        #expect(Units.stored(95, unit: "kg", lb: false) == 95)
        #expect(Units.stored(10, unit: "kph", lb: true) == 10)
        for lb in [1.0, 2.5, 45, 95, 135, 225, 315.5] {
            #expect(Units.shown(Units.stored(lb, unit: "kg", lb: true), unit: "kg", lb: true) == lb)
        }
    }

    @Test("a kg step maps to its lb step, and each lb choice comes back from its stored kg")
    func steps() {
        let cases: [(Double, Double)] = [(0.5, 1), (1, 2), (1.25, 2.5), (2, 5), (2.5, 5), (4, 10), (5, 10), (10, 20), (20, 45)]
        for (kg, lb) in cases { #expect(Units.lbStep(kg) == lb) }
        for lb in Units.lbStepChoices { #expect(Units.lbStep(Units.toKg(lb)) == lb) }
        #expect(Units.step(2.5, unit: "kph", lb: true) == 2.5)
    }

    @Test("stepping in lb snaps to the step grid; kg mode adds")
    func stepping() {
        func lbAfter(_ kg: Double, _ presses: Double) -> Double {
            Units.shown(Units.stepped(kg, by: presses, step: 2.5, unit: "kg", lb: true), unit: "kg", lb: true)
        }
        #expect(lbAfter(20, 1) == 45)     // 44.1 + 5
        #expect(lbAfter(Units.toKg(45), 1) == 50)
        #expect(lbAfter(20, -1) == 40)    // 44.1 − 5
        #expect(lbAfter(Units.toKg(45), -1) == 40)
        #expect(lbAfter(Units.toKg(45), 2) == 55)
        #expect(lbAfter(1, -1) == 0)
        #expect(Units.stepped(20, by: 1, step: 2.5, unit: "kg", lb: false) == 22.5)
        #expect(Units.stepped(10, by: 1, step: 0.5, unit: "kph", lb: true) == 10.5)
    }

    @Test("tonnage: whole pounds with a thousands comma in lb; kg and tonnes otherwise")
    func tonnage() {
        #expect(Units.tonnage(850, lb: true) == "1,874 lb")
        #expect(Units.tonnage(200, lb: true) == "441 lb")
        #expect(Units.tonnage(850, lb: false) == "850 kg")
        #expect(Units.tonnage(1234, lb: false) == "1.2 t")
    }

    @Test("plates in lb: two places, and the plate text in lb")
    func plates() {
        #expect(Units.kitNumber(Units.toKg(1.25), lb: true) == "1.25")
        #expect(Units.kitNumber(Units.toKg(45), lb: true) == "45")
        let load = Plates.Load(bar: Units.toKg(45), perSide: [Units.toKg(45), Units.toKg(45), Units.toKg(10)], total: 0, exact: true)
        #expect(Plates.text(load, lb: true) == "45 lb bar + 2×45 + 10 per side")
        #expect(Plates.text(Plates.Load(bar: 20, perSide: [], total: 20, exact: true), lb: false) == "20 kg bar, no plates")
    }

    @Test("a load typed in lb is made exactly by lb plates kept in kg")
    func lbPlatesExact() {
        let lbKit = Equipment(barKg: Units.toKg(45), plates: [PlateCount(kg: Units.toKg(45), count: 2)])
        let p = Plates.plates(for: Units.toKg(135), lbKit)
        #expect(p.exact)
        #expect(p.perSide == [Units.toKg(45)])
        let bar = ExerciseRef(key: "bb_bench", name: "Bench", unit: "kg", step: 2.5)
        #expect(Plates.snap(Units.toKg(135), bar, lbKit, .up) == p.total)
    }

    @Test("units is a field the phone holds: a newer change here goes up, the server's newer one comes down")
    func prefs() {
        let here = PrefsMerge.Side(values: ["units": "imperial"], updatedAt: ["units": "2026-11-17T10:00:00.000Z"])
        let server: [String: Any] = ["units": "metric", "name": "Sam", "updatedAt": ["units": "2026-11-17T09:00:00.000Z"]]
        let m = PrefsMerge.merge(local: here, remote: PrefsMerge.remote(server))
        #expect(m.push)
        #expect(m.values["units"] as? String == "imperial")
        let row = PrefsMerge.row(existing: server, m)
        #expect(row["units"] as? String == "imperial")
        #expect((row["updatedAt"] as? [String: String])?["units"] == "2026-11-17T10:00:00.000Z")
        #expect(row["name"] as? String == "Sam")

        let older = PrefsMerge.Side(values: ["units": "imperial"], updatedAt: ["units": "2026-11-17T08:00:00.000Z"])
        #expect(PrefsMerge.merge(local: older, remote: PrefsMerge.remote(server)).values["units"] as? String == "metric")
    }

    @Test("the prefs JSON gives the phone its units; anything else reads as unset")
    func prefsRead() {
        #expect(Supabase.prefs(from: ["units": "imperial"]).units == "imperial")
        #expect(Supabase.prefs(from: ["units": "metric"]).units == "metric")
        #expect(Supabase.prefs(from: ["units": "stones"]).units == nil)
        #expect(Supabase.prefs(from: [:]).units == nil)
        #expect(Store.heldPrefs.contains("units"))
        #expect(!Store.heldPrefs.contains("avatar"))
    }
}
