import AVFoundation
import SwiftUI
import UIKit

/// Exercise photos and clips live on tigerworkouts.com (`media/kb_swing.jpg`), the same files the
/// web app shows. About half the steps in the catalogue have a photo, and every exercise in the
/// workouts Nick actually does.
enum Media {
    static let base = URL(string: "https://tigerworkouts.com/")!

    static func url(_ path: String?) -> URL? {
        guard let path, !path.isEmpty else { return nil }
        return URL(string: path, relativeTo: base)?.absoluteURL
    }

    /// Photos rarely change, and a gym basement rarely has signal: once seen, a photo comes from
    /// disk rather than waiting on the network.
    static func configureCache() {
        URLCache.shared = URLCache(memoryCapacity: 32 << 20, diskCapacity: 256 << 20)
    }

    static func poster(for ref: ExerciseRef) -> URL? {
        url(ref.poster ?? Library.shared.exercise(ref.key)?.poster)
    }

    static func clip(for ref: ExerciseRef) -> URL? {
        url(ref.clip ?? Library.shared.exercise(ref.key)?.clip)
    }

    /// What stands in for a photo: the kind of kit the exercise uses.
    static func symbol(for key: String) -> String {
        switch Library.shared.group(key) {
        case .kettlebell: "figure.strengthtraining.functional"
        case .dumbbell: "dumbbell.fill"
        case .barbell: "figure.strengthtraining.traditional"
        case .treadmill, .run: "figure.run"
        case .walk: "figure.walk"
        case .rower: "figure.rower"
        case .bike: "figure.outdoor.cycle"
        case .swim: "figure.pool.swim"
        case .core: "figure.core.training"
        case .band: "figure.flexibility"
        case .gym: "figure.climbing"
        case .body, nil: "figure.cross.training"
        }
    }
}

/// An image from the network that prefers the disk cache over the network, so it still shows with
/// no signal. `AsyncImage` revalidates on its own schedule and shows nothing offline.
struct CachedImage<Placeholder: View>: View {
    let url: URL?
    @ViewBuilder var placeholder: () -> Placeholder

    @State private var image: UIImage?

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image).resizable().scaledToFill()
            } else {
                placeholder()
            }
        }
        .task(id: url) { await load() }
    }

    private func load() async {
        guard let url else { image = nil; return }
        let request = URLRequest(url: url, cachePolicy: .returnCacheDataElseLoad, timeoutInterval: 20)
        if let cached = URLCache.shared.cachedResponse(for: request), let img = UIImage(data: cached.data) {
            image = img
            return
        }
        guard let (data, _) = try? await URLSession.shared.data(for: request), let img = UIImage(data: data) else { return }
        image = img
    }
}

/// The exercise's photo in a rounded tile, or its kit symbol where there is no photo, so a list of
/// steps always lines up.
struct ExerciseThumb: View {
    let ref: ExerciseRef
    var size: CGFloat = 48
    var radius: CGFloat = 12

    var body: some View {
        CachedImage(url: Media.poster(for: ref)) {
            ZStack {
                Brand.well
                Image(systemName: Media.symbol(for: ref.key))
                    .font(.system(size: size * 0.42, weight: .medium))
                    .foregroundStyle(Brand.muted)
            }
        }
        .frame(width: size, height: size)
        .background(.white)
        .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).strokeBorder(Brand.line))
        .accessibilityHidden(true)
    }
}

/// The exercise moving: a muted clip on a loop where there is one, the photo where there is not.
struct ExerciseDemo: View {
    let ref: ExerciseRef
    var size: CGFloat = 112

    var body: some View {
        Group {
            if let clip = Media.clip(for: ref) {
                LoopingVideo(url: clip)
                    .background(.white)
            } else {
                CachedImage(url: Media.poster(for: ref)) {
                    ZStack {
                        Brand.well
                        Image(systemName: Media.symbol(for: ref.key))
                            .font(.system(size: size * 0.4, weight: .medium))
                            .foregroundStyle(Brand.muted)
                    }
                }
            }
        }
        .frame(width: size, height: size)
        .background(.white)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .accessibilityHidden(true)
    }
}

/// A muted, looping clip. Muted so it never competes with the cues or the music, and it joins the
/// app's audio session rather than taking it over.
struct LoopingVideo: UIViewRepresentable {
    let url: URL

    func makeUIView(context: Context) -> PlayerView {
        let view = PlayerView()
        view.play(url)
        return view
    }

    func updateUIView(_ view: PlayerView, context: Context) {
        if view.url != url { view.play(url) }
    }

    static func dismantleUIView(_ view: PlayerView, coordinator: ()) {
        view.stop()
    }

    final class PlayerView: UIView {
        override static var layerClass: AnyClass { AVPlayerLayer.self }
        private var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
        private var looper: AVPlayerLooper?
        private(set) var url: URL?

        func play(_ url: URL) {
            self.url = url
            let player = AVQueuePlayer()
            player.isMuted = true
            player.preventsDisplaySleepDuringVideoPlayback = false
            looper = AVPlayerLooper(player: player, templateItem: AVPlayerItem(url: url))
            playerLayer.player = player
            playerLayer.videoGravity = .resizeAspectFill
            player.play()
        }

        func stop() {
            playerLayer.player?.pause()
            playerLayer.player = nil
            looper = nil
        }
    }
}
