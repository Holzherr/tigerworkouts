import Foundation

/// What a − or + moves a number by, per exercise: the library's own step (2.5 kg on a barbell) until
/// one is picked on the exercise's sheet. Priyanka, 14 Nov 2026: her track is 20 m, and the load to
/// step by is hers to pick. Kept on the phone under `stepSizes` in UserDefaults.
enum StepSizes {
    static let storageKey = "stepSizes"

    enum Kind: String, Sendable { case load, meters }

    static let loadChoices: [Double] = [0.5, 1, 1.25, 2, 2.5, 4, 5, 10]
    static let meterChoices: [Double] = [5, 10, 20, 25, 50, 100, 200, 400]

    private static func id(_ key: String, _ kind: Kind) -> String { kind == .load ? key : "\(key):\(kind.rawValue)" }

    private static func all(_ defaults: UserDefaults) -> [String: Double] {
        (defaults.dictionary(forKey: storageKey) as? [String: Double]) ?? [:]
    }

    /// The step picked for this exercise, nil when none was.
    static func custom(_ key: String, _ kind: Kind, defaults: UserDefaults = .standard) -> Double? {
        all(defaults)[id(key, kind)]
    }

    /// Nil, zero or less goes back to the exercise's own step.
    static func set(_ value: Double?, for key: String, _ kind: Kind, defaults: UserDefaults = .standard) {
        var next = all(defaults)
        next[id(key, kind)] = value.flatMap { $0 > 0 ? $0 : nil }
        defaults.set(next, forKey: storageKey)
    }

    /// The load (or speed) step: the one picked, else the exercise's own, never zero.
    static func load(_ ex: ExerciseRef, defaults: UserDefaults = .standard) -> Double {
        custom(ex.key, .load, defaults: defaults) ?? (ex.step > 0 ? ex.step : 1)
    }

    /// The metres step: the one picked, else `fallback` (10 m on a distance, the machine's own on a
    /// timed piece).
    static func meters(_ ex: ExerciseRef, fallback: Double, defaults: UserDefaults = .standard) -> Double {
        custom(ex.key, .meters, defaults: defaults) ?? fallback
    }

    /// "2.5", "1.25", "20": a step or a typed number, up to two decimals.
    static func text(_ v: Double) -> String {
        let r = (v * 100).rounded() / 100
        if r == r.rounded() { return String(Int(r)) }
        return String(format: (r * 10).rounded() == r * 10 ? "%.1f" : "%.2f", r)
    }
}

/// Type a number instead of pressing − / + (Priyanka, 14 Nov 2026): a tap on the number opens a
/// numeric keypad. Decimals take a point or a comma; anything else is ignored.
enum NumberEntry {
    static func parse(_ text: String) -> Double? {
        let t = text.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: ".")
        guard let v = Double(t), v.isFinite, v >= 0 else { return nil }
        return v
    }
}
