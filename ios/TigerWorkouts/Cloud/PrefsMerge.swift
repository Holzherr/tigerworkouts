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
    static let fields = ["saved", "trainingMaxes", "bodyweightKg", "equipment", "suggestions", "name", "avatar", "units"]

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

    /// The row as written: everything else on it kept, cleared fields as null. Stamps of fields
    /// this app does not know (a newer build's or the web's) are kept too, so they keep winning.
    static func row(existing: [String: Any], _ m: Merged) -> [String: Any] {
        var out = existing
        for f in fields { out[f] = m.values[f] ?? NSNull() }
        var stamps = (existing["updatedAt"] as? [String: String] ?? [:]).filter { !fields.contains($0.key) }
        stamps.merge(m.updatedAt) { _, new in new }
        out["updatedAt"] = stamps
        return out
    }

    static func stamp(_ date: Date = Date()) -> String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.string(from: date)
    }
}

/// A phone's edit of a workout against a newer copy on the server (review D14, 15 Nov 2026). The
/// phone uploads only while the server's row is as it last saw it; otherwise it pulls and merges
/// here: what only one side changed since the copy both started from is kept, and where both
/// changed the same thing the newer edit wins.
enum WorkoutMerge {
    /// `base` is the copy this phone last pulled, which its edit was made on; nil when it never
    /// pulled one, and then the newer side is taken whole. `localNewer`: the phone's edit was made
    /// after the server's row last changed.
    static func merge(base: Runsheet?, local: Runsheet, remote: Runsheet, localNewer: Bool) -> Runsheet {
        guard let base else { return localNewer ? local : remote }
        // Everything but the items, as one thing: the name, the description, the credit.
        func bare(_ r: Runsheet) -> Runsheet { var r = r; r.items = []; return r }
        var out: Runsheet = switch (bare(local) != bare(base), bare(remote) != bare(base)) {
        case (true, true): localNewer ? local : remote
        case (true, false): local
        default: remote
        }
        out.items = items(base: base.items, local: local.items, remote: remote.items, localNewer: localNewer)
        return out
    }

    /// Blocks and loose steps by id. The list follows the side that added, removed or moved items
    /// (the newer one when both did); each item is the side's that changed it.
    private static func items(base: [Item], local: [Item], remote: [Item], localNewer: Bool) -> [Item] {
        let b = Dictionary(base.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        let l = Dictionary(local.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        let r = Dictionary(remote.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        let localMoved = local.map(\.id) != base.map(\.id)
        let remoteMoved = remote.map(\.id) != base.map(\.id)
        let followLocal = localMoved && (!remoteMoved || localNewer)
        let (lead, other) = followLocal ? (local, remote) : (remote, local)
        let (mine, theirs) = followLocal ? (l, r) : (r, l)
        func pick(_ id: String) -> Item? {
            switch (l[id], r[id]) {
            case let (x?, y?):
                if x == y || y == b[id] { return x }
                if x == b[id] { return y }
                return localNewer ? x : y
            // On one side only: new there, or removed on the other. A removal stands unless the
            // item was changed where it still is.
            case let (x?, nil): return b[id] == nil || x != b[id] ? x : nil
            case let (nil, y?): return b[id] == nil || y != b[id] ? y : nil
            case (nil, nil): return nil
            }
        }
        var out = lead.compactMap { pick($0.id) }
        // What the other side has and the leading list does not: added there, at the end.
        out += other.filter { mine[$0.id] == nil && theirs[$0.id] != nil }.compactMap { pick($0.id) }
        return out
    }
}

/// What this app does not model in a workout's JSON, kept through an edit: the `data` as last
/// pulled, less what decoding and encoding it again gives, is what the model dropped, and that is
/// put back on the way up. An Instagram import's credit (`source.handle`, `source.platform`) and
/// its place in the approval queue (`source.review`) went missing this way (review D14). A field
/// the model knows and the edit removed stays removed.
enum Passthrough {
    static func carried(from raw: JSONValue, into encoded: [String: Any]) -> [String: Any] {
        guard let data = try? JSONEncoder().encode(raw),
              let was = try? JSONSerialization.jsonObject(with: data),
              let sheet = try? Library.shared.decoder.decode(Runsheet.self, from: data),
              let kept = try? JSONSerialization.jsonObject(with: JSONEncoder().encode(sheet)) else { return encoded }
        return carry(raw: was, kept: kept, into: encoded) as? [String: Any] ?? encoded
    }

    /// `out` with the keys `raw` has and its round trip `kept` lost. Objects by key; lists item by
    /// item, matched by `id` where the items have one, else by position when nothing was added or
    /// removed.
    static func carry(raw: Any, kept: Any, into out: Any) -> Any {
        if let raw = raw as? [String: Any], let kept = kept as? [String: Any], var out = out as? [String: Any] {
            // Another thing under the same name (a step given a different exercise): nothing of
            // the old one belongs on it.
            for name in ["id", "key"] {
                if let was = raw[name] as? String, let now = out[name] as? String, was != now { return out }
            }
            for (key, value) in raw {
                if kept[key] == nil {
                    if out[key] == nil { out[key] = value }
                } else if let now = out[key] {
                    out[key] = carry(raw: value, kept: kept[key]!, into: now)
                }
            }
            return out
        }
        if let raw = raw as? [Any], let kept = kept as? [Any], let out = out as? [Any], raw.count == kept.count {
            func id(_ x: Any) -> String? { (x as? [String: Any])?["id"] as? String }
            let byId = Dictionary(raw.indices.compactMap { i in id(raw[i]).map { ($0, i) } }, uniquingKeysWith: { a, _ in a })
            return out.enumerated().map { i, item -> Any in
                if let key = id(item) {
                    guard let at = byId[key] else { return item }
                    return carry(raw: raw[at], kept: kept[at], into: item)
                }
                return raw.count == out.count && id(raw[i]) == nil ? carry(raw: raw[i], kept: kept[i], into: item) : item
            }
        }
        return out
    }
}
