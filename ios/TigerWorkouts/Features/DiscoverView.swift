import SwiftUI

/// Home. The same three feeds as the web app — Saved, For you, Browse — with the catalogue grouped
/// the way people ask for it: benchmarks, programs, protocols, NHS routines, follow-alongs.
struct DiscoverView: View {
    @Environment(Store.self) private var store
    var onStart: (Runsheet, SessionOrigin?) -> Void

    /// Saved first, as on the web (Nick, 10 Sep 2026: "Saved first on the home screen").
    @State private var tab: Tab = .saved
    @State private var query = ""
    @State private var filter: Kind?
    @State private var writing: Runsheet?
    /// Workouts pushed on this stack; a tigerworkouts://w/<id> link from the website lands here.
    @State private var path: [Opened] = []
    /// A link that arrived before the catalogue was in — a cold launch from the Up next widget —
    /// opened once it is.
    @State private var pendingLink: String?
    @AppStorage(Intent.storageKey) private var intent = Intent.maintain.rawValue
    /// Read again whenever home shows, so a stall dismissed on its page drops off the card.
    @State private var dismissedStalls = StallDismissals.all()

    /// A workout on the stack, with the list it was tapped in: the session it starts records that.
    struct Opened: Hashable {
        var key: String
        var from: SessionOrigin?
    }

    enum Tab: String, CaseIterable, Identifiable {
        case saved = "Saved", forYou = "For you", browse = "Browse"
        var id: String { rawValue }
    }

    /// The catalogue's own source kinds, in the web app's filter order.
    enum Kind: String, CaseIterable, Identifiable {
        case coach, benchmark, program, protocolKind = "protocol", article, video
        var id: String { rawValue }
        var label: String {
            switch self {
            case .coach: "Coaches"
            case .benchmark: "Benchmarks"
            case .program: "Programs"
            case .protocolKind: "Protocols"
            case .article: "NHS"
            case .video: "Follow-alongs"
            }
        }
        var blurb: String {
            switch self {
            case .coach: "Our own, at 15, 30 and 45 minutes"
            case .benchmark: "CrossFit Girls, Heroes and the Open"
            case .program: "StrongLifts, 5/3/1 and friends, day by day"
            case .protocolKind: "Tabata, EMOMs and the 7-minute workout"
            case .article: "Short routines from the NHS"
            case .video: "Timed to the video; the video plays on the web"
            }
        }
    }

    private func kind(of r: Runsheet) -> Kind? { r.source.flatMap { Kind(rawValue: $0.kind) } }

    private var searching: Bool { !query.trimmingCharacters(in: .whitespaces).isEmpty }

