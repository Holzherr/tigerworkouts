import Foundation

/// Settings vs a new setup (specs/workout-settings.md), ported from
/// `src/features/runsheet/settings.ts` one for one.
///
/// A setting is a number on a workout you do: the weight or speed, incline, reps or seconds, a
/// rest's length, a block's rounds or its AMRAP minutes. It is saved as *your settings for that
/// workout*, keyed by workout id and step (or block) id, and never changes the workout itself.
///
/// Anything else — adding, removing or reordering, grouping, swapping an exercise for good,
/// renaming — is a new setup: on your own workout it saves in place, on anyone else's it becomes
/// your own version (private, `derivedFrom` the original).

struct StepSetting: Codable, Hashable, Sendable {
    /// Weight or speed, in the exercise's own unit.
    var target: Double?
    var incline: Double?
    /// Reps, seconds, minutes, metres or calories — whatever the step's forMode counts.
    var forValue: Double?
    /// A rest's length.
    var seconds: Double?
    /// When it was set, so a session done after it can win (see `Settings.withLastUsed`).
    var at: String = ""

    var isEmpty: Bool { target == nil && incline == nil && forValue == nil && seconds == nil }

    init(target: Double? = nil, incline: Double? = nil, forValue: Double? = nil, seconds: Double? = nil, at: String = "") {
        self.target = target
        self.incline = incline
        self.forValue = forValue
        self.seconds = seconds
        self.at = at
    }

    init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        target = try c.decodeIfPresent(Double.self, forKey: .target)
        incline = try c.decodeIfPresent(Double.self, forKey: .incline)
        forValue = try c.decodeIfPresent(Double.self, forKey: .forValue)
        seconds = try c.decodeIfPresent(Double.self, forKey: .seconds)
        at = try c.decodeIfPresent(String.self, forKey: .at) ?? ""
    }
}

struct BlockSetting: Codable, Hashable, Sendable {
    var repeatCount: Int?
    /// AMRAP length or a for-time cap.
    var timeCapSec: Double?
    var everySec: Double?
    var restBetweenSec: Double?

    var isEmpty: Bool { repeatCount == nil && timeCapSec == nil && everySec == nil && restBetweenSec == nil }

    private enum CodingKeys: String, CodingKey {
        case timeCapSec, everySec, restBetweenSec
        case repeatCount = "repeat"
    }
}

struct WorkoutSettings: Codable, Hashable, Sendable {
    /// Newest write wins when two devices disagree. An entry with nothing in it is a reset.
    var updatedAt: String
    var steps: [String: StepSetting] = [:]
    var blocks: [String: BlockSetting] = [:]

    var hasAny: Bool { !steps.isEmpty || !blocks.isEmpty }

    init(updatedAt: String, steps: [String: StepSetting] = [:], blocks: [String: BlockSetting] = [:]) {
        self.updatedAt = updatedAt
        self.steps = steps
        self.blocks = blocks
    }

    init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        updatedAt = try c.decodeIfPresent(String.self, forKey: .updatedAt) ?? ""
        steps = try c.decodeIfPresent([String: StepSetting].self, forKey: .steps) ?? [:]
        blocks = try c.decodeIfPresent([String: BlockSetting].self, forKey: .blocks) ?? [:]
    }
}

struct SettingsChange: Hashable, Sendable {
    var steps: [String: StepSetting] = [:]
    var blocks: [String: BlockSetting] = [:]

    var isEmpty: Bool { steps.isEmpty && blocks.isEmpty }
}

enum EditKind: String, Sendable {
    case none, settings, structure
}

extension Settings {
    /// The workout with every setting taken out: two workouts with the same shape differ only in numbers.
    static func shape(_ r: Runsheet) -> Runsheet {
        func step(_ s: Step) -> Step {
            switch s {
            case .rest(var rest):
                rest.seconds = 0
                return .rest(rest)
            case .exercise(var e):
                e.target = nil
                e.incline = nil
                e.forValue = 0
                return .exercise(e)
            }
        }
        var out = r
        out.isPublic = nil
        out.items = r.items.map { item in
            switch item {
            case .block(var b):
                b.repeatCount = 0
                b.timeCapSec = nil
                b.everySec = nil
                b.restBetweenSec = nil
                b.steps = b.steps.map(step)
                return .block(b)
            case .step(let s):
                return .step(step(s))
            case .ref:
                return item
            }
        }
        return out
    }

    /// What an edit was: nothing, numbers only, or a change to the workout itself.
    static func classify(_ before: Runsheet, _ after: Runsheet) -> EditKind {
        if shape(before) != shape(after) { return .structure }
        return change(before, after).isEmpty ? .none : .settings
    }

