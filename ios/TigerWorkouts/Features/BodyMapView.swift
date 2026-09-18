import SwiftUI

/// Front and back figures shaded by each muscle's share of the session's working time. It is
/// relative emphasis, not an absolute claim — the hardest-worked muscle is always full strength
/// and everything else is read against it.
struct BodyMapView: View {
    let load: MuscleShare

    private struct Region {
        let muscle: Muscle
        let rect: CGRect
        let radius: CGFloat
        init(_ muscle: Muscle, _ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat, _ radius: CGFloat = 6) {
            self.muscle = muscle
            self.rect = CGRect(x: x, y: y, width: w, height: h)
            self.radius = radius
        }
    }

    /// A 120 × 260 figure, scaled to whatever room the card has.
    private static let size = CGSize(width: 120, height: 260)

    private static let silhouette: [CGRect] = [
        CGRect(x: 50, y: 6, width: 20, height: 24),    // head
        CGRect(x: 44, y: 30, width: 32, height: 10),   // neck and traps
        CGRect(x: 34, y: 38, width: 52, height: 70),   // torso
        CGRect(x: 18, y: 42, width: 16, height: 66),   // left arm
        CGRect(x: 86, y: 42, width: 16, height: 66),   // right arm
        CGRect(x: 36, y: 108, width: 48, height: 26),  // hips
        CGRect(x: 38, y: 134, width: 20, height: 60),  // left thigh
        CGRect(x: 62, y: 134, width: 20, height: 60),  // right thigh
        CGRect(x: 40, y: 194, width: 16, height: 56),  // left shin
        CGRect(x: 64, y: 194, width: 16, height: 56),  // right shin
    ]

    private static let front: [Region] = [
        .init(.shoulders, 30, 38, 18, 18, 8), .init(.shoulders, 72, 38, 18, 18, 8),
        .init(.chest, 36, 46, 48, 26),
        .init(.core, 40, 74, 40, 34),
        .init(.arms, 18, 56, 16, 46, 8), .init(.arms, 86, 56, 16, 46, 8),
        .init(.quads, 38, 136, 20, 56, 9), .init(.quads, 62, 136, 20, 56, 9),
        .init(.calves, 40, 198, 16, 46, 7), .init(.calves, 64, 198, 16, 46, 7),
    ]

    private static let back: [Region] = [
        .init(.shoulders, 30, 38, 18, 18, 8), .init(.shoulders, 72, 38, 18, 18, 8),
        .init(.back, 36, 46, 48, 58),
        .init(.arms, 18, 56, 16, 46, 8), .init(.arms, 86, 56, 16, 46, 8),
        .init(.glutes, 38, 108, 44, 26, 10),
        .init(.hamstrings, 38, 136, 20, 56, 9), .init(.hamstrings, 62, 136, 20, 56, 9),
        .init(.calves, 40, 198, 16, 46, 7), .init(.calves, 64, 198, 16, 46, 7),
    ]

    var body: some View {
        HStack(spacing: 24) {
            figure(Self.front, caption: "Front")
            figure(Self.back, caption: "Back")
        }
        .frame(maxWidth: .infinity)
    }

    private func figure(_ regions: [Region], caption: String) -> some View {
        VStack(spacing: 8) {
            ZStack(alignment: .topLeading) {
                ForEach(Array(Self.silhouette.enumerated()), id: \.offset) { _, r in
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill(Brand.line)
                        .frame(width: r.width, height: r.height)
                        .offset(x: r.minX, y: r.minY)
                }
                ForEach(Array(regions.enumerated()), id: \.offset) { _, region in
                    let value = load[region.muscle] ?? 0
                    if value > 0.02 {
                        RoundedRectangle(cornerRadius: region.radius, style: .continuous)
                            .fill(Brand.coral.opacity(0.3 + value * 0.7))
                            .frame(width: region.rect.width, height: region.rect.height)
                            .offset(x: region.rect.minX, y: region.rect.minY)
                    }
                }
            }
            .frame(width: Self.size.width, height: Self.size.height, alignment: .topLeading)
            Text(caption).font(.caption).foregroundStyle(Brand.muted)
        }
        .accessibilityElement()
        .accessibilityLabel("\(caption) view, \(worked)")
    }

    private var worked: String {
        let names = load.sorted { $0.value > $1.value }.prefix(3).map(\.key.label)
        return names.isEmpty ? "nothing recorded" : names.joined(separator: ", ")
    }
}
