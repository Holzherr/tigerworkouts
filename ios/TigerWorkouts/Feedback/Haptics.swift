import CoreHaptics
import UIKit

/// The thing the web app cannot do. iOS Safari has no Vibration API, so on the phone the PWA's
/// end-of-workout buzz is a silent no-op; here every transition has a shape you can feel through a
/// pocket without looking.
///
/// Haptics are a foreground-only API: with the screen locked the phone will not buzz whatever we
/// ask, which is why `Cues` carries the audio half of the same signal.
@MainActor
final class Haptics {
    static let shared = Haptics()

    enum Cue {
        /// The last three seconds of a countdown.
        case tick
        /// Work starts: two sharp taps, unmistakable mid-movement.
        case work
        /// Rest starts: one soft swell.
        case rest
        /// A block is done.
        case block
        /// The session is done: a long roll that finishes on a bang.
        case finish
    }

    private var engine: CHHapticEngine?
    private let supportsHaptics = CHHapticEngine.capabilitiesForHardware().supportsHaptics
    var enabled = true

    private init() {
        guard supportsHaptics else { return }
        engine = try? CHHapticEngine()
        // The engine is stopped whenever the app backgrounds or another app takes the hardware.
        engine?.resetHandler = { [weak self] in try? self?.engine?.start() }
        engine?.stoppedHandler = { _ in }
        try? engine?.start()
    }

    func play(_ cue: Cue) {
        guard enabled else { return }
        guard supportsHaptics, let engine else { return fallback(cue) }
        do {
            try engine.start()
            let pattern = try CHHapticPattern(events: events(for: cue), parameters: [])
            try engine.makePlayer(with: pattern).start(atTime: CHHapticTimeImmediate)
        } catch {
            fallback(cue)
        }
    }

    private func events(for cue: Cue) -> [CHHapticEvent] {
        func tap(_ at: TimeInterval, _ intensity: Float, _ sharpness: Float) -> CHHapticEvent {
            CHHapticEvent(eventType: .hapticTransient, parameters: [
                .init(parameterID: .hapticIntensity, value: intensity),
                .init(parameterID: .hapticSharpness, value: sharpness),
            ], relativeTime: at)
        }
        func roll(_ at: TimeInterval, _ duration: TimeInterval, _ intensity: Float, _ sharpness: Float) -> CHHapticEvent {
            CHHapticEvent(eventType: .hapticContinuous, parameters: [
                .init(parameterID: .hapticIntensity, value: intensity),
                .init(parameterID: .hapticSharpness, value: sharpness),
            ], relativeTime: at, duration: duration)
        }

        switch cue {
        case .tick:
            return [tap(0, 0.5, 0.7)]
        case .work:
            return [tap(0, 1, 0.9), tap(0.11, 1, 0.9)]
        case .rest:
            return [roll(0, 0.35, 0.55, 0.15)]
        case .block:
            return [tap(0, 0.8, 0.5), tap(0.13, 0.9, 0.6), tap(0.26, 1, 0.8)]
        case .finish:
            return [roll(0, 0.7, 0.9, 0.3), tap(0.75, 1, 1), tap(0.95, 1, 1), roll(1.05, 0.5, 1, 0.6)]
        }
    }

    /// Older phones, and the simulator, have no haptic engine — the system generators still buzz.
    private func fallback(_ cue: Cue) {
        switch cue {
        case .tick:
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        case .work:
            UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
        case .rest:
            UIImpactFeedbackGenerator(style: .soft).impactOccurred()
        case .block:
            UINotificationFeedbackGenerator().notificationOccurred(.warning)
        case .finish:
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        }
    }
}
