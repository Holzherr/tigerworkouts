import Foundation

/// `user_state.prefs`, shared with the web app. Each field carries the time it was last changed
/// (`prefs.updatedAt[field]`), and a sync takes the newer side field by field — a field cleared
/// on one device included, so an unsaved workout, emptied equipment or a removed training max
/// stays gone instead of coming back from the other. A field neither side stamped (written before
/// stamps) takes the server's value, else this device's. The port of `src/features/cloud/prefs.ts`.
///
/// Name, avatar and units are the web's. This app never stamps or holds them, so the server's
/// always win and are written back untouched.
enum PrefsMerge {
    static let fields = ["saved", "trainingMaxes", "bodyweightKg", "equipment", "name", "avatar", "units"]

    struct Side {
        /// JSON values by field; a missing key is an empty field.
        var values: [String: Any] = [:]
        /// ISO 8601 times by field.
        var updatedAt: [String: String] = [:]
    }

    struct Merged {
        var values: [String: Any]
        var updatedAt: [String: String]
        /// This device has something newer than the server: write it back.
        var push: Bool
    }

    private static func blank(_ v: Any?) -> Bool { v == nil || v is NSNull }

    /// Two JSON values compared by their serialised form, keys sorted.
    static func same(_ a: Any?, _ b: Any?) -> Bool {
        if blank(a) || blank(b) { return blank(a) && blank(b) }
        func text(_ v: Any) -> Data? {
            JSONSerialization.isValidJSONObject([v]) ? try? JSONSerialization.data(withJSONObject: [v], options: .sortedKeys) : nil
        }
        return text(a!) == text(b!)
    }

    static func merge(local: Side, remote: Side) -> Merged {
        var values: [String: Any] = [:]
        var stamps: [String: String] = [:]
        var push = false
        for f in fields {
            let lt = local.updatedAt[f] ?? ""
            let rt = remote.updatedAt[f] ?? ""
            let lv = blank(local.values[f]) ? nil : local.values[f]
            let rv = blank(remote.values[f]) ? nil : remote.values[f]
            let v: Any?
            if lt > rt {
                v = lv
                stamps[f] = lt
            } else if !rt.isEmpty {
                v = rv
                stamps[f] = rt
            } else {
                v = rv ?? lv
            }
            if let v { values[f] = v }
            if !same(v, rv) || (stamps[f] ?? "") != rt { push = true }
        }
        return Merged(values: values, updatedAt: stamps, push: push)
    }

    /// The server's prefs JSON as one side of the merge.
    static func remote(_ prefs: [String: Any]) -> Side {
        var side = Side()
        for f in fields where !blank(prefs[f]) { side.values[f] = prefs[f] }
        side.updatedAt = (prefs["updatedAt"] as? [String: String]) ?? [:]
        return side
    }

    /// The row as written: everything else on it kept, cleared fields as null.
    static func row(existing: [String: Any], _ m: Merged) -> [String: Any] {
        var out = existing
        for f in fields { out[f] = m.values[f] ?? NSNull() }
        out["updatedAt"] = m.updatedAt
        return out
    }

    static func stamp(_ date: Date = Date()) -> String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.string(from: date)
    }
}
