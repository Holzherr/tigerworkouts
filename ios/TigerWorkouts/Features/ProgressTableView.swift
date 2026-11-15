import SwiftUI

/// What the workout page shows for progress, in one place so the page carries a single line for it:
/// the one-time setup question while it is unanswered, then a "Week by week" row once the workout
/// has history.
struct WorkoutProgressEntry: View {
    @Environment(Store.self) private var store
    let runsheet: Runsheet

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if store.suggestions.shouldAsk(runsheet) {
                SuggestSetupCard()
            }
            let table = WeekTable.table(runsheet, results: store.results, workouts: store.myWorkouts)
            if !table.isEmpty {
                // A hidden link behind the row, so the list does not add a second chevron.
                ZStack {
                    NavigationLink { ProgressTableView(runsheet: runsheet) } label: { EmptyView() }.opacity(0)
                    HStack(spacing: 12) {
                        Image(systemName: "tablecells")
                            .font(.body.weight(.semibold))
                            .foregroundStyle(Brand.coralInk)
                            .frame(width: 28)
                        VStack(alignment: .leading, spacing: 1) {
                            Text("Week by week").font(.subheadline.weight(.semibold)).foregroundStyle(Brand.ink)
                            Text(summary(table)).font(.footnote).foregroundStyle(Brand.muted)
                        }
                        Spacer(minLength: 8)
                        Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(Brand.faint)
                    }
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .cardSurface()
                    .contentShape(Rectangle())
                    .allowsHitTesting(false)
                }
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(.isButton)
                .accessibilityIdentifier("week-by-week")
            }
        }
    }

    private func summary(_ t: WeekTable.Table) -> String {
        let n = t.columns.count
        let last = t.columns.last.flatMap { ISO8601.date($0.startedAt) }?.formatted(.dateTime.day().month(.abbreviated)) ?? ""
        return "\(n) \(n == 1 ? "session" : "sessions") · last \(last)"
    }
}

/// "Want suggestions on how to progress?" Yes / No, then reps, weight or effort. Asked once per
/// account, on the first workout with a loaded exercise; Me → Settings changes it later.
struct SuggestSetupCard: View {
    @Environment(Store.self) private var store
    @State private var choosing = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Suggestions")
                .font(.caption2.weight(.heavy))
                .textCase(.uppercase)
                .tracking(0.6)
                .foregroundStyle(Brand.coralInk)
            if choosing {
                Text("Progress by reps, weight or effort?").font(.headline).foregroundStyle(Brand.ink)
                ForEach(ProgressMode.allCases) { mode in
                    Button { answer(yes: true, mode: mode) } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(mode.label).font(.subheadline.weight(.bold)).foregroundStyle(Brand.ink)
                            Text(mode.note).font(.footnote).foregroundStyle(Brand.muted).fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Brand.surface, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Brand.line))
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("progress-by-\(mode.rawValue)")
                }
            } else {
                Text("Want suggestions on how to progress?").font(.headline).foregroundStyle(Brand.ink)
                Text("A target for each lift, from what you did last time. Change it any time in Me → Settings.")
                    .font(.footnote)
                    .foregroundStyle(Brand.muted)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 10) {
                    choice("Yes", filled: true) { choosing = true }
                        .accessibilityIdentifier("suggest-yes")
                    choice("No", filled: false) { answer(yes: false) }
                        .accessibilityIdentifier("suggest-no")
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Brand.coralSoft, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Brand.brandLine))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("suggest-setup")
    }

    private func choice(_ title: String, filled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.subheadline.weight(.bold))
                .frame(maxWidth: .infinity, minHeight: 44)
                .foregroundStyle(filled ? Color.white : Brand.ink)
                .background(filled ? Brand.ink : Brand.surface, in: Capsule())
                .overlay(Capsule().strokeBorder(filled ? .clear : Brand.line))
        }
        .buttonStyle(.plain)
    }

    private func answer(yes: Bool, mode: ProgressMode? = nil) {
        let next = store.suggestions.answered(yes: yes, mode: mode)
        Task { await store.setSuggestions(next) }
    }
}

/// The workout week by week: a row per exercise and set, a column per session (Wk 1, Wk 2…), what
/// was logged in each cell with the change since the column before, the newest column highlighted.
/// A tap on an exercise opens it across every workout, with its chart.
struct ProgressTableView: View {
    @Environment(Store.self) private var store
    let runsheet: Runsheet

    private let labelWidth: CGFloat = 112
    private let cellWidth: CGFloat = 92
    private let headerHeight: CGFloat = 44
    private let exerciseHeight: CGFloat = 40
    private let setHeight: CGFloat = 50

    /// A table row: an exercise's name, or one of its sets.
    private enum Line: Identifiable {
        case exercise(key: String, name: String)
        case set(WeekTable.Row)
        var id: String {
            switch self {
            case .exercise(let key, _): "x:\(key)"
            case .set(let r): r.id
            }
        }
    }

    private func lines(_ t: WeekTable.Table) -> [Line] {
        var out: [Line] = []
        for r in t.rows {
            if r.set == 0 { out.append(.exercise(key: r.exerciseKey, name: r.name)) }
            out.append(.set(r))
        }
        return out
    }

