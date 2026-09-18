import SwiftUI

/// What the session came to: time under work, an honest calorie estimate, what it moved, and
/// where on the body it landed.
struct SessionStatsView: View {
    let result: SessionResult
    let runsheet: Runsheet?
    let history: [SessionResult]
    let bodyweightKg: Double?

    private var worked: [WorkedSet] { EffortModel.workedFrom(result, runsheet: runsheet) }
    private var effort: Effort { EffortModel.effort(result, worked: worked, bodyweightKg: bodyweightKg) }
    /// Health's figure when the watch was on, ours when it was not.
    private var measuredKcal: Int? { result.device?.calories.map { Int($0) } }
    private var load: MuscleShare { Muscles.load(worked) }
    private var streak: Streak { EffortModel.streak(history.contains { $0.rowId == result.rowId } ? history : history + [result]) }

    var body: some View {
        VStack(spacing: 16) {
            HStack(spacing: 10) {
                tile(title: "Work", value: Format.duration(effort.workSec), note: "\(effort.sets) set\(effort.sets == 1 ? "" : "s")")
                tile(title: "Burn", value: "\(measuredKcal ?? effort.kcal)", note: measuredKcal != nil ? "kcal measured" : "kcal estimate")
                tile(
                    title: effort.tonnage > 0 ? "Moved" : "Session",
                    value: effort.tonnage > 0 ? "\(Int(effort.tonnage / 1000 >= 1 ? (effort.tonnage / 1000).rounded() : effort.tonnage))" : Format.duration(result.durationSec ?? 0),
                    note: effort.tonnage > 0 ? (effort.tonnage >= 1000 ? "tonnes lifted" : "kg lifted") : "end to end"
                )
            }

            if let device = result.device, device.avgHr != nil || device.maxHr != nil {
                HStack(spacing: 14) {
                    Image(systemName: "heart.fill").foregroundStyle(Brand.coral)
                    if let avg = device.avgHr { Text("\(Int(avg)) bpm average").font(.subheadline) }
                    if let peak = device.maxHr { Text("· \(Int(peak)) peak").font(.subheadline).foregroundStyle(Brand.muted) }
                    Spacer()
                    if let source = device.source { Text(source).font(.caption2).foregroundStyle(Brand.muted) }
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .cardSurface()
            } else if effort.estimatedWeight {
                Text("Calories assume \(Int(EffortModel.defaultBodyweightKg)) kg. Set your bodyweight under Me, or turn on Health, for a closer figure.")
                    .font(.caption)
                    .foregroundStyle(Brand.muted)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            if !load.isEmpty {
                VStack(alignment: .leading, spacing: 12) {
                    Text("What you worked").font(.headline)
                    BodyMapView(load: load)
                    FlowChips(items: load.sorted { $0.value > $1.value }.map(\.key.label))
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .cardSurface()
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("\(streak.weeks) week\(streak.weeks == 1 ? "" : "s") running")
                    .font(.headline)
                Text("\(streak.thisWeek) this week, \(streak.lastWeek) last week · \(streak.total) sessions logged")
                    .font(.footnote)
                    .foregroundStyle(Brand.muted)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .cardSurface()
        }
    }

    private func tile(title: String, value: String, note: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(.caption.weight(.semibold)).textCase(.uppercase).tracking(0.6).foregroundStyle(Brand.muted)
            Text(value).font(.system(size: 30, weight: .bold, design: .rounded)).monospacedDigit().foregroundStyle(Brand.ink)
            Text(note).font(.caption2).foregroundStyle(Brand.muted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .cardSurface()
    }
}

/// Chips that wrap, ordered by emphasis.
struct FlowChips: View {
    let items: [String]

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 6) { chips }
            VStack(alignment: .leading, spacing: 6) {
                ForEach(Array(stride(from: 0, to: items.count, by: 3)), id: \.self) { start in
                    HStack(spacing: 6) {
                        ForEach(items[start..<min(start + 3, items.count)], id: \.self) { chip($0) }
                    }
                }
            }
        }
    }

    private var chips: some View {
        ForEach(items, id: \.self) { chip($0) }
    }

    private func chip(_ text: String) -> some View {
        Text(text)
            .font(.caption.weight(.medium))
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(Brand.coralSoft, in: Capsule())
            .foregroundStyle(Brand.coralInk)
    }
}