    private var results: [Runsheet] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        return store.allWorkouts.filter { sheet in
            (filter == nil || kind(of: sheet) == filter)
                && (q.isEmpty
                    || sheet.title.lowercased().contains(q)
                    || (sheet.creator?.lowercased().contains(q) ?? false)
                    || (sheet.tags ?? []).contains { $0.lowercased().contains(q) }
                    || sheet.exerciseSteps.contains { $0.exercise.name.lowercased().contains(q) })
        }
    }

    /// What you have done, most recent first — the thing you actually do, one tap from launch.
    private var recent: [(sheet: Runsheet, done: Int, last: Date)] {
        let byId = Dictionary(grouping: store.results, by: \.runsheetId)
        return byId.compactMap { id, sessions -> (Runsheet, Int, Date)? in
            guard let sheet = store.workout(id: id) else { return nil }
            return (sheet, sessions.count, sessions.map(\.startedDate).max() ?? .distantPast)
        }
        .sorted { $0.2 > $1.2 }
        .map { (sheet: $0.0, done: $0.1, last: $0.2) }
    }

    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    if !searching, let next = NextUp.find(in: store.allWorkouts, results: store.results) {
                        nextUpCard(next)
                    }
                    if !searching {
                        Picker("Feed", selection: $tab) {
                            ForEach(Tab.allCases) { Text($0.rawValue).tag($0) }
                        }
                        .pickerStyle(.segmented)
                        .padding(.horizontal, 16)
                    }

                    if searching || tab == .browse {
                        browse
                    } else if tab == .forYou {
                        forYou
                    } else {
                        saved
                    }
                }
                .padding(.vertical, 8)
                // Room under the last carousel so it clears the floating tab bar.
                .padding(.bottom, 40)
            }
            .background(Brand.canvas)
            .onAppear { dismissedStalls = StallDismissals.all() }
            .scrollDismissesKeyboard(.immediately)
            .searchable(text: $query, prompt: "Workout, exercise or tag")
            .navigationTitle("TigerWorkouts")
            .navigationDestination(for: Opened.self) { opened in
                if let sheet = store.workout(id: opened.key) {
                    WorkoutDetailView(runsheet: sheet, startedFrom: opened.from, onStart: onStart)
                }
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        writing = Edit.newRunsheet(creator: store.user?.email)
                    } label: {
                        // Spelled out: a bare ＋ in the corner did not read as "write a workout".
                        HStack(spacing: 4) {
                            Image(systemName: "plus")
                            Text("New workout")
                        }
                        .font(.subheadline.weight(.semibold))
                        .fixedSize()
                    }
                    .accessibilityLabel("New workout")
                }
            }
            .onOpenURL { url in
                // tigerworkouts://w/<id>: "Open in the app" on a workout page of the website. The
                // Up next widget's tigerworkouts://do/<id> starts the session (RootView).
                guard url.host == "w", let id = url.pathComponents.dropFirst().first?.removingPercentEncoding else { return }
                if store.loaded { openLink(id) } else { pendingLink = id }
            }
            .onChange(of: store.loaded) { _, loaded in
                guard loaded, let id = pendingLink else { return }
                pendingLink = nil
                openLink(id)
            }
            // New workout opens an empty one on the workout screen: the one editor.
            .navigationDestination(item: $writing) { sheet in
                WorkoutDetailView(runsheet: sheet, isNew: true, onStart: onStart)
            }
        }
    }

    private func openLink(_ id: String) {
        guard store.workout(id: id) != nil else { return }
        query = ""
        path = [Opened(key: id, from: .link)]
    }

    // MARK: - Up next

    /// Only once there is history: the next day of the program you are on, or your last workout,
    /// one tap from launch, and the week so far. The first run stays the catalogue.
    private func nextUpCard(_ next: NextUp) -> some View {
        let streak = EffortModel.streak(store.results)
        return VStack(alignment: .leading, spacing: 12) {
            Text(next.reason)
                .font(.footnote.weight(.bold))
                .foregroundStyle(Brand.coralInk)
            HStack(spacing: 12) {
                Button {
                    path = [Opened(key: next.runsheet.key, from: .home)]
                } label: {
                    HStack(spacing: 12) {
                        WorkoutIcon(runsheet: next.runsheet, size: 52)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(next.runsheet.title)
                                .font(.headline)
                                .foregroundStyle(Brand.ink)
                                .lineLimit(2)
                                .multilineTextAlignment(.leading)
                            Text(["\(next.runsheet.minutes) min", next.runsheet.program?.day].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                                .font(.footnote)
                                .foregroundStyle(Brand.muted)
                        }
                        Spacer(minLength: 0)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("up-next")

                Button {
                    // What the workout page would show: last time's numbers carried over.
                    onStart(store.seeded(next.runsheet), .home)
                } label: {
                    Label("Start", systemImage: "play.fill")
                        .font(.system(size: 17, weight: .semibold))
                        .padding(.horizontal, 18)
                        .frame(minHeight: Tap.regular)
                        .foregroundStyle(.white)
                        .background(Brand.coral, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Start \(next.runsheet.title)")
            }
            if let today = Targets.today(store.prepared(next.runsheet), results: store.results, intent: Intent(rawValue: intent) ?? .maintain, kit: store.equipment) {
                TodayLine(today: today)
            }
            if let stall = Stall.forCard(next.runsheet, results: store.results, dismissed: dismissedStalls) {
                stallLine(stall, in: next.runsheet)
            }
            Divider()
            HStack(spacing: 8) {
                Image(systemName: "chart.line.uptrend.xyaxis").foregroundStyle(Brand.coral)
                // One Text, so a long week line wraps as a sentence instead of splitting into two columns.
                Text("\(Text(NextUp.weekLine(streak)).fontWeight(.semibold).foregroundStyle(Brand.ink)) \(Text("· \(streak.total) all time").foregroundStyle(Brand.muted))")
                    .font(.subheadline)
                Spacer(minLength: 0)
            }
        }
        .padding(16)
        .background(Brand.surface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Brand.brandLine))
        .padding(.horizontal, 16)
    }

    /// One quiet line under Up next when something in it has stalled; the options are a tap away.
    @ViewBuilder
    private func stallLine(_ stall: Stall.Found, in runsheet: Runsheet) -> some View {
        let name = stall.exerciseKey.flatMap { Library.shared.exercise($0)?.name } ?? runsheet.title
        let label = HStack(spacing: 6) {
            Image(systemName: "pause.circle").foregroundStyle(Brand.coralInk)
            Text("\(name) · \(stall.line) · two options")
                .font(.footnote)
                .foregroundStyle(Brand.body)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
            Spacer(minLength: 0)
            Image(systemName: "chevron.right").font(.caption2.weight(.bold)).foregroundStyle(Brand.faint)
        }
        .contentShape(Rectangle())
        Group {
            if let key = stall.exerciseKey {
                NavigationLink { ExerciseHistoryView(exerciseKey: key) } label: { label }
            } else {
                Button { path = [Opened(key: runsheet.key, from: .home)] } label: { label }
            }
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("stall-line")
    }

    // MARK: - For you

    /// Ranked picks from history, the web's For you rules (`Recommend`). A session started from one
    /// records `recommended`, the origin G-06 counts.
    @ViewBuilder
    private var recommendations: some View {
        let recs = Recommend.recommend(store.allWorkouts, results: store.results, saved: Array(store.saved))
        if store.results.isEmpty {
            Text("Log a workout and this list learns what you like. Until then, some good first ones.")
                .font(.footnote)
                .foregroundStyle(Brand.muted)
                .padding(.horizontal, 16)
        }
        if recs.isEmpty {
            if !store.results.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Nothing to suggest yet").font(.headline).foregroundStyle(Brand.ink)
                    Text("Log a couple more workouts and this list learns what you like.")
                        .font(.footnote)
                        .foregroundStyle(Brand.muted)
                    Button("Browse workouts") { tab = .browse }
                        .font(.subheadline.weight(.semibold))
                }
                .padding(.horizontal, 16)
            }
        } else {
            VStack(alignment: .leading, spacing: 14) {
                ForEach(Array(Recommend.grouped(recs).enumerated()), id: \.offset) { _, group in
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(spacing: 6) {
                            Image(systemName: "sparkles")
                            Text(group.reason)
                        }
                        .font(.footnote.weight(.bold))
                        .foregroundStyle(Brand.coralInk)
                        .padding(.horizontal, 16)
                        list(group.picks.map(\.runsheet), from: .recommended)
                    }
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("for-you")
        }
    }

    @ViewBuilder
    private var forYou: some View {
        recommendations
        if !recent.isEmpty {
            section("Pick up again", subtitle: "What you do most") {
                carousel(recent.prefix(10).map(\.sheet), large: true, from: .history)
            }
        }
        if !store.myWorkouts.isEmpty {
            section("Mine", subtitle: "Workouts you wrote") {
                carousel(store.myWorkouts, large: false, from: .mine)
            }
        }
        ForEach(Kind.allCases) { kind in
            let sheets = store.allWorkouts.filter { self.kind(of: $0) == kind }
            if !sheets.isEmpty {
                section(kind.label, subtitle: kind.blurb, seeAll: {
                    filter = kind
                    tab = .browse
                }) {
                    carousel(Array(sheets.prefix(12)), large: false, from: .search)
                }
            }
        }
    }

    // MARK: - Saved

    @ViewBuilder
    private var saved: some View {
        let sheets = store.allWorkouts.filter { store.saved.contains($0.key) }
        if sheets.isEmpty {
            ContentUnavailableView {
                Label("Nothing saved yet", systemImage: "bookmark")
            } description: {
                Text("Tap the bookmark on any workout, or write your own with New workout.")
            } actions: {
                Button("Browse workouts") { tab = .browse }
                    .buttonStyle(.borderedProminent)
            }
            .padding(.top, 40)
        } else {
            list(sheets, from: .saved)
        }
    }

    // MARK: - Browse

    @ViewBuilder
    private var browse: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                chip("All", on: filter == nil) { filter = nil }
                ForEach(Kind.allCases) { kind in
                    chip(kind.label, on: filter == kind) { filter = filter == kind ? nil : kind }
                }
            }
            .padding(.horizontal, 16)
        }
        .scrollIndicators(.hidden)

        let found = results
        Text(found.isEmpty ? "Nothing matches — try a creator, a program or an exercise." : "\(found.count) workout\(found.count == 1 ? "" : "s")")
            .font(.subheadline)
            .foregroundStyle(Brand.muted)
            .padding(.horizontal, 16)
        list(found, from: .search)
    }

    // MARK: - Pieces

    private func section<Content: View>(_ title: String, subtitle: String, seeAll: (() -> Void)? = nil, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.title3.weight(.bold)).foregroundStyle(Brand.ink)
                    Text(subtitle).font(.footnote).foregroundStyle(Brand.muted)
                }
                Spacer()
                if let seeAll {
                    Button("See all", action: seeAll)
                        .font(.subheadline.weight(.semibold))
                }
            }
            .padding(.horizontal, 16)
            content()
        }
    }

    private func carousel(_ sheets: [Runsheet], large: Bool, from: SessionOrigin) -> some View {
        ScrollView(.horizontal) {
            LazyHStack(alignment: .top, spacing: 12) {
                ForEach(sheets, id: \.key) { sheet in
                    NavigationLink(value: Opened(key: sheet.key, from: from)) {
                        WorkoutTile(runsheet: sheet, done: store.doneCount(sheet.key), large: large)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 16)
        }
        .scrollIndicators(.hidden)
    }

    private func list(_ sheets: [Runsheet], from: SessionOrigin) -> some View {
        LazyVStack(spacing: 0) {
            ForEach(Array(sheets.enumerated()), id: \.element.key) { index, sheet in
                if index > 0 { Divider().padding(.leading, 80) }
                NavigationLink(value: Opened(key: sheet.key, from: from)) {
                    WorkoutRow(runsheet: sheet, done: store.doneCount(sheet.key))
                }
                .buttonStyle(.plain)
            }
        }
        .background(Brand.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Brand.line))
        .padding(.horizontal, 16)
    }

    private func chip(_ label: String, on: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(.subheadline.weight(.semibold))
                .padding(.horizontal, 14)
                .frame(height: 36)
                .background(on ? Brand.ink : Brand.surface, in: Capsule())
                .overlay(Capsule().strokeBorder(on ? .clear : Brand.line))
                .foregroundStyle(on ? .white : Brand.ink)
        }
        .buttonStyle(.plain)
    }
}

