import Foundation

/// The runsheet model, ported from `src/features/runsheet/model.ts`. A workout is an ordered list
/// of items; an item is a step (exercise or rest) or a block of steps that repeats N times.
/// Everything here is a value type, so the engine can hand new copies back up the way the TS does.

enum ForMode: String, Codable, Sendable {
    case seconds, reps, minutes, meters, calories, max, amrap, segment
}

enum ScoreType: String, Codable, Sendable {
    case time, rounds, reps, load, distance, none
}

enum ItemRole: String, Codable, Sendable {
    case warmup, main, cooldown

    var label: String {
        switch self {
        case .warmup: "Warm-up"
        case .main: "Workout"
        case .cooldown: "Cool-down"
        }
    }
}

enum BlockMode: String, Codable, Sendable {
    case rounds, fortime, amrap, emom, ladder
}

struct Rx: Codable, Hashable, Sendable {
    var men: Double?
    var women: Double?
}

struct Progression: Codable, Hashable, Sendable {
    var onSuccessKg: Double?
    var deloadPct: Double?
    var failAfter: Int?
    var amrapBumpAt: Int?
    var tmBumpKg: Double?
}

struct Source: Codable, Hashable, Sendable {
    var title: String = ""
    var url: String?
    var author: String?
    var kind: String = "user"
    var license: String?
    var importedAt: String?
}

struct Video: Codable, Hashable, Sendable {
    var provider: String?
    var id: String?
    var url: String?
}

struct ProgramRef: Codable, Hashable, Sendable {
    var name: String = ""
    var day: String = ""
    var order: Int?
}

/// One exercise as the library knows it. The export writes `exercise` as a key string; runsheets
/// written by the web app carry the whole object inline, so both decode.
struct ExerciseRef: Codable, Hashable, Sendable, Identifiable {
    var key: String
    var name: String
    var unit: String
    var step: Double
    var clip: String?
    var poster: String?
    var icon: String?
    var cue: String?

    var id: String { key }

    /// A stand-in for a key no library knows: "bb_thruster" reads as "thruster".
    static func placeholder(key: String) -> ExerciseRef {
        let name = key.replacingOccurrences(of: "^[a-z]+_", with: "", options: .regularExpression)
            .replacingOccurrences(of: "_", with: " ")
        return ExerciseRef(key: key, name: name.isEmpty ? key : name, unit: "", step: 1)
    }

    init(key: String, name: String, unit: String, step: Double, clip: String? = nil, poster: String? = nil, icon: String? = nil, cue: String? = nil) {
        self.key = key
        self.name = name
        self.unit = unit
        self.step = step
        self.clip = clip
        self.poster = poster
        self.icon = icon
        self.cue = cue
    }

    init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        key = try c.decodeIfPresent(String.self, forKey: .key) ?? ""
        name = try c.decodeIfPresent(String.self, forKey: .name) ?? ExerciseRef.placeholder(key: key).name
        unit = try c.decodeIfPresent(String.self, forKey: .unit) ?? ""
        step = try c.decodeIfPresent(Double.self, forKey: .step) ?? 1
        clip = try c.decodeIfPresent(String.self, forKey: .clip)
        poster = try c.decodeIfPresent(String.self, forKey: .poster)
        icon = try c.decodeIfPresent(String.self, forKey: .icon)
        cue = try c.decodeIfPresent(String.self, forKey: .cue)
    }
}

