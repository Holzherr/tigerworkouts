import AVFoundation
import os

private let audioLog = Logger(subsystem: "com.holzherr.tigerworkouts", category: "audio")

/// Tones, and the reason the timer survives a locked screen.
///
/// Two jobs in one audio engine. The first is the cues themselves: short sine bursts generated in
/// memory, so the app ships no audio files and a tone can be any pitch we like. The second is
/// keeping the app alive — with `UIBackgroundModes: audio` in Info.plist, an app that is actually
/// playing audio keeps running when the screen locks, which is what lets the countdown keep
/// counting in a pocket. A near-silent loop holds that open for the length of a session.
@MainActor
final class Cues {
    static let shared = Cues()

    enum Tone {
        case tick, work, rest, block, finish
    }

    private let engine = AVAudioEngine()
    private let tones = AVAudioPlayerNode()
    private let keepAlive = AVAudioPlayerNode()
    private lazy var format = AVAudioFormat(standardFormatWithSampleRate: 44_100, channels: 1)!
    /// Between `begin` and `end`: a session wants the audio open, whatever has knocked it down.
    private var running = false
    var enabled = Switches.isOn(Switches.sound)

    private init() {
        engine.attach(tones)
        engine.attach(keepAlive)
        engine.connect(tones, to: engine.mainMixerNode, format: format)
        engine.connect(keepAlive, to: engine.mainMixerNode, format: format)

        // A phone call, Siri or an alarm stops the engine, and with it the silent loop that holds
        // the background slot: the timer would stop at screen lock, silently, for the rest of the
        // session. Plugging in or pulling out headphones stops the engine too.
        let center = NotificationCenter.default
        center.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] note in
            let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt
            let ended = raw.flatMap(AVAudioSession.InterruptionType.init) == .ended
            MainActor.assumeIsolated { self?.interrupted(ended: ended) }
        }
        center.addObserver(forName: .AVAudioEngineConfigurationChange, object: engine, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.reopen(after: "route change") }
        }
    }

    /// Call when a session starts. Mixes with whatever is playing and leaves it at full volume: the
    /// session is open for the whole workout to hold the background slot, and `.duckOthers` held
    /// music down for all of it, not just under the cues.
    func begin() {
        guard !running else { return }
        running = true
        open()
    }

    /// Activate the session and start the engine and the silent loop.
    @discardableResult
    private func open() -> Bool {
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [.mixWithOthers])
            try AVAudioSession.sharedInstance().setActive(true)
            engine.prepare()
            try engine.start()
            holdSessionOpen()
            audioLog.info("audio session held open for the background")
            return true
        } catch {
            // Without this the app is suspended when the screen locks and the Lock Screen card
            // stops moving, so it is worth being loud about.
            audioLog.error("audio session failed, no background slot: \(error.localizedDescription, privacy: .public)")
            return false
        }
    }

    private func interrupted(ended: Bool) {
        guard running else { return }
        if ended {
            // Resume whether or not the system suggests it: a workout timer is not music the
            // person chose to stop.
            reopen(after: "interruption")
        } else {
            audioLog.info("audio interrupted; the engine is down until it ends")
        }
    }

    private func reopen(after reason: String) {
        guard running, !engine.isRunning else { return }
        keepAlive.stop()
        tones.stop()
        if open() { audioLog.info("audio back after \(reason, privacy: .public)") }
    }

    /// Call when the session ends, so the app stops holding the audio session and the background
    /// slot it comes with.
    func end() {
        guard running else { return }
        keepAlive.stop()
        tones.stop()
        engine.stop()
        running = false
        try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
    }

    func play(_ tone: Tone) {
        guard enabled, running, engine.isRunning, let buffer = render(notes(for: tone)) else { return }
        if !tones.isPlaying { tones.play() }
        tones.scheduleBuffer(buffer, at: nil, options: [])
    }

    /// Pitch rises with importance: a tick is a blip, the finish is a three-note climb.
    private func notes(for tone: Tone) -> [Note] {
        switch tone {
        case .tick: [Note(880, at: 0, for: 0.09, level: 0.35)]
        case .work: [Note(1_100, at: 0, for: 0.16, level: 0.6)]
        case .rest: [Note(660, at: 0, for: 0.22, level: 0.45)]
        case .block: [Note(880, at: 0, for: 0.14, level: 0.55), Note(1_100, at: 0.16, for: 0.2, level: 0.55)]
        case .finish: [Note(880, at: 0, for: 0.18, level: 0.7), Note(1_100, at: 0.2, for: 0.18, level: 0.7), Note(1_320, at: 0.4, for: 0.5, level: 0.7)]
        }
    }

    private struct Note {
        var frequency: Double
        var start: Double
        var length: Double
        var level: Float

        init(_ frequency: Double, at start: Double, for length: Double, level: Float) {
            self.frequency = frequency
            self.start = start
            self.length = length
            self.level = level
        }
    }

    /// Renders a whole cue into one buffer. The notes cannot be scheduled separately: a player
    /// node plays its queue back to back with no gaps, and its `AVAudioTime` is an absolute sample
    /// position rather than an offset, so a three-note finish would come out as one chord.
    /// Each note fades in and out, so it reads as a beep rather than a click.
    private func render(_ notes: [Note]) -> AVAudioPCMBuffer? {
        let total = notes.map { $0.start + $0.length }.max() ?? 0
        let frames = AVAudioFrameCount(total * format.sampleRate)
        guard frames > 0, let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames) else { return nil }
        buffer.frameLength = frames
        guard let channel = buffer.floatChannelData?[0] else { return nil }
        for n in 0..<Int(frames) { channel[n] = 0 }

        for note in notes {
            let offset = Int(note.start * format.sampleRate)
            let length = Int(note.length * format.sampleRate)
            guard length > 0 else { continue }
            let fade = max(1, Double(length) * 0.12)
            for k in 0..<length where offset + k < Int(frames) {
                let t = Double(k) / format.sampleRate
                let envelope = min(1, min(Double(k) / fade, Double(length - k) / fade))
                channel[offset + k] += Float(sin(2 * .pi * note.frequency * t) * envelope) * note.level
            }
        }
        return buffer
    }

    /// A looping buffer of near-silence. Not truly zero: some routes treat a wholly silent stream
    /// as nothing playing, and the background slot goes with it.
    private func holdSessionOpen() {
        let frames = AVAudioFrameCount(format.sampleRate)
        guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames) else { return }
        buffer.frameLength = frames
        if let channel = buffer.floatChannelData?[0] {
            for n in 0..<Int(frames) { channel[n] = Float(sin(2 * .pi * 40 * Double(n) / format.sampleRate)) * 1e-4 }
        }
        keepAlive.scheduleBuffer(buffer, at: nil, options: [.loops])
        keepAlive.play()
    }
}
