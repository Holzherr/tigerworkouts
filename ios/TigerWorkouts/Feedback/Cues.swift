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
        guard enabled, running, let buffer = render(notes(for: tone)) else { return }
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