struct ExerciseStep: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var exercise: ExerciseRef
    var target: Double?
    var forMode: ForMode = .seconds
    var forValue: Double = 30
    var forMax: Double?
    var perSide: Bool?
    var loadFactor: Double?
    var targetPct: Double?
    var incline: Double?
    var rx: Rx?
    var startSeconds: Double?
    var endSeconds: Double?
    var ladderFactor: Double?
    var ladderFixed: Bool?
    var role: ItemRole?
    var note: String?

    private enum CodingKeys: String, CodingKey {
        case id, exercise, target, forMode, forValue, forMax, perSide, loadFactor, targetPct
        case incline, rx, startSeconds, endSeconds, ladderFactor, ladderFixed, role, note
    }

    init(id: String, exercise: ExerciseRef, target: Double? = nil, forMode: ForMode = .seconds, forValue: Double = 30, incline: Double? = nil, perSide: Bool? = nil) {
        self.id = id
        self.exercise = exercise
        self.target = target
        self.forMode = forMode
        self.forValue = forValue
        self.incline = incline
        self.perSide = perSide
    }

    init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(String.self, forKey: .id) ?? UUID().uuidString
        // A key string resolves against the bundled library; an inline object is used as written.
        if let key = try? c.decode(String.self, forKey: .exercise) {
            exercise = decoder.exerciseLibrary?[key] ?? ExerciseRef.placeholder(key: key)
        } else {
            exercise = try c.decode(ExerciseRef.self, forKey: .exercise)
        }
        target = try c.decodeIfPresent(Double.self, forKey: .target)
        forMode = try c.decodeIfPresent(ForMode.self, forKey: .forMode) ?? .seconds
        forValue = try c.decodeIfPresent(Double.self, forKey: .forValue) ?? 30
        forMax = try c.decodeIfPresent(Double.self, forKey: .forMax)
        perSide = try c.decodeIfPresent(Bool.self, forKey: .perSide)
        loadFactor = try c.decodeIfPresent(Double.self, forKey: .loadFactor)
        targetPct = try c.decodeIfPresent(Double.self, forKey: .targetPct)
        incline = try c.decodeIfPresent(Double.self, forKey: .incline)
        rx = try c.decodeIfPresent(Rx.self, forKey: .rx)
        startSeconds = try c.decodeIfPresent(Double.self, forKey: .startSeconds)
        endSeconds = try c.decodeIfPresent(Double.self, forKey: .endSeconds)
        ladderFactor = try c.decodeIfPresent(Double.self, forKey: .ladderFactor)
        ladderFixed = try c.decodeIfPresent(Bool.self, forKey: .ladderFixed)
        role = try c.decodeIfPresent(ItemRole.self, forKey: .role)
        note = try c.decodeIfPresent(String.self, forKey: .note)
    }

    func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(exercise, forKey: .exercise)
        try c.encodeIfPresent(target, forKey: .target)
        try c.encode(forMode, forKey: .forMode)
        try c.encode(forValue, forKey: .forValue)
        try c.encodeIfPresent(forMax, forKey: .forMax)
        try c.encodeIfPresent(perSide, forKey: .perSide)
        try c.encodeIfPresent(loadFactor, forKey: .loadFactor)
        try c.encodeIfPresent(targetPct, forKey: .targetPct)
        try c.encodeIfPresent(incline, forKey: .incline)
        try c.encodeIfPresent(rx, forKey: .rx)
        try c.encodeIfPresent(startSeconds, forKey: .startSeconds)
        try c.encodeIfPresent(endSeconds, forKey: .endSeconds)
        try c.encodeIfPresent(ladderFactor, forKey: .ladderFactor)
        try c.encodeIfPresent(ladderFixed, forKey: .ladderFixed)
        try c.encodeIfPresent(role, forKey: .role)
        try c.encodeIfPresent(note, forKey: .note)
    }
}

struct RestStep: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var seconds: Double
    var role: ItemRole?
    var note: String?

    init(id: String, seconds: Double, role: ItemRole? = nil, note: String? = nil) {
        self.id = id
        self.seconds = seconds
        self.role = role
        self.note = note
    }

    init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(String.self, forKey: .id) ?? UUID().uuidString
        seconds = try c.decodeIfPresent(Double.self, forKey: .seconds) ?? 30
        role = try c.decodeIfPresent(ItemRole.self, forKey: .role)
        note = try c.decodeIfPresent(String.self, forKey: .note)
    }
}

