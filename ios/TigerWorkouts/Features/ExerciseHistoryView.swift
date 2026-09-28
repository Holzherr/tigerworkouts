import Charts
import SwiftUI

/// One exercise across every session: a line chart of the best set per session, record tiles with
/// the date each was set, then the sessions newest first with their sets. A set that beat a record
/// standing at the time carries a small PR marker. Follows `exercise-history-screen.tsx`.
struct ExerciseHistoryView: View {
    @Environment(Store.self) private var store
    let exerciseKey: String
    @State private var dismissedStalls = StallDismissals.all()
    /// The chart's line, where the exercise has more than one; nil = the kind's own.
    @State private var metric: Logbook.Metric?
    @State private var range: Logbook.ChartRange = .all

    private var ref: ExerciseRef { Library.shared.exercise(exerciseKey)?.ref ?? .placeholder(key: exerciseKey) }
    private var unit: String {
        ref.unit.replacingOccurrences(of: " per arm", with: "").replacingOccurrences(of: " per side", with: "").trimmingCharacters(in: .whitespaces)
    }

    var body: some View {
        let history = Logbook.history(store.results, exerciseKey: exerciseKey)
        let records = Logbook.records(store.results, exerciseKey: exerciseKey)
        let metrics = Logbook.chartMetrics(records.kind)
        let shown = metric.flatMap { metrics.contains($0) ? $0 : nil }
        let all = shown.map { Logbook.pointsFor(history, metric: $0, per: paceOver) } ?? Logbook.points(history, kind: records.kind, per: paceOver)
        let points = Logbook.inRange(all, range)
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack(spacing: 12) {
                    ExerciseThumb(ref: ref, size: 52)
                    Text(ref.name).font(.title3.weight(.heavy)).foregroundStyle(Brand.ink)
                }
                if history.isEmpty {
                    Text("Not logged yet. Finish a workout with it and it shows up here.")
                        .font(.callout)
                        .foregroundStyle(Brand.muted)
                        .padding(.top, 24)
                } else {
                    chart(points, kind: records.kind, metric: shown, metrics: metrics)
                    if let stall = Stall.exercise(store.results, key: exerciseKey), !dismissedStalls.contains(stall.id) {
                        StallCard(stall: stall) {
                            StallDismissals.dismiss(stall.id)
                            dismissedStalls = StallDismissals.all()
                        }
                    }
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                        ForEach(tiles(records, last: history.first?.startedAt, history: history), id: \.label) { tile($0) }
                    }
                    Text("Sessions")
                        .font(.caption.weight(.semibold))
                        .textCase(.uppercase)
                        .tracking(0.6)
                        .foregroundStyle(Brand.muted)
                        .padding(.top, 4)
                    ForEach(history) { session in
                        if let result = store.results.first(where: { $0.rowId == session.id }) {
                            NavigationLink { SessionDetailView(result: result) } label: { sessionCard(session, kind: records.kind) }
                                .buttonStyle(.plain)
                        } else {
                            sessionCard(session, kind: records.kind)
                        }
                    }
                }
            }
            .padding(16)
        }
        .background(Brand.canvas)
        .navigationTitle(ref.name)
        .navigationBarTitleDisplayMode(.inline)
    }

    // MARK: - Chart

    /// Pace per 500 m on a rower or ski erg, as their monitors show it; per km for anything else.
    private var paceOver: Double { Library.shared.exercise(exerciseKey)?.group == .rower ? 500 : 1000 }

    private func chartLabel(_ kind: Logbook.Kind) -> String {
        let u = unit.isEmpty ? "" : " · \(unit)"
        switch kind {
        case .strength: return "Estimated 1RM\(u)"
        case .load: return unit == "kph" ? "Top speed · kph" : "Top load\(u)"
        case .reps: return "Most reps in a set"
        case .pace: return "Fastest pace · per \(paceOver == 500 ? "500 m" : "km")"
        case .distance: return "Furthest in a set · m"
        case .calories: return "Most calories in a set"
        case .time: return "Longest set"
        case .rounds: return "Rounds per session"
        }
    }

    private func metricLabel(_ m: Logbook.Metric) -> String {
        let u = unit.isEmpty ? "" : " · \(unit)"
        switch m {
        case .e1rm: return "Estimated 1RM\(u)"
        case .topLoad: return "Top load\(u)"
        case .volume: return "Volume · load × reps\(u)"
        case .mostReps: return "Most reps in a set"
        case .totalReps: return "Total reps per session"
        case .pace: return chartLabel(.pace)
        case .distance: return "Furthest in a set · m"
        }
    }

    private func chart(_ points: [Logbook.Point], kind: Logbook.Kind, metric: Logbook.Metric?, metrics: [Logbook.Metric]) -> some View {
        // A pace is better lower: plotted negated so better is still up, labelled as the time.
        let flip = metric.map { $0 == .pace } ?? Logbook.lowerIsBetter(kind)
        let timeAxis = metric.map { $0 == .pace } ?? (kind == .pace || kind == .time)
        return VStack(alignment: .leading, spacing: 10) {
            if metrics.count > 1 {
                ScrollView(.horizontal) {
                    HStack(spacing: 6) {
                        ForEach(metrics) { m in
                            chip(m.rawValue, on: (metric ?? metrics[0]) == m) { self.metric = m }
                        }
                    }
                }
                .scrollIndicators(.hidden)
                .accessibilityIdentifier("chart-metric")
            }
            HStack {
                Text(metric.map(metricLabel) ?? chartLabel(kind)).font(.footnote.weight(.semibold)).foregroundStyle(Brand.muted)
                Spacer()
                Picker("Range", selection: $range) {
                    ForEach(Logbook.ChartRange.allCases) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
                .frame(width: 150)
                .accessibilityIdentifier("chart-range")
            }
            if points.isEmpty {
                Text("Nothing logged in this range.")
                    .font(.footnote)
                    .foregroundStyle(Brand.muted)
                    .frame(maxWidth: .infinity, minHeight: 150)
            } else {
                chartBody(points, flip: flip, timeAxis: timeAxis, label: metric.map(metricLabel) ?? chartLabel(kind))
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface()
    }

    private func chip(_ label: String, on: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(.footnote.weight(.semibold))
                .padding(.horizontal, 12)
                .frame(minHeight: 44)
                .background(on ? Brand.ink : Brand.surface, in: Capsule().inset(by: 5))
                .overlay(Capsule().inset(by: 5).strokeBorder(on ? .clear : Brand.line))
                .foregroundStyle(on ? .white : Brand.ink)
        }
        .buttonStyle(.plain)
    }

    private func chartBody(_ points: [Logbook.Point], flip: Bool, timeAxis: Bool, label: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Chart {
                ForEach(points, id: \.self) { p in
                    LineMark(x: .value("Date", p.date), y: .value("Best", flip ? -p.value : p.value))
                        .foregroundStyle(Brand.coral)
                        .lineStyle(StrokeStyle(lineWidth: 2.5, lineCap: .round, lineJoin: .round))
                    PointMark(x: .value("Date", p.date), y: .value("Best", flip ? -p.value : p.value))
                        .foregroundStyle(Brand.coral)
                        .symbolSize(p == points.last ? 70 : 30)
                }
            }
            .chartYScale(domain: .automatic(includesZero: false))
            .chartYAxis {
                AxisMarks { v in
                    AxisGridLine()
                    AxisValueLabel {
                        if let n = v.as(Double.self) { Text(timeAxis ? Logbook.duration(abs(n)) : Format.number(abs(n))) }
                    }
                }
            }
            .chartXAxis { AxisMarks(values: .automatic(desiredCount: 3)) { AxisValueLabel(format: .dateTime.day().month(.abbreviated)) } }
            .frame(height: 150)
            .accessibilityLabel("\(label), \(points.count) sessions")
        }
    }

    // MARK: - Records

    private struct Tile { var label: String; var value: String; var sub: String? }

    private func date(_ iso: String) -> String {
        (ISO8601.date(iso) ?? .distantPast).formatted(date: .abbreviated, time: .omitted)
    }

    /// What records mean for this kind of work. Timed work gets what exists rather than blanks.
    private func tiles(_ r: Logbook.Records, last: String?, history: [Logbook.Session] = []) -> [Tile] {
        let u = unit.isEmpty ? "" : " \(unit)"
        func t(_ label: String, _ rec: Logbook.Rec?, _ value: (Double) -> String, withSet: Bool = false) -> [Tile] {
            guard let rec else { return [] }
            let sub = [withSet ? rec.set.map { Logbook.label($0) } : nil, date(rec.at)].compactMap { $0 }.filter { !$0.isEmpty }
            return [Tile(label: label, value: value(rec.value), sub: sub.joined(separator: " · "))]
        }
        let sessions = Tile(label: "Sessions", value: "\(r.sessions)", sub: last.map { "last \(date($0))" })
        switch r.kind {
        case .strength:
            return t("Heaviest", r.heaviest, { "\(Format.number($0))\(u)" }, withSet: true)
                + t("Best est. 1RM", r.e1rm, { "\(Format.number($0))\(u)" }, withSet: true)
                + t("Most reps", r.reps, { Format.number($0) }, withSet: true)
                + t("Best volume", r.volume, { "\(Format.number($0.rounded()))\(u)" })
        case .load:
            return t(unit == "kph" ? "Top speed" : "Heaviest", r.heaviest, { "\(Format.number($0))\(u)" }) + [sessions]
        case .reps:
            return t("Most reps", r.reps, { Format.number($0) }) + [sessions]
        case .pace:
            // The distances with a fastest time, the most done first: at most two tiles.
            var done: [Int: Int] = [:]
            for x in history.flatMap(\.sets) where x.meters != nil && x.seconds != nil { done[Logbook.distKey(x.meters!), default: 0] += 1 }
            let fastest = r.fastest.sorted { (done[$0.key] ?? 0, -$0.key) > (done[$1.key] ?? 0, -$1.key) }.prefix(2)
                .map { Tile(label: "Fastest \($0.key) m", value: Logbook.duration($0.value.value), sub: date($0.value.at)) }
            return Array((fastest + t("Furthest", r.distance, { "\(Format.number($0)) m" }, withSet: true) + [sessions]).prefix(4))
        case .distance:
            return t("Furthest", r.distance, { "\(Format.number($0)) m" }) + [sessions]
        case .calories:
            return t("Most calories", r.calories, { "\(Format.number($0)) cal" }, withSet: true) + [sessions]
        case .time:
            return t("Longest", r.longest, { Logbook.duration($0) }) + [sessions]
        case .rounds:
            return [sessions]
        }
    }

    private func tile(_ t: Tile) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(t.label).font(.caption.weight(.semibold)).foregroundStyle(Brand.muted)
            Text(t.value).font(.title3.weight(.heavy)).monospacedDigit().foregroundStyle(Brand.ink)
            // Always a line, so tiles side by side stay the same height.
            Text(t.sub ?? " ").font(.caption2).foregroundStyle(Brand.muted).lineLimit(1)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface()
    }

    // MARK: - Sessions

    private func sessionCard(_ s: Logbook.Session, kind: Logbook.Kind) -> some View {
        let counted = s.sets.enumerated().filter { !Logbook.label($0.element, unit: unit).isEmpty }
        return VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(s.title).font(.subheadline.weight(.bold)).foregroundStyle(Brand.ink).lineLimit(1)
                Spacer(minLength: 8)
                Text(s.startedDate.formatted(date: .abbreviated, time: .omitted)).font(.caption).foregroundStyle(Brand.muted)
            }
            FlowRow(spacing: 6) {
                if counted.isEmpty {
                    Text("\(s.sets.count) \(s.sets.count == 1 ? "round" : "rounds")").font(.footnote).foregroundStyle(Brand.body)
                }
                ForEach(counted, id: \.offset) { item in
                    HStack(spacing: 4) {
                        Text(Logbook.label(item.element, unit: unit)).font(.footnote.weight(.semibold)).monospacedDigit()
                        if s.prs[item.offset] {
                            Text("PR")
                                .font(.system(size: 9, weight: .black))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 4)
                                .background(Brand.coral, in: Capsule())
                                .accessibilityLabel("personal record")
                        }
                    }
                    .foregroundStyle(Brand.ink)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Brand.lineSoft, in: Capsule())
                }
                if kind == .load, counted.count > 1 {
                    Text("\(counted.count) round\(counted.count == 1 ? "" : "s")").font(.caption).foregroundStyle(Brand.muted)
                }
                if let incline = s.incline {
                    Text("incline \(Format.number(incline))%").font(.caption).foregroundStyle(Brand.muted)
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface()
        .contentShape(Rectangle())
    }
}

