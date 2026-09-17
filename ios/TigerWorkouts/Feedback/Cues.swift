import AVFoundation

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
    private var running = false
    var enabled = true

    private init() {
        engine.attach(tones)
        engine.attach(keepAlive)
        engine.connect(tones, to: engine.mainMixerNode, format: format)
        engine.connect(keepAlive, to: engine.mainMixerNode, format: format)
    }

    /// Call when a session starts. Ducks music rather than stopping it, so the cue is audible over
    /// whatever is playing.
    func begin() {
        guard !running else { return }
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [.mixWithOthers, .duckOthers])
            try AVAudioSession.sharedInstance().setActive(true)
            engine.prepare()
            try engine.start()
            running = true
            holdSessionOpen()
        } catch {
            running = false
        }
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
        guard enabled, running else { return }
        for (freq, start, length, level) in notes(for: tone) {
            schedule(frequency: freq, after: start, seconds: length, level: level)
        }
    }

    /// Pitch rises with importance: a tick is a blip, the finish is a three-note climb.
    private func notes(for tone: Tone) -> [(Double, Double, Double, Float)] {
        switch tone {
        case .tick: [(880, 0, 0.09, 0.35)]
        case .work: [(1_100, 0, 0.16, 0.6)]
        case .rest: [(660, 0, 0.22, 0.45)]
        case .block: [(880, 0, 0.14, 0.55), (1_100, 0.16, 0.2, 0.55)]
        case .finish: [(880, 0, 0.18, 0.7), (1_100, 0.2, 0.18, 0.7), (1_320, 0.4, 0.5, 0.7)]
        }
    }

    private func schedule(frequency: Double, after delay: Double, seconds: Double, level: Float) {
        guard let buffer = sine(frequency: frequency, seconds: seconds, level: level) else { return }
        let start = AVAudioTime(sampleTime: AVAudioFramePosition(delay * format.sampleRate), atRate: format.sampleRate)
        if !tones.isPlaying { tones.play() }
        tones.scheduleBuffer(buffer, at: delay > 0 ? start : nil, options: [])
    }

    /// One sine burst with a short fade in and out, so it reads as a beep rather than a click.
    private func sine(frequency: Double, seconds: Double, level: Float) -> AVAudioPCMBuffer? {
        let frames = AVAudioFrameCount(seconds * format.sampleRate)
        guard frames > 0, let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames) else { return nil }
        buffer.frameLength = frames
        guard let channel = buffer.floatChannelData?[0] else { return nil }
        let fade = Double(frames) * 0.12
        for n in 0..<Int(frames) {
            let t = Double(n) / format.sampleRate
            let envelope = min(1, min(Double(n) / fade, Double(Int(frames) - n) / fade))
            channel[n] = Float(sin(2 * .pi * frequency * t) * envelope) * level
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