enum Step: Codable, Hashable, Sendable, Identifiable {
    case exercise(ExerciseStep)
    case rest(RestStep)

    var id: String {
        switch self {
        case .exercise(let s): s.id
        case .rest(let s): s.id
        }
    }

    var asExercise: ExerciseStep? {
        if case .exercise(let s) = self { return s }
        return nil
    }

    var role: ItemRole? {
        switch self {
        case .exercise(let s): s.role
        case .rest(let s): s.role
        }
    }

    private enum Discriminator: String, CodingKey { case kind }

    init(from decoder: any Decoder) throws {
        let k = try decoder.container(keyedBy: Discriminator.self)
        if try k.decodeIfPresent(String.self, forKey: .kind) == "rest" {
            self = .rest(try RestStep(from: decoder))
        } else {
            self = .exercise(try ExerciseStep(from: decoder))
        }
    }

    func encode(to encoder: any Encoder) throws {
        var k = encoder.container(keyedBy: Discriminator.self)
        switch self {
        case .exercise(let s):
            try k.encode("exercise", forKey: .kind)
            try s.encode(to: encoder)
        case .rest(let s):
            try k.encode("rest", forKey: .kind)
            try s.encode(to: encoder)
        }
    }
}

struct Block: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var name: String
    /// Rounds for rounds / fortime / emom. Ignored for amrap. `repeat` in the JSON.
    var repeatCount: Int = 1
    var mode: BlockMode?
    var timeCapSec: Double?
    var everySec: Double?
    var ladder: [Double]?
    var restBetweenSec: Double?
    var score: ScoreType?
    var progression: Progression?
    var role: ItemRole?
    var note: String?
    var steps: [Step] = []

    var runMode: BlockMode { mode ?? .rounds }

    private enum CodingKeys: String, CodingKey {
        case id, name, mode, timeCapSec, everySec, ladder, restBetweenSec, score, progression, role, note, steps
        case repeatCount = "repeat"
    }

    init(id: String, name: String, repeatCount: Int = 1, mode: BlockMode? = nil, steps: [Step] = [], restBetweenSec: Double? = nil, timeCapSec: Double? = nil, everySec: Double? = nil, ladder: [Double]? = nil) {
        self.id = id
        self.name = name
        self.repeatCount = repeatCount
        self.mode = mode
        self.steps = steps
        self.restBetweenSec = restBetweenSec
        self.timeCapSec = timeCapSec
        self.everySec = everySec
        self.ladder = ladder
    }

    init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(String.self, forKey: .id) ?? UUID().uuidString
        name = try c.decodeIfPresent(String.self, forKey: .name) ?? "Block"
        repeatCount = try c.decodeIfPresent(Int.self, forKey: .repeatCount) ?? 1
        mode = try c.decodeIfPresent(BlockMode.self, forKey: .mode)
        timeCapSec = try c.decodeIfPresent(Double.self, forKey: .timeCapSec)
        everySec = try c.decodeIfPresent(Double.self, forKey: .everySec)
        ladder = try c.decodeIfPresent([Double].self, forKey: .ladder)
        restBetweenSec = try c.decodeIfPresent(Double.self, forKey: .restBetweenSec)
        score = try c.decodeIfPresent(ScoreType.self, forKey: .score)
        progression = try c.decodeIfPresent(Progression.self, forKey: .progression)
        role = try c.decodeIfPresent(ItemRole.self, forKey: .role)
        note = try c.decodeIfPresent(String.self, forKey: .note)
        steps = try c.decodeIfPresent([Step].self, forKey: .steps) ?? []
    }
}

struct RefItem: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var runsheetId: String
    var role: ItemRole?
}

enum Item: Codable, Hashable, Sendable, Identifiable {
    case step(Step)
    case block(Block)
    case ref(RefItem)

    var id: String {
        switch self {
        case .step(let s): s.id
        case .block(let b): b.id
        case .ref(let r): r.id
        }
    }