/// Every exercise you have logged, most recently done first, searchable by name.
struct ExerciseListView: View {
    @Environment(Store.self) private var store
    @State private var query = ""

    var body: some View {
        let all = Logbook.logged(store.results)
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        let shown = q.isEmpty ? all : all.filter { Library.shared.name($0.exerciseKey).lowercased().contains(q) }
        List {
            if all.isEmpty {
                Text("Nothing logged yet.").foregroundStyle(Brand.muted)
            } else if shown.isEmpty {
                Text("No logged exercise matches “\(query)”.").foregroundStyle(Brand.muted)
            }
            ForEach(shown) { x in
                NavigationLink { ExerciseHistoryView(exerciseKey: x.exerciseKey) } label: {
                    HStack(spacing: 12) {
                        ExerciseThumb(ref: Library.shared.exercise(x.exerciseKey)?.ref ?? .placeholder(key: x.exerciseKey), size: 40, radius: 10)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(Library.shared.name(x.exerciseKey)).foregroundStyle(Brand.ink)
                            Text("\(x.sessions) \(x.sessions == 1 ? "session" : "sessions") · last \((ISO8601.date(x.lastAt) ?? .distantPast).formatted(.dateTime.day().month(.abbreviated)))")
                                .font(.footnote)
                                .foregroundStyle(Brand.muted)
                        }
                    }
                }
            }
        }
        .searchable(text: $query, prompt: "Search exercises")
        .navigationTitle("Exercises")
    }
}

/// Wraps its children onto as many lines as they need, left to right.
struct FlowRow: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = arrange(width: proposal.width ?? .infinity, subviews: subviews)
        return CGSize(width: proposal.width ?? rows.width, height: rows.height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let rows = arrange(width: bounds.width, subviews: subviews)
        for (i, p) in rows.origins.enumerated() {
            subviews[i].place(at: CGPoint(x: bounds.minX + p.x, y: bounds.minY + p.y), proposal: .unspecified)
        }
    }

    private func arrange(width: CGFloat, subviews: Subviews) -> (origins: [CGPoint], width: CGFloat, height: CGFloat) {
        var origins: [CGPoint] = []
        var x: CGFloat = 0, y: CGFloat = 0, line: CGFloat = 0, widest: CGFloat = 0
        for s in subviews {
            let size = s.sizeThatFits(.unspecified)
            if x > 0, x + size.width > width {
                x = 0
                y += line + spacing
                line = 0
            }
            origins.append(CGPoint(x: x, y: y))
            x += size.width + spacing
            line = max(line, size.height)
            widest = max(widest, x - spacing)
        }
        return (origins, widest, y + line)
    }
}
