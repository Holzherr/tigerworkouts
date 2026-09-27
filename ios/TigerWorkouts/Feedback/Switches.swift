import Foundation

/// The gym switches on the Me tab. The things they switch read them when they are created, so a
/// phone set to silent is silent from the first workout, not from the first visit to Me — that tab
/// was the only place they were ever applied.
enum Switches {
    static let haptics = "haptics"
    static let sound = "sound"
    static let liveActivity = "liveActivity"

    /// On unless switched off: a switch never touched has no stored value.
    static func isOn(_ key: String, in defaults: UserDefaults = .standard) -> Bool {
        defaults.object(forKey: key) as? Bool ?? true
    }
}
