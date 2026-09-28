import SwiftUI

/// The top of the finish screen, as on the web (`celebration-card.tsx`): "Workout 42" large, the
/// streak under it, Share on the right; a row per record set today; then how it compares with the
/// last time of the same workout. Sections with nothing to say are left out.
struct CelebrationCard: View {
    let celebration: Celebrate.Celebration
    let scoreType: ScoreType
    /// A block's name, for a fastest-round record.
    var blockName: (String) -> String? = { _ in nil }
    var onShare: (() -> Void)?

    var body: some View {
        let deltas = Celebrate.deltaLines(celebration, type: scoreType)
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(Celebrate.ordinalLabel(celebration.ordinal))
                        .font(.system(size: 30, weight: .black))
                        .foregroundStyle(Brand.ink)
                    Text(Celebrate.streakLabel(celebration.streak))
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Brand.coralInk)
                }
                Spacer()
                if let onShare {
                    Button(action: onShare) {
                        Label("Share", systemImage: "square.and.arrow.up")
                            .font(.subheadline.weight(.semibold))
                            .padding(.horizontal, 12)
                            .frame(minHeight: 40)
                            .background(Brand.surface, in: Capsule())
                            .overlay(Capsule().strokeBorder(Brand.line))
                    }
                    .foregroundStyle(Brand.ink)
                    .accessibilityIdentifier("share-card")
                }
            }

            let records = celebration.prs.count + celebration.rounds.count
            if records > 0 {
                VStack(alignment: .leading, spacing: 8) {
                    heading(records == 1 ? "New record" : "\(records) new records")
                    ForEach(celebration.prs, id: \.exerciseKey) { pr in
                        HStack(spacing: 8) {
                            Image(systemName: "medal.fill").foregroundStyle(Brand.coral)
                            Text(Library.shared.name(pr.exerciseKey)).fontWeight(.semibold).lineLimit(1)
                            Spacer()
                            Text(Logbook.label(pr.set, unit: ShareCard.unit(pr.exerciseKey))).fontWeight(.heavy).monospacedDigit()
                        }
                        .font(.subheadline)
                        .foregroundStyle(Brand.ink)
                    }
                    ForEach(celebration.rounds, id: \.blockId) { r in
                        HStack(spacing: 8) {
                            Image(systemName: "medal.fill").foregroundStyle(Brand.coral)
                            Text("Fastest round" + (blockName(r.blockId).map { " · \($0)" } ?? "")).fontWeight(.semibold).lineLimit(1)
                            Spacer()
                            Text(Logbook.duration(r.seconds)).fontWeight(.heavy).monospacedDigit()
                            Text("was \(Logbook.duration(r.was))").font(.caption.weight(.semibold)).foregroundStyle(Brand.muted).monospacedDigit()
                        }
                        .font(.subheadline)
                        .foregroundStyle(Brand.ink)
                    }
                }
            }

            if !deltas.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    heading("vs last time")
                    ForEach(deltas, id: \.label) { d in
                        HStack(spacing: 8) {
                            Text(d.label).foregroundStyle(Brand.muted).frame(width: 64, alignment: .leading)
                            Text(d.text).fontWeight(d.better == true ? .bold : .regular).foregroundStyle(d.better == false ? Brand.body : Brand.ink)
                            Spacer()
                            if let better = d.better {
                                Image(systemName: better ? "arrow.up" : "arrow.down")
                                    .foregroundStyle(better ? Brand.coral : Brand.faint)
                                    .accessibilityLabel(better ? "better" : "worse")
                            }
                        }
                        .font(.subheadline)
                        .monospacedDigit()
                    }
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Brand.coralSoft, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Brand.brandLine))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("celebration")
    }

    private func heading(_ s: String) -> some View {
        Text(s).font(.caption.weight(.bold)).textCase(.uppercase).tracking(1.2).foregroundStyle(Brand.coralInk)
    }
}

/// "How hard was it?" and ten numbered buttons, 1 to 10. One tap sets it, a second tap on the same
/// number clears it; the word for its band (Easy, Moderate, Hard, All out) shows beside the label.
struct EffortRow: View {
    let value: Double?
    let onChange: (Double?) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text("How hard was it?").font(.subheadline.weight(.bold)).foregroundStyle(Brand.ink)
                Spacer()
                Text(value.map { "\(Int($0)) · \(Celebrate.effortWord(Int($0)))" } ?? "Tap 1–10")
                    .font(.footnote)
                    .foregroundStyle(Brand.muted)
            }
            HStack(spacing: 4) {
                ForEach(1...10, id: \.self) { n in
                    let on = value.map(Int.init) == n
                    Button {
                        onChange(on ? nil : Double(n))
                    } label: {
                        Text("\(n)")
                            .font(.system(size: 16, weight: .bold, design: .rounded))
                            .monospacedDigit()
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .foregroundStyle(on ? Color.white : Brand.ink)
                            .background(on ? Brand.ink : Brand.lineSoft, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Effort \(n)")
                    .accessibilityAddTraits(on ? .isSelected : [])
                    .accessibilityIdentifier("effort-\(n)")
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface()
    }
}
