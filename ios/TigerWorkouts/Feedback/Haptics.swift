import AudioToolbox
import CoreHaptics
import Observation
import UIKit
import os

private let hapticLog = Logger(subsystem: "com.holzherr.tigerworkouts", category: "haptics")

/// The thing the web app cannot do. iOS Safari has no Vibration API, so on the phone the PWA's
/// end-of-workout buzz is a silent no-op; here every transition has a shape you can feel through a
/// pocket without looking.
///
/// Core Haptics is foreground-only: with the screen locked it plays nothing. The session keeps the
/// app alive in the background (Cues' audio), so a locked phone gets the system vibration instead —
/// two long buzzes for work, one for rest, the only buzz iOS lets a backgrounded app make.
@MainActor
@Observable
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

    /// What the Me tab reports, so a phone that does not buzz says why. The simulator has no
    /// haptic hardware, so a Builder only ever sees `.unsupported`; the other two are for the gym.
    enum Status: Equatable {
        case ready
        case unsupported
        case stopped(String)

        var label: String {
            switch self {
            case .ready: "ready"
            case .unsupported: "not on this device"
            case .stopped(let reason): "stopped — \(reason)"
            }
        }
    }

    private var engine: CHHapticEngine?
    private let supportsHaptics = CHHapticEngine.capabilitiesForHardware().supportsHaptics
    private(set) var status = Status.unsupported
    var enabled = true

    private init() {
        guard supportsHaptics else { return }
        do {
            let engine = try CHHapticEngine()
            // Tones come from Cues, which activates and deactivates the audio session around every
            // session; a haptics-only engine is not tied to that session and does not go down with it.
            engine.playsHapticsOnly = true
            engine.isAutoShutdownEnabled = false
            // The engine is stopped whenever the app backgrounds or another app takes the hardware.
            engine.resetHandler = { [weak self] in Task { @MainActor in self?.restart() } }
            engine.stoppedHandler = { [weak self] reason in Task { @MainActor in self?.stopped(reason) } }
            self.engine = engine
        } catch {
            status = .stopped(error.localizedDescription)
            hapticLog.error("haptic engine could not be created: \(error.localizedDescription, privacy: .public)")
            return
        }
        restart()
    }

    /// Starts the engine, or starts it again after the system stopped it. Called whenever the app
    /// comes to the foreground; harmless on a running engine and on a device without one.
    func restart() {
        guard let engine else { return }
        do {
            try engine.start()
            status = .ready
            hapticLog.info("haptic engine started")
        } catch {
            status = .stopped(error.localizedDescription)
            hapticLog.error("haptic engine failed to start: \(error.localizedDescription, privacy: .public)")
        }
    }

    private func stopped(_ reason: CHHapticEngine.StoppedReason) {
        let why = switch reason {
        case .audioSessionInterrupt: "audio session interrupted"
        case .applicationSuspended: "app was suspended"
        case .idleTimeout: "idle timeout"
        case .notifyWhenFinished: "finished"
        case .engineDestroyed: "engine destroyed"
        case .gameControllerDisconnect: "game controller disconnected"
        case .systemError: "system error"
        @unknown default: "reason \(reason.rawValue)"
        }
        status = .stopped(why)
        hapticLog.info("haptic engine stopped: \(why, privacy: .public)")
    }

    func play(_ cue: Cue) {
        guard enabled else { return }
        if UIApplication.shared.applicationState != .active { return vibrate(cue) }
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

    /// Screen locked or app in the background. The ticks stay silent: three long buzzes a second
    /// apart would blur into one, and the work/rest buzz that follows is the one that matters.
    private func vibrate(_ cue: Cue) {
        switch cue {
        case .tick:
            return
        case .rest:
            buzz(1)
        case .work, .block:
            buzz(2)
        case .finish:
            buzz(3)
        }
    }

    /// Work is two buzzes and rest one, so the pocket can tell them apart.
    private func buzz(_ times: Int) {
        for i in 0..<times {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.6 * Double(i)) { AudioServicesPlaySystemSound(kSystemSoundID_Vibrate) }
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
