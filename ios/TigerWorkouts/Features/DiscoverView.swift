import SwiftUI

/// Home, as Nick picked it after Priyanka found it too busy (17 Oct 2026): a plain list. Two pill
/// tabs under the search field. Mine: what your coach sent, then your own and saved workouts, each
/// row one tap to its page and a coral play to start it. Discover: the For you picks and the whole
/// catalogue, filtered by kind. Searching lists matches from everything.
struct DiscoverView: View {
    @Environment(Store.self) private var store
    var onStart: (Runsheet, SessionOrigin?) -> Void

    @State private var tab: Tab = .mine
    @State private var query = ""
    @State private var filter: Kind?
    @State private var writing: Runsheet?
    /// Workouts pushed on this stack; a tigerworkouts://w/<id> link from the website lands here.
    @State private var path: [Opened] = []
    /// A link that arrived before the catalogue was in — a cold launch from the Up next widget —
    /// opened once it is.
    @State private var pendingLink: String?

    /// A workout on the stack, with the list it was tapped in: the session it starts records that.
    struct Opened: Hashable {
        var key: String
        var from: SessionOrigin?
    }

    enum Tab: String, CaseIterable, Identifiable {
        case mine = "Mine", discover = "Discover"
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

    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 10) {
                    if searching {
                        browse
                    } else {
                        tabs
                        if tab == .mine { mine } else { discover }
                    }
                }
                .padding(.vertical, 8)
                // Room under the last row so it clears the floating tab bar.
                .padding(.bottom, 40)
            }
            .background(Brand.canvas)
            .refreshable { await store.sync() }
            .scrollDismissesKeyboard(.immediately)
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search")
            .navigationTitle("Workouts")
            .navigationBarTitleDisplayMode(.large)
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
                        Image(systemName: "plus")
                            .font(.system(size: 17, weight: .bold))
                            .foregroundStyle(Brand.coralInk)
                            .frame(width: 36, height: 36)
                            .background(Brand.coralSoft, in: Circle())
                            .frame(width: 44, height: 44)
                            .contentShape(Circle())
                    }
                    .buttonStyle(.plain)
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

    // MARK: - Tabs

    private var tabs: some View {
        HStack(spacing: 8) {
            ForEach(Tab.allCases) { t in
                pill(t.rawValue, on: tab == t) { tab = t }
                    .accessibilityAddTraits(tab == t ? .isSelected : [])
            }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 4)
    }

    // MARK: - Mine

    @ViewBuilder
    private var mine: some View {
        // What your coach sent comes first: it is the reason you opened the app today.
        let assigned = store.coachAssignments.compactMap { a in store.workout(id: a.workoutId).map { (a, $0) } }
        let sheets = Home.mine(own: store.myWorkouts, all: store.allWorkouts, saved: store.saved, results: store.results, skip: Set(assigned.map(\.1.key)))
        let last = Home.lastDone(store.results)
        let own = Set(store.myWorkouts.map(\.key))
        if assigned.isEmpty && sheets.isEmpty {
            ContentUnavailableView {
                Label("No workouts yet", systemImage: "bookmark")
            } description: {
                Text("Write your own with +, or save one from Discover.")
            } actions: {
                Button("Discover workouts") { tab = .discover }
                    .buttonStyle(.borderedProminent)
            }
            .padding(.top, 40)
        } else {
            ForEach(assigned, id: \.0.id) { pair in
                let (a, sheet) = pair
                let coach = Coaching.name(of: a.coach, in: store.coaching)
                let done = Coaching.isDone(a, results: store.results)
                row(sheet, meta: "\(sheet.minutes) min · from \(coach)\(done ? " · done" : "")", tint: Brand.coralInk, from: .coach, play: true)
            }
            ForEach(sheets, id: \.key) { sheet in
                let mine = own.contains(sheet.key)
                row(sheet, meta: Home.line(minutes: sheet.minutes, lastDone: Home.lastDone(of: sheet, in: last), isNew: mine), from: mine ? .mine : .saved, play: true)
            }
        }
    }

    // MARK: - Discover

    /// The kind chips, then the For you picks under their reasons while no chip is on, then the
    /// catalogue.
    @ViewBuilder
    private var discover: some View {
        chips
        if filter == nil {
            let recs = Recommend.recommend(store.allWorkouts, results: store.results, saved: Array(store.saved))
            if !recs.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(Array(Recommend.grouped(recs).enumerated()), id: \.offset) { _, group in
                        header(group.reason, tint: Brand.coralInk)
                        ForEach(group.picks, id: \.runsheet.key) { pick in
                            row(pick.runsheet, meta: about(pick.runsheet), from: .recommended)
                        }
                    }
                }
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("for-you")
            }
        }
        catalogue
    }

    // MARK: - Browse

    @ViewBuilder
    private var browse: some View {
        chips
        catalogue
    }

    @ViewBuilder
    private var catalogue: some View {
        let found = results
        header(found.isEmpty ? "Nothing matches — try a creator, a program or an exercise." : "\(found.count) workout\(found.count == 1 ? "" : "s")")
        ForEach(found, id: \.key) { sheet in
            row(sheet, meta: about(sheet), from: .search)
        }
    }

    private var chips: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                pill("All", on: filter == nil) { filter = nil }
                ForEach(Kind.allCases) { kind in
                    pill(kind.label, on: filter == kind) { filter = filter == kind ? nil : kind }
                }
            }
            .padding(.horizontal, 16)
        }
        .scrollIndicators(.hidden)
    }

    // MARK: - Pieces

    /// "20 min · CrossFit · Beginner".
    private func about(_ r: Runsheet) -> String {
        (["\(r.minutes) min"] + [r.creator, r.level].compactMap { $0 }.filter { !$0.isEmpty }).joined(separator: " · ")
    }

    private func header(_ text: String, tint: Color = Brand.muted) -> some View {
        Text(text)
            .font(.footnote.weight(.bold))
            .foregroundStyle(tint)
            .padding(.horizontal, 20)
            .padding(.top, 6)
    }

    /// One workout as a card: its name and one meta line open its page; with `play`, a coral play
    /// button on the right starts it straight away, last time's numbers carried over.
    private func row(_ sheet: Runsheet, meta: String, tint: Color = Brand.muted, from: SessionOrigin, play: Bool = false) -> some View {
        HStack(spacing: 12) {
            NavigationLink(value: Opened(key: sheet.key, from: from)) {
                HStack(spacing: 8) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(sheet.title)
                            .font(.body.weight(.semibold))
                            .foregroundStyle(Brand.ink)
                            .lineLimit(2)
                            .multilineTextAlignment(.leading)
                        Text(meta)
                            .font(.footnote)
                            .foregroundStyle(tint)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 0)
                    if !play {
                        Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(Brand.faint)
                    }
                }
                .frame(minHeight: 44)
                .contentShape(Rectangle())
                .accessibilityElement(children: .combine)
            }
            .buttonStyle(.plain)
            if play {
                Button {
                    onStart(store.seeded(sheet), from)
                } label: {
                    Image(systemName: "play.fill")
                        .font(.system(size: 17, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 44, height: 44)
                        .background(Brand.coral, in: Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Start \(sheet.title)")
            }
        }
        .padding(.leading, 16)
        .padding(.trailing, play ? 10 : 14)
        .padding(.vertical, 10)
        .background(Brand.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Brand.line))
        .padding(.horizontal, 16)
    }

    private func pill(_ label: String, on: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(.subheadline.weight(.semibold))
                .padding(.horizontal, 16)
                .frame(height: 36)
                .background(on ? Brand.ink : Brand.surface, in: Capsule())
                .overlay(Capsule().strokeBorder(on ? .clear : Brand.line))
                .foregroundStyle(on ? Brand.canvas : Brand.ink)
                .frame(minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
