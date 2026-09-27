import Foundation

/// What the Up next widget draws, written by the app into the App Group container whenever results
/// or workouts change. The widget cannot read the app's cache or catalogue, so it gets the answer
/// rather than the inputs: which workout, why, and the dates it needs to count this week itself —
/// a count written on Sunday would still say 3 on Monday morning.
struct UpNextSnapshot: Codable, Hashable {
    /// Nil with no history: the widget then says "Pick a workout" rather than guessing.
    var workoutId: String?
    var title: String?
    /// "Next in StrongLifts 5×5", "Your last workout".
    var reason: String?
    /// "45 min · Day B".
    var detail: String?
    /// When each session of the last few weeks started.
    var sessions: [Date] = []

    /// The same week the app's streak counts: Monday to Sunday.
    func thisWeek(now: Date = Date()) -> Int {
        let start = Calendar.iso8601Monday.dateInterval(of: .weekOfYear, for: now)?.start ?? now
        return sessions.filter { $0 >= start && $0 <= now }.count
    }

    /// The workout page, where Start is one tap; the app's front door when there is nothing to open.
    var url: URL {
        guard let workoutId, let id = workoutId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) else {
            return URL(string: "tigerworkouts://")!
        }
        return URL(string: "tigerworkouts://w/\(id)")!
    }
}

enum UpNextShare {
    static let group = "group.com.holzherr.tigerworkouts"
    static let kind = "up-next"
    private static let key = "up-next"

    private static var defaults: UserDefaults? { UserDefaults(suiteName: group) }

    static func read() -> UpNextSnapshot? {
        guard let data = defaults?.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(UpNextSnapshot.self, from: data)
    }

    /// True when it changed, so the caller only asks WidgetKit to redraw when there is something new.
    @discardableResult
    static func write(_ snapshot: UpNextSnapshot) -> Bool {
        guard let defaults, read() != snapshot, let data = try? JSONEncoder().encode(snapshot) else { return false }
        defaults.set(data, forKey: key)
        return true
    }
}

extension Calendar {
    /// Weeks start on Monday, the way the web app's streak counts them.
    static let iso8601Monday: Calendar = {
        var c = Calendar(identifier: .iso8601)
        c.firstWeekday = 2
        return c
    }()
}
