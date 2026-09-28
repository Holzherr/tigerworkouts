import SwiftUI

struct HistoryView: View {
    @Environment(Store.self) private var store
    @State private var signingIn = false
    /// Starts a workout again from one of its past sessions ("Do it again").
    var onStart: (Runsheet, SessionOrigin?) -> Void = { _, _ in }

    private var months: [(label: String, sessions: [SessionResult])] {
        let f = DateFormatter()
        f.dateFormat = "MMMM yyyy"
        let grouped = Dictionary(grouping: store.results.sorted { $0.startedAt > $1.startedAt }) {
            f.string(from: $0.startedDate)
        }
        return grouped
            .sorted { ($0.value.first?.startedAt ?? "") > ($1.value.first?.startedAt ?? "") }
            .map { (label: $0.key, sessions: $0.value) }
    }

    var body: some View {
        NavigationStack {
            Group {
                if store.results.isEmpty {
                    VStack(spacing: 18) {
                        Spacer()
                        Image(systemName: "figure.strengthtraining.functional")
                            .font(.system(size: 44, weight: .semibold))
                            .foregroundStyle(Brand.coral)
                            .frame(width: 96, height: 96)
                            .background(Brand.coralSoft, in: Circle())
                        Text("No sessions yet")
                            .font(.title2.weight(.heavy))
                            .foregroundStyle(Brand.ink)
                            .multilineTextAlignment(.center)
                        // Signed out, a session is still saved: on this phone, queued for the account.
                        Text(store.signedIn
                             ? "Finish a workout and it lands here, with what you lifted and what you worked."
                             : "Finish a workout and it lands here, saved on this phone. Sign in to see what you logged on tigerworkouts.com too.")
                            .font(.callout)
                            .foregroundStyle(Brand.muted)
                            .multilineTextAlignment(.center)
                        if !store.signedIn {
                            Button("Sign in") { signingIn = true }
                                .buttonStyle(BigButtonStyle(filled: false))
                                .padding(.top, 6)
                        }
                        Spacer()
                        Spacer()
                    }
                    .padding(.horizontal, 32)
                    .frame(maxWidth: .infinity)
                    .background(Brand.canvas)
                } else {
                    List {
                        if !store.signedIn {
                            Section {
                                Button { signingIn = true } label: {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text("Saved on this phone").font(.subheadline.weight(.semibold)).foregroundStyle(Brand.ink)
                                        Text(store.unsyncedCount > 0
                                             ? "\(store.unsyncedCount) waiting to sync. Sign in to add them to your account."
                                             : "Sign in to sync them to your account.")
                                            .font(.footnote)
                                            .foregroundStyle(Brand.muted)
                                    }
                                }
                                .accessibilityIdentifier("history-signed-out")
                            }
                        }
                        ForEach(months, id: \.label) { month in
                            Section(month.label) {
                                ForEach(month.sessions) { session in
                                    NavigationLink {
                                        SessionDetailView(result: session, onStart: onStart)
                                    } label: {
                                        row(session)
                                    }
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("History")
            .toolbar {
                if store.results.contains(where: { !$0.steps.isEmpty }) {
                    ToolbarItem(placement: .topBarTrailing) {
                        NavigationLink("Exercises") { ExerciseListView() }
                    }
                }
            }
            .sheet(isPresented: $signingIn) {
                SignInView { await store.sync() }
            }
            .refreshable { await store.sync() }
            .overlay(alignment: .bottom) {
                if let error = store.syncError {
                    Text(error)
                        .font(.caption)
                        .padding(10)
                        .background(.thinMaterial, in: Capsule())
                        .padding(.bottom, 8)
                }
            }
        }
    }

    private func row(_ s: SessionResult) -> some View {
        HStack(spacing: 14) {
            // A session whose workout is gone still gets its own colours, from its title.
            WorkoutIcon(runsheet: store.workout(id: s.runsheetId) ?? Runsheet(id: s.runsheetId, title: s.displayTitle), size: 44)
            VStack(alignment: .leading, spacing: 4) {
                Text(s.displayTitle).font(.headline).foregroundStyle(Brand.ink)
                // One line of text, so on a narrow phone it wraps as a sentence; separate Texts in
                // an HStack squeezed the date into a column of its own.
                Text(historyLine(s))
                    .font(.footnote)
                .foregroundStyle(Brand.muted)
            }
        }
        .padding(.vertical, 4)
    }

    private func historyLine(_ s: SessionResult) -> String {
        var parts = [s.startedDate.formatted(date: .abbreviated, time: .shortened)]
        if let d = s.durationSec, d > 0 { parts.append(Format.duration(d)) }
        if s.completed == false { parts.append("part done") }
        if let rpe = s.rpe { parts.append("effort \(Int(rpe))") }
        return parts.joined(separator: " · ")
    }
}

/// One logged session: its stats, what was logged per exercise, and everything that can be changed
/// after the fact, as on the web (`session-detail-screen.tsx`): date, duration, effort and notes,
/// "Do it again", the share card, and Delete behind a confirmation.
struct SessionDetailView: View {
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss
    let result: SessionResult
    /// Set by History; from anywhere else (an exercise's history) the app's own start is used.
    var onStart: ((Runsheet, SessionOrigin?) -> Void)?
    @Environment(\.startSession) private var startSession

    @State private var notes = ""
    @State private var confirmDelete = false
    @State private var sharing = false
    @FocusState private var notesFocused: Bool

    /// The session as the store has it now, so an edit shows at once. Falls back to what was
    /// tapped while it is being deleted.
    private var session: SessionResult { store.results.first { $0.rowId == result.rowId } ?? result }
    private var runsheet: Runsheet? { store.workout(id: session.runsheetId) }
    private var scoreType: ScoreType { runsheet?.effectiveScore ?? .none }
    /// The last time this workout was done before, for the round times.
    private var lastTime: SessionResult? {
        guard session.activity == nil else { return nil }
        return store.results.filter { $0.runsheetId == session.runsheetId && $0.activity == nil && $0.startedAt < session.startedAt && $0.rowId != session.rowId }.max { $0.startedAt < $1.startedAt }
    }
    private func blockName(_ id: String) -> String? { runsheet?.items.compactMap(\.asBlock).first { $0.id == id }?.name }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                SessionStatsView(
                    result: session,
                    runsheet: runsheet,
                    history: store.results,
                    bodyweightKg: store.bodyweightKg
                )

                RoundTimesCard(result: session, last: lastTime, blockName: blockName, records: Rounds.prs(session, all: store.results))

                if !session.steps.isEmpty {
                    LoggedSetsCard(session: session, runsheet: runsheet) { store.update($0) }
                }

                edits

                EffortRow(value: session.rpe) { value in change { $0.rpe = value } }

                TextField("Notes", text: $notes, axis: .vertical)
                    .lineLimit(3...8)
                    .focused($notesFocused)
                    .onSubmit(commitNotes)
                    .accessibilityIdentifier("session-notes")
                    .padding(14)
                    .cardSurface()

                HStack(spacing: 10) {
                    if let runsheet {
                        // Last time's loads carried over, as the workout page would show them.
                        Button("Do it again") { (onStart ?? startSession.run)(store.seeded(runsheet), .history) }
                            .accessibilityIdentifier("do-it-again")
                            .buttonStyle(BigButtonStyle())
                    }
                    Button { sharing = true } label: {
                        Label("Share", systemImage: "square.and.arrow.up")
                    }
                    .buttonStyle(BigButtonStyle(tint: Brand.ink, filled: false))
                    .frame(maxWidth: runsheet == nil ? .infinity : 130)
                    .accessibilityIdentifier("session-share")
                }

                Button(role: .destructive) { confirmDelete = true } label: {
                    Label("Delete session", systemImage: "trash")
                        .font(.body.weight(.semibold))
                        .frame(maxWidth: .infinity, minHeight: Tap.regular)
                }
                .foregroundStyle(Color(light: 0xB91C1C, dark: 0xF87171))
            }
            .padding(16)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Brand.canvas)
        .navigationTitle(session.displayTitle)
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { notes = session.notes ?? "" }
        .onChange(of: notesFocused) { _, focused in if !focused { commitNotes() } }
        .onDisappear(perform: commitNotes)
        .confirmationDialog("Delete this session?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) {
                let doomed = session
                dismiss()
                Task { await store.delete(doomed) }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("It goes from History here and on tigerworkouts.com, and out of Apple Health.")
        }
        .sheet(isPresented: $sharing) {
            let c = Celebrate.celebrate(session, all: store.results)
            ShareCardSheet(card: ShareCard(session, c, type: scoreType))
        }
    }

    /// When it started and how long it took. Moving the start keeps the length; changing the
    /// length moves the end.
    private var edits: some View {
        VStack(spacing: 0) {
            DatePicker(
                "Started",
                selection: Binding(
                    get: { session.startedDate },
                    set: { date in
                        change { r in
                            let shift = date.timeIntervalSince(r.startedDate)
                            r.startedAt = ISO8601.string(date)
                            if let end = r.endedAt.flatMap(ISO8601.date) { r.endedAt = ISO8601.string(end.addingTimeInterval(shift)) }
                        }
                    }
                )
            )
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .accessibilityIdentifier("session-date")
            if session.activity == nil {
                Divider().padding(.leading, 14)
                Stepper(
                    value: Binding(
                        get: { max(1, Int(((session.durationSec ?? 0) / 60).rounded())) },
                        set: { minutes in
                            change { r in
                                r.durationSec = Double(minutes) * 60
                                if r.endedAt != nil { r.endedAt = ISO8601.string(r.startedDate.addingTimeInterval(Double(minutes) * 60)) }
                            }
                        }
                    ),
                    in: 1...600
                ) {
                    HStack {
                        Text("Duration")
                        Spacer()
                        Text("\(max(1, Int(((session.durationSec ?? 0) / 60).rounded()))) min").monospacedDigit().foregroundStyle(Brand.muted)
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .accessibilityIdentifier("session-duration")
            }
        }
        .cardSurface()
    }

    private func change(_ edit: @escaping (inout SessionResult) -> Void) {
        var r = session
        edit(&r)
        store.update(r)
    }

    private func commitNotes() {
        let value = notes.trimmingCharacters(in: .whitespacesAndNewlines)
        guard store.results.contains(where: { $0.rowId == result.rowId }), (session.notes ?? "") != value else { return }
        change { $0.notes = value.isEmpty ? nil : value }
    }
}