/// A workout in a carousel: its icon, its name, how long, how hard.
struct WorkoutTile: View {
    let runsheet: Runsheet
    var done: Int
    var large = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            WorkoutIcon(runsheet: runsheet, size: large ? 56 : 44)
            Text(runsheet.title)
                .font((large ? Font.headline : .subheadline).weight(.bold))
                .foregroundStyle(Brand.ink)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
                .frame(maxWidth: .infinity, alignment: .leading)
            Spacer(minLength: 0)
            HStack(spacing: 6) {
                Text("\(runsheet.minutes) min")
                if let level = runsheet.level { Text("· \(level)") }
            }
            .font(.caption)
            .foregroundStyle(Brand.muted)
            if done > 0 {
                Text("done \(done)×")
                    .font(.caption2.weight(.bold))
                    .padding(.horizontal, 7).padding(.vertical, 3)
                    .background(Brand.coralSoft, in: Capsule())
                    .foregroundStyle(Brand.coralInk)
            }
        }
        .padding(14)
        .frame(width: large ? 190 : 150, height: large ? 190 : 168, alignment: .topLeading)
        .background(Brand.surface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Brand.line))
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

/// A workout in a list: icon, name, and what you need to know before you tap.
struct WorkoutRow: View {
    let runsheet: Runsheet
    var done: Int

    var body: some View {
        HStack(spacing: 14) {
            WorkoutIcon(runsheet: runsheet, size: 50)
            VStack(alignment: .leading, spacing: 4) {
                Text(runsheet.title)
                    .font(.body.weight(.semibold))
                    .foregroundStyle(Brand.ink)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                HStack(spacing: 6) {
                    Text("\(runsheet.minutes) min")
                    if let creator = runsheet.creator { Text("· \(creator)").lineLimit(1) }
                    if let level = runsheet.level { Text("· \(level)") }
                }
                .font(.footnote)
                .foregroundStyle(Brand.muted)
            }
            Spacer(minLength: 8)
            if done > 0 {
                Text("\(done)×")
                    .font(.caption.weight(.bold))
                    .padding(.horizontal, 8).padding(.vertical, 4)
                    .background(Brand.coralSoft, in: Capsule())
                    .foregroundStyle(Brand.coralInk)
            }
            Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(Brand.faint)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}
