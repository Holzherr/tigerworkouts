import Foundation
import Observation

/// Whether weights show in kg or lb (review round 2 U11, 17 Nov 2026). The store holds the synced
/// pref (`user_state.prefs.units`, "metric" | "imperial") and mirrors it here, so a view that reads
/// `Units.lb` draws again when it changes.
@Observable
final class UnitSetting {
    static let shared = UnitSetting()
    var lb = UserDefaults.standard.string(forKey: Units.storageKey) == Units.imperial
}

/// Pounds as a display unit. Everything stored stays in kg: a load is shown in lb and a typed or
/// stepped one goes back to kg. Speed, distance and time are never converted. The same rules as
/// `src/features/units` on the web, so both show the same number.
enum Units {
    static let storageKey = "units"
    static let metric = "metric"
    static let imperial = "imperial"
    /// 1 kg in lb.
    static let LB = 2.20462262

    static var lb: Bool { UnitSetting.shared.lb }

    /// The pref value (nil is the default, kg) mirrored for the engine and the views.
    static func apply(_ value: String?, _ defaults: UserDefaults = .standard) {
        defaults.set(value, forKey: storageKey)
        let on = value == imperial
        if UnitSetting.shared.lb != on { UnitSetting.shared.lb = on }
    }

    /// The word for a weight: "kg" or "lb".
    static func word(lb: Bool = Units.lb) -> String { lb ? "lb" : "kg" }

    // MARK: - Exercise units

    /// An exercise unit that is a weight: "kg", "kg per arm".
    static func isWeight(_ unit: String?) -> Bool { unit?.lowercased().hasPrefix("kg") ?? false }

    /// The unit as shown: "kg per arm" → "lb per arm" in lb; anything else as it is.
    static func unit(_ unit: String, lb: Bool = Units.lb) -> String {
        lb && isWeight(unit) ? "lb" + unit.dropFirst(2) : unit
    }

    /// A stored value of this unit as shown: kg → lb, rounded to 0.1. Anything not a weight as it is.
    static func shown(_ value: Double, unit: String?, lb: Bool = Units.lb) -> Double {
        lb && isWeight(unit) ? toLb(value) : value
    }

    /// A shown (typed or stepped) value of this unit as stored: lb → kg to 3 places.
    static func stored(_ value: Double, unit: String?, lb: Bool = Units.lb) -> Double {
        lb && isWeight(unit) ? toKg(value) : value
    }

    /// "44.1", "95": the number as shown.
    static func number(_ value: Double, unit: String?, lb: Bool = Units.lb) -> String {
        Format.number(shown(value, unit: unit, lb: lb))
    }

    /// "95 lb", "43 kg", "10 kph", "12" for a bodyweight move.
    static func label(_ value: Double, unit: String, lb: Bool = Units.lb) -> String {
        let u = Units.unit(unit, lb: lb)
        return u.isEmpty ? number(value, unit: unit, lb: lb) : "\(number(value, unit: unit, lb: lb)) \(u)"
    }

    // MARK: - Plain weights (bodyweight, plates, training maxes)

    static func toLb(_ kg: Double) -> Double { (kg * LB * 10).rounded() / 10 }
    static func toKg(_ lb: Double) -> Double { (lb / LB * 1000).rounded() / 1000 }

    /// A kg weight as shown: "95 lb" or "43 kg".
    static func weight(_ kg: Double, lb: Bool = Units.lb) -> String { "\(weightNumber(kg, lb: lb)) \(word(lb: lb))" }
    static func weightNumber(_ kg: Double, lb: Bool = Units.lb) -> String { Format.number(lb ? toLb(kg) : kg) }
    /// To the whole kg or lb: "80 kg", "176 lb".
    static func wholeWeight(_ kg: Double, lb: Bool = Units.lb) -> String { "\(Format.whole(lb ? kg * LB : kg)) \(word(lb: lb))" }

    // MARK: - Steps

    /// The lb step for a kg step (the library's, or the one picked): 2.5 kg → 5 lb.
    static func lbStep(_ kgStep: Double) -> Double {
        switch kgStep {
        case ...0.5: 1
        case ...1: 2
        case ...1.25: 2.5
        case ...2.5: 5
        case ...5: 10
        case ...10: 20
        default: max(5, (kgStep * LB / 5).rounded() * 5)
        }
    }

    /// Load step sizes offered on an exercise's sheet in lb; each saved as kg so `lbStep` gives it back.
    static let lbStepChoices: [Double] = [1, 2, 2.5, 5, 10, 20, 25]

    /// The step as shown with a stored kg step: the lb step in lb.
    static func step(_ kgStep: Double, unit: String?, lb: Bool = Units.lb) -> Double {
        lb && isWeight(unit) ? lbStep(kgStep) : kgStep
    }

    /// A stored value after `presses` presses of + (or − when negative) of a stored `step`. In lb it
    /// snaps to the lb step: 44.1 + 5 → 45, 45 + 5 → 50, 44.1 − 5 → 40. Never below zero.
    static func stepped(_ value: Double, by presses: Double, step: Double, unit: String?, lb: Bool = Units.lb) -> Double {
        guard lb && isWeight(unit) else { return max(0, value + presses * step) }
        let s = lbStep(step)
        let at = toLb(value) / s
        let next = presses > 0 ? ((at + 1e-9).rounded(.down) + presses) * s : ((at - 1e-9).rounded(.up) + presses) * s
        return toKg(max(0, next))
    }

    // MARK: - Equipment

    static let lbBar = 45.0
    static let lbPlateSizes: [Double] = [55, 45, 35, 25, 15, 10, 5, 2.5, 1.25]
    static let lbDumbbellSizes: [Double] = [2.5, 5, 7.5, 10, 12.5] + stride(from: 15.0, through: 120, by: 5)
    static let lbKettlebellSizes: [Double] = [10, 15, 20, 25, 30, 35, 40, 45, 50, 53, 60, 70, 80, 88, 97, 106]
    static let lbDefaultPlates: [(lb: Double, count: Int)] = [(45, 8), (35, 4), (25, 4), (10, 8), (5, 4), (2.5, 4)]

    /// A plate or bell as shown: two places in lb, so 1.25 lb is not 1.3.
    static func kitNumber(_ kg: Double, lb: Bool = Units.lb) -> String {
        Plates.num(lb ? (kg * LB * 100).rounded() / 100 : kg)
    }

    // MARK: - Tonnage

    /// Volume moved: "850 kg", "1.2 t"; in lb "1,874 lb", whole pounds.
    static func tonnage(_ kg: Double, lb: Bool = Units.lb) -> String {
        let a = abs(kg)
        if lb { return "\(grouped(Format.whole(a * LB))) lb" }
        return a >= 1000 ? "\(Format.number((a / 100).rounded() / 10)) t" : "\(Int(a.rounded())) kg"
    }

    /// 1874 → "1,874".
    static func grouped(_ n: Int) -> String {
        let digits = String(abs(n))
        var out = ""
        for (i, c) in digits.enumerated() {
            if i > 0 && (digits.count - i) % 3 == 0 { out += "," }
            out.append(c)
        }
        return (n < 0 ? "-" : "") + out
    }
}

extension ExerciseStep {
    /// The unit as shown: "lb" for a weight in lb.
    var shownUnit: String { Units.unit(shortUnit) }
    /// A stored target or load as shown with its unit: "95 lb", "43 kg", "10 kph", "12".
    func loadText(_ v: Double) -> String { Units.label(v, unit: shortUnit) }
    /// A stored target or load as a shown number.
    func loadNumber(_ v: Double) -> String { Units.number(v, unit: shortUnit) }
}