    /// The numbers that differ between two runsheets of the same shape, by step and block id.
    static func change(_ before: Runsheet, _ after: Runsheet) -> SettingsChange {
        var out = SettingsChange()
        let was = Dictionary(steps(before).map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        for s in steps(after) {
            switch (s, was[s.id]) {
            case (.rest(let now), .rest(let then)?):
                if now.seconds != then.seconds { out.steps[s.id] = StepSetting(seconds: now.seconds) }
            case (.exercise(let now), .exercise(let then)?) where now.exercise.key == then.exercise.key:
                var v = StepSetting()
                if now.target != then.target, let t = now.target { v.target = t }
                if now.incline != then.incline, let i = now.incline { v.incline = i }
                if now.forValue != then.forValue { v.forValue = now.forValue }
                if !v.isEmpty { out.steps[s.id] = v }
            default:
                continue
            }
        }
        let wasBlock = Dictionary(before.items.compactMap(\.asBlock).map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        for b in after.items.compactMap(\.asBlock) {
            guard let o = wasBlock[b.id] else { continue }
            var v = BlockSetting()
            if b.repeatCount != o.repeatCount { v.repeatCount = b.repeatCount }
            if b.timeCapSec != o.timeCapSec, let t = b.timeCapSec { v.timeCapSec = t }
            if b.everySec != o.everySec, let e = b.everySec { v.everySec = e }
            if b.restBetweenSec != o.restBetweenSec, let r = b.restBetweenSec { v.restBetweenSec = r }
            if !v.isEmpty { out.blocks[b.id] = v }
        }
        return out
    }

    /// Fold a change into what was saved; a field set again is overwritten, the rest stay.
    static func with(_ ws: WorkoutSettings?, _ change: SettingsChange, at: String) -> WorkoutSettings {
        var steps = ws?.steps ?? [:]
        for (id, v) in change.steps {
            var s = steps[id] ?? StepSetting()
            if let t = v.target { s.target = t }
            if let i = v.incline { s.incline = i }
            if let f = v.forValue { s.forValue = f }
            if let sec = v.seconds { s.seconds = sec }
            s.at = at
            steps[id] = s
        }
        var blocks = ws?.blocks ?? [:]
        for (id, v) in change.blocks {
            var b = blocks[id] ?? BlockSetting()
            if let r = v.repeatCount { b.repeatCount = r }
            if let t = v.timeCapSec { b.timeCapSec = t }
            if let e = v.everySec { b.everySec = e }
            if let r = v.restBetweenSec { b.restBetweenSec = r }
            blocks[id] = b
        }
        return WorkoutSettings(updatedAt: at, steps: steps, blocks: blocks)
    }

    /// "Reset to original": an empty entry, kept so the reset reaches your other devices.
    static func cleared(at: String) -> WorkoutSettings {
        WorkoutSettings(updatedAt: at)
    }

    /// Two devices' settings: per workout, the newer write wins.
    static func merge(_ a: [String: WorkoutSettings], _ b: [String: WorkoutSettings]) -> [String: WorkoutSettings] {
        var out = a
        for (id, v) in b {
            guard let mine = out[id] else { out[id] = v; continue }
            if (ISO8601.date(v.updatedAt) ?? .distantPast) > (ISO8601.date(mine.updatedAt) ?? .distantPast) { out[id] = v }
        }
        return out
    }

    /// The workout with your settings on it. Rest lengths, reps and block rounds come only from
    /// here; weight, speed and incline also come from what you used last time — `withLastUsed`
    /// decides between them.
    static func apply(_ r: Runsheet, _ ws: WorkoutSettings?) -> Runsheet {
        guard let ws, ws.hasAny else { return r }
        func step(_ s: Step) -> Step {
            guard let v = ws.steps[s.id] else { return s }
            switch s {
            case .rest(var rest):
                if let sec = v.seconds { rest.seconds = sec }
                return .rest(rest)
            case .exercise(var e):
                if let t = v.target { e.target = t }
                if let i = v.incline { e.incline = i }
                if let f = v.forValue { e.forValue = f }
                return .exercise(e)
            }
        }
        var out = r
        out.items = r.items.map { item in
            switch item {
            case .block(var b):
                if let v = ws.blocks[b.id] {
                    if let n = v.repeatCount { b.repeatCount = n }
                    if let t = v.timeCapSec { b.timeCapSec = t }
                    if let e = v.everySec { b.everySec = e }
                    if let r = v.restBetweenSec { b.restBetweenSec = r }
                }
                b.steps = b.steps.map(step)
                return .block(b)
            case .step(let s):
                return .step(step(s))
            case .ref:
                return item
            }
        }
        return out
    }

    /// A new setup on a workout you do not own: your own version of it, private until you share it.
    /// `r` is what you were looking at — your numbers are in it, so the new version starts from them.
    static func newVersion(_ r: Runsheet, of original: Runsheet, id: String, creator: String?) -> Runsheet {
        var v = r
        v.id = id
        v.title = r.title == original.title ? "\(original.title) (mine)" : r.title
        v.creator = creator
        v.source = Source(title: original.title, url: original.source?.url, author: original.source?.author ?? original.creator, kind: "user")
        v.program = nil
        v.derivedFrom = original.id ?? original.title
        v.isPublic = false
        return v
    }

    private static func steps(_ r: Runsheet) -> [Step] {
        r.items.flatMap { item -> [Step] in
            switch item {
            case .block(let b): b.steps
            case .step(let s): [s]
            case .ref: []
            }
        }
    }
}