    var asBlock: Block? {
        if case .block(let b) = self { return b }
        return nil
    }

    var asStep: Step? {
        if case .step(let s) = self { return s }
        return nil
    }

    var role: ItemRole? {
        switch self {
        case .step(let s): s.role
        case .block(let b): b.role
        case .ref(let r): r.role
        }
    }

    private enum Discriminator: String, CodingKey { case kind }

    init(from decoder: any Decoder) throws {
        let k = try decoder.container(keyedBy: Discriminator.self)
        switch try k.decodeIfPresent(String.self, forKey: .kind) {
        case "block": self = .block(try Block(from: decoder))
        case "ref": self = .ref(try RefItem(from: decoder))
        default: self = .step(try Step(from: decoder))
        }
    }

    func encode(to encoder: any Encoder) throws {
        switch self {
        case .step(let s):
            try s.encode(to: encoder)
        case .block(let b):
            var k = encoder.container(keyedBy: Discriminator.self)
            try k.encode("block", forKey: .kind)
            try b.encode(to: encoder)
        case .ref(let r):
            var k = encoder.container(keyedBy: Discriminator.self)
            try k.encode("ref", forKey: .kind)
            try r.encode(to: encoder)
        }
    }
}

struct Runsheet: Codable, Hashable, Sendable, Identifiable {
    var id: String?
    var title: String
    var creator: String?
    var description: String?
    var source: Source?
    var tags: [String]?
    var level: String?
    var program: ProgramRef?
    var timeCapSec: Double?
    var score: ScoreType?
    var progression: Progression?
    var video: Video?
    /// Your own workouts only: true shows it in everyone's Discover. New ones start private.
    /// `public` in the JSON, as the web app writes it.
    var isPublic: Bool?
    /// Set on your own version of someone else's workout: the id it was made from.
    var derivedFrom: String?
    var items: [Item] = []

    /// Stable identity for lists: the id if it has one, else the title.
    var key: String { id ?? title }

    private enum CodingKeys: String, CodingKey {
        case id, title, creator, description, source, tags, level, program, timeCapSec, score, progression, video, derivedFrom, items
        case isPublic = "public"
    }

    init(id: String? = nil, title: String, creator: String? = nil, items: [Item] = [], timeCapSec: Double? = nil, score: ScoreType? = nil) {
        self.id = id
        self.title = title
        self.creator = creator
        self.items = items
        self.timeCapSec = timeCapSec
        self.score = score
    }

    init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(String.self, forKey: .id)
        title = try c.decodeIfPresent(String.self, forKey: .title) ?? "Workout"
        creator = try c.decodeIfPresent(String.self, forKey: .creator)
        description = try c.decodeIfPresent(String.self, forKey: .description)
        source = try c.decodeIfPresent(Source.self, forKey: .source)
        tags = try c.decodeIfPresent([String].self, forKey: .tags)
        level = try c.decodeIfPresent(String.self, forKey: .level)
        program = try c.decodeIfPresent(ProgramRef.self, forKey: .program)
        timeCapSec = try c.decodeIfPresent(Double.self, forKey: .timeCapSec)
        score = try c.decodeIfPresent(ScoreType.self, forKey: .score)
        progression = try c.decodeIfPresent(Progression.self, forKey: .progression)
        video = try c.decodeIfPresent(Video.self, forKey: .video)
        isPublic = try c.decodeIfPresent(Bool.self, forKey: .isPublic)
        derivedFrom = try c.decodeIfPresent(String.self, forKey: .derivedFrom)
        items = try c.decodeIfPresent([Item].self, forKey: .items) ?? []
    }
}

// MARK: - Library injection

extension CodingUserInfoKey {
    static let exerciseLibrary = CodingUserInfoKey(rawValue: "tiger.exerciseLibrary")!
}

extension Decoder {
    var exerciseLibrary: [String: ExerciseRef]? {
        userInfo[.exerciseLibrary] as? [String: ExerciseRef]
    }
}