    var body: some View {
        let table = WeekTable.table(runsheet, results: store.results, workouts: store.myWorkouts)
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if table.isEmpty {
                    Text("Nothing logged yet. Finish this workout once and every set shows up here, week by week.")
                        .font(.callout)
                        .foregroundStyle(Brand.muted)
                        .padding(.top, 24)
                } else {
                    grid(table)
                    Text("Change since the week before: coral is heavier or more reps. Tap an exercise for it across every workout.")
                        .font(.footnote)
                        .foregroundStyle(Brand.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                suggestionsToggle
            }
            .padding(16)
        }
        .background(Brand.canvas)
        .navigationTitle("Week by week")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func grid(_ table: WeekTable.Table) -> some View {
        let lines = lines(table)
        return HStack(alignment: .top, spacing: 0) {
            // The labels stay put while the weeks scroll.
            VStack(alignment: .leading, spacing: 0) {
                Color.clear.frame(height: headerHeight)
                ForEach(lines) { line in
                    switch line {
                    case .exercise(let key, let name):
                        NavigationLink { ExerciseHistoryView(exerciseKey: key) } label: {
                            // The name runs on over the weeks' empty header row rather than truncating.
                            HStack(spacing: 4) {
                                Text(name).font(.subheadline.weight(.bold)).foregroundStyle(Brand.ink).lineLimit(1)
                                Image(systemName: "chevron.right").font(.caption2.weight(.bold)).foregroundStyle(Brand.faint)
                            }
                            .fixedSize()
                            .frame(width: labelWidth, height: exerciseHeight, alignment: .leading)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("progress-exercise-\(key)")
                    case .set(let r):
                        Text("Set \(r.set + 1)")
                            .font(.footnote)
                            .foregroundStyle(Brand.muted)
                            .frame(width: labelWidth, height: setHeight, alignment: .leading)
                    }
                }
            }
            .frame(width: labelWidth, alignment: .leading)
            // Opaque, so the weeks scroll under the labels rather than through them.
            .background(Brand.surface)
            .zIndex(1)
            ScrollViewReader { proxy in
                ScrollView(.horizontal) {
                    HStack(alignment: .top, spacing: 0) {
                        ForEach(Array(table.columns.enumerated()), id: \.element.id) { i, column in
                            VStack(spacing: 0) {
                                header(column)
                                ForEach(lines) { line in
                                    switch line {
                                    case .exercise: Color.clear.frame(height: exerciseHeight)
                                    case .set(let r): cell(r.cells[i], latest: column.latest)
                                    }
                                }
                            }
                            .frame(width: cellWidth)
                            .background(column.latest ? Brand.coralSoft : Color.clear, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                            .id(column.id)
                        }
                    }
                }
                .scrollIndicators(.hidden)
                .onAppear { if let last = table.columns.last { proxy.scrollTo(last.id, anchor: .trailing) } }
            }
        }
        .padding(.vertical, 8)
        .padding(.leading, 12)
        .cardSurface()
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("progress-table")
    }

    private func header(_ c: WeekTable.Column) -> some View {
        VStack(spacing: 1) {
            Text(c.label)
                .font(.caption.weight(.heavy))
                .foregroundStyle(c.latest ? Brand.coralInk : Brand.ink)
            Text((ISO8601.date(c.startedAt) ?? .distantPast).formatted(.dateTime.day().month(.abbreviated)))
                .font(.caption2)
                .foregroundStyle(Brand.muted)
        }
        .frame(height: headerHeight)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(c.latest ? .isSelected : [])
    }

    @ViewBuilder
    private func cell(_ c: WeekTable.Cell?, latest: Bool) -> some View {
        VStack(spacing: 2) {
            if let c {
                Text(c.text)
                    .font(.footnote.weight(latest ? .bold : .semibold))
                    .monospacedDigit()
                    .foregroundStyle(Brand.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                if let delta = c.delta {
                    Text(delta)
                        .font(.caption2.weight(.bold))
                        .monospacedDigit()
                        .foregroundStyle(c.better == true ? Color.white : Brand.muted)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 1)
                        .background(c.better == true ? Brand.coral : Color.clear, in: Capsule())
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                }
            } else {
                Text("–").font(.footnote).foregroundStyle(Brand.faint)
            }
        }
        .frame(width: cellWidth, height: setHeight)
        .overlay(alignment: .top) { Rectangle().fill(Brand.lineSoft).frame(height: 1) }
    }

    private var suggestionsToggle: some View {
        let on = store.suggestions.on(for: runsheet)
        return VStack(alignment: .leading, spacing: 6) {
            Toggle(isOn: Binding(get: { on }, set: { v in
                Task { await store.setSuggestions(store.suggestions.setting(workout: runsheet, on: v)) }
            })) {
                Text("Suggestions for this workout").font(.subheadline.weight(.semibold)).foregroundStyle(Brand.ink)
            }
            .disabled(!store.suggestions.enabled)
            .tint(Brand.coral)
            .accessibilityIdentifier("workout-suggestions")
            Text(store.suggestions.enabled
                 ? "Off hides Today, the target on the timer, Next time and stall cards for this workout."
                 : "Suggestions are off for your account. Turn them on in Me → Settings.")
                .font(.footnote)
                .foregroundStyle(Brand.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(14)
        .cardSurface()
    }
}
