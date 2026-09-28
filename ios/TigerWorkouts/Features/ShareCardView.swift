import SwiftUI

/// The share card's content, as on the web (`share-card.ts`): the three numbers on the coral panel,
/// the records and the comparison lines, already in words.
struct ShareCard: Hashable {
    struct Stat: Hashable { var label: String; var value: String }
    struct Line: Hashable { var label: String; var text: String }

    var title: String
    var date: String
    var ordinal: String
    var stats: [Stat]
    var prs: [Line]
    var deltas: [Line]
    var streak: String

    /// The unit a load-only record reads in, "per arm" left off as the web does.
    static func unit(_ key: String) -> String {
        (Library.shared.exercise(key)?.unit ?? "").replacingOccurrences(of: " per arm", with: "")
    }

    /// Time, then the score or the set count, then volume or effort: at most three.
    static func stats(_ r: SessionResult, _ c: Celebrate.Celebration, type: ScoreType) -> [Stat] {
        var out: [Stat] = []
        if let d = r.durationSec ?? r.activity.map({ $0.minutes * 60 }), d > 0 { out.append(Stat(label: "Time", value: Format.clock(d))) }
        let sets = r.steps.reduce(0) { $0 + Logbook.sets(of: $1).count }
        if let score = r.score, type != .none {
            out.append(Stat(label: "Score", value: r.scoreText ?? Celebrate.formatScore(type, score)))
        } else if sets > 0 {
            out.append(Stat(label: "Sets", value: "\(sets)"))
        }
        if let v = c.volume, v > 0 {
            out.append(Stat(label: "Volume", value: Celebrate.kg(v)))
        } else if let rpe = r.rpe {
            out.append(Stat(label: "Effort", value: "\(Int(rpe))/10"))
        }
        return Array(out.prefix(3))
    }

    init(_ r: SessionResult, _ c: Celebrate.Celebration, type: ScoreType) {
        title = r.displayTitle
        date = r.startedDate.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated).year())
        ordinal = Celebrate.ordinalLabel(c.ordinal)
        stats = Self.stats(r, c, type: type)
        prs = c.prs.map { Line(label: Library.shared.name($0.exerciseKey), text: Logbook.label($0.set, unit: Self.unit($0.exerciseKey))) }
            + c.rounds.map { Line(label: "Fastest round", text: Logbook.duration($0.seconds)) }
        deltas = Celebrate.deltaLines(c, type: type).map { Line(label: $0.label, text: $0.text) }
        streak = Celebrate.streakLabel(c.streak)
    }
}

/// The card itself, 360 × 450 points: rendered at 3× it is the web's 1080 × 1350 PNG. Fixed light
/// colours, whatever the phone's appearance, because it is a picture for somebody else's screen.
struct ShareCardView: View {
    let card: ShareCard

    static let size = CGSize(width: 360, height: 450)
    private let coral = Color(hex: 0xFF4D2E)
    private let coralInk = Color(hex: 0xC42A12)
    private let ink = Color(hex: 0x0F172A)
    private let muted = Color(hex: 0x64748B)
    private let line = Color(hex: 0xE2E8F0)

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center, spacing: 6) {
                StripesShape().fill(coral).frame(width: 24, height: 24)
                (Text("Tiger").foregroundColor(ink) + Text("Workouts").foregroundColor(coral))
                    .font(.system(size: 16, weight: .black))
                Spacer()
                Text(card.ordinal.uppercased()).font(.system(size: 10, weight: .heavy)).foregroundStyle(coralInk)
            }
            Text(card.title)
                .font(.system(size: 29, weight: .black))
                .foregroundStyle(ink)
                .lineLimit(2)
                .minimumScaleFactor(0.7)
                .padding(.top, 26)
            Text(card.date).font(.system(size: 12, weight: .medium)).foregroundStyle(muted).padding(.top, 4)

            HStack(alignment: .top, spacing: 0) {
                ForEach(card.stats, id: \.label) { s in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(s.label.uppercased()).font(.system(size: 9, weight: .heavy)).foregroundStyle(.white.opacity(0.85))
                        Text(s.value).font(.system(size: 26, weight: .heavy)).foregroundStyle(.white).lineLimit(1).minimumScaleFactor(0.6)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 22)
            .background(coral, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .padding(.horizontal, -6)
            .padding(.top, 16)

            VStack(alignment: .leading, spacing: 8) {
                if !card.prs.isEmpty {
                    heading(card.prs.count == 1 ? "New record" : "\(card.prs.count) new records")
                    ForEach(card.prs.prefix(card.deltas.isEmpty ? 5 : 3), id: \.self) { p in
                        HStack(spacing: 8) {
                            Circle().fill(coral).frame(width: 10, height: 10)
                            Text(p.label).font(.system(size: 13, weight: .semibold)).lineLimit(1)
                            Spacer()
                            Text(p.text).font(.system(size: 13, weight: .heavy)).monospacedDigit()
                        }
                        .foregroundStyle(ink)
                    }
                }
                if !card.deltas.isEmpty {
                    heading("vs last time").padding(.top, card.prs.isEmpty ? 0 : 8)
                    ForEach(card.deltas.prefix(card.prs.count > 2 ? 2 : 3), id: \.self) { d in
                        HStack(spacing: 0) {
                            Text(d.label).font(.system(size: 13, weight: .medium)).foregroundStyle(muted).frame(width: 72, alignment: .leading)
                            Text(d.text).font(.system(size: 13, weight: .bold)).foregroundStyle(ink)
                        }
                    }
                }
            }
            .padding(.top, 24)

            Spacer(minLength: 0)
            Rectangle().fill(line).frame(height: 0.7)
            HStack {
                Text(card.streak).foregroundStyle(muted)
                Spacer()
                Text("tigerworkouts.com").foregroundStyle(coralInk)
            }
            .font(.system(size: 11, weight: .semibold))
            .padding(.top, 14)
        }
        .padding(EdgeInsets(top: 26, leading: 27, bottom: 22, trailing: 27))
        .frame(width: Self.size.width, height: Self.size.height)
        .background(Color.white)
        .environment(\.colorScheme, .light)
    }

    private func heading(_ s: String) -> some View {
        Text(s.uppercased()).font(.system(size: 9, weight: .heavy)).tracking(0.4).foregroundStyle(coralInk)
    }

    /// The PNG to share: 1080 × 1350.
    @MainActor
    static func render(_ card: ShareCard) -> UIImage? {
        let renderer = ImageRenderer(content: ShareCardView(card: card))
        renderer.scale = 3
        return renderer.uiImage
    }
}

/// A sheet with the card as it will be sent and the system share button under it.
struct ShareCardSheet: View {
    let card: ShareCard
    @Environment(\.dismiss) private var dismiss
    @State private var image: UIImage?

    var body: some View {
        NavigationStack {
            VStack(spacing: 18) {
                if let image {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFit()
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Brand.line))
                        .shadow(color: .black.opacity(0.08), radius: 8, y: 2)
                        .accessibilityLabel("Share card: \(card.title)")
                        .accessibilityIdentifier("share-card-image")
                    ShareLink(item: Image(uiImage: image), preview: SharePreview(card.title, image: Image(uiImage: image))) {
                        Label("Share", systemImage: "square.and.arrow.up")
                    }
                    .buttonStyle(BigButtonStyle())
                } else {
                    ProgressView()
                }
            }
            .padding(20)
            .frame(maxHeight: .infinity, alignment: .top)
            .background(Brand.canvas)
            .navigationTitle("Share")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Close") { dismiss() } }
            }
        }
        .onAppear { image = ShareCardView.render(card) }
    }
}
