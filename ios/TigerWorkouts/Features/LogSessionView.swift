import SwiftUI

/// A session done without the phone, logged by hand (review U9, 2026-11-17): the workout's sets
/// pre-filled from last time, as the timer would have logged them done as planned, with the date,
/// the length, the score and the effort to put right. Reached from the workout page's ⋯ menu and
/// from ＋ on History. The web's "Did it already? Log a result" does the same.
enum ManualLog {
    /// The session as if every set had been done as planned, starting at `startedAt` and lasting
    /// `minutes`. No score: what the timer would have measured is not known, so it is typed in.
    static func result(_ r: Runsheet, startedAt: Date, minutes: Int) -> SessionResult {
        let t0 = startedAt.timeIntervalSince1970 * 1000
        let t1 = t0 + Double(minutes) * 60_000
        var s = Runner.start(r, now: t0)
        // An AMRAP's rounds are a guess the timer grows as it goes: its sets are not pre-filled,
        // the score (rounds + reps) says what was done.
        for slot in s.slots where slot.kind == .work && slot.mode != .amrap {
            s.actuals[slot.id, default: Actual()].doneAt = t0
        }
        s.phase = .done
        s.i = s.slots.count
        s.endedAt = t1
        var out = Runner.toResult(s, r, now: t1)
        out.startedAt = ISO8601.string(startedAt)
        out.endedAt = ISO8601.string(Date(timeIntervalSince1970: t1 / 1000))
        out.durationSec = Double(minutes) * 60
        out.completed = true
        out.score = nil
        out.scoreText = nil
        out.capped = nil
        out.capReps = nil
        out.splits = nil
        // No clock ran: no moment in the session a set was done at.
        out.steps = out.steps.map { row in
            var row = row
            row.sets = row.sets?.map { set in
                var set = set
                set.at = nil
                return set
            }
            return row
        }
        return out
    }

    /// The same session at another start or length: the end moves with it.
    static func moved(_ r: SessionResult, startedAt: Date, minutes: Int) -> SessionResult {
        var out = r
        out.startedAt = ISO8601.string(startedAt)
        out.durationSec = Double(minutes) * 60
        out.endedAt = ISO8601.string(startedAt.addingTimeInterval(Double(minutes) * 60))
        return out
    }
}

struct LogSessionView: View {
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss
    let runsheet: Runsheet
    /// Last time's loads still to carry over: the workout page has done it already, the picker not.
    var seed = true
    /// Off when pushed in the picker, whose back button goes back.
    var showsCancel = true
    var onSaved: () -> Void = {}

    @State private var draft: SessionResult?
    @State private var startedAt = Date()
    @State private var minutes = 30
    @State private var saving = false

    private var type: ScoreType { runsheet.effectiveScore }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                VStack(spacing: 4) {
                    Text(runsheet.title).font(.title2.weight(.bold)).foregroundStyle(Brand.ink)
                        .multilineTextAlignment(.center)
                    Text("Done without the timer").font(.subheadline).foregroundStyle(Brand.muted)
                }
                .padding(.top, 8)

                when

                if let draft {
                    if !draft.steps.isEmpty {
                        LoggedSetsCard(session: draft, runsheet: runsheet, compact: true) { self.draft = $0 }
                    }
                    EffortRow(value: draft.rpe) { value in self.draft?.rpe = value }
                }
            }
            .padding(16)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Brand.canvas)
        .navigationTitle("Log a session")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if showsCancel {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") { save() }
                    .fontWeight(.bold)
                    .disabled(draft == nil || saving)
                    .accessibilityIdentifier("log-save")
            }
        }
        .onAppear {
            guard draft == nil else { return }
            minutes = max(1, runsheet.minutes)
            let prepared = store.prepared(seed ? store.seeded(runsheet) : runsheet)
            draft = ManualLog.result(prepared, startedAt: startedAt, minutes: minutes)
        }
    }

    /// When it was done, how long it took and its score.
    private var when: some View {
        VStack(spacing: 0) {
            DatePicker("Started", selection: Binding(get: { startedAt }, set: { date in
                startedAt = date
                draft = draft.map { ManualLog.moved($0, startedAt: date, minutes: minutes) }
            }), in: ...Date())
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .accessibilityIdentifier("log-date")
            Divider().padding(.leading, 14)
            Stepper(value: Binding(get: { minutes }, set: { m in
                minutes = m
                draft = draft.map { ManualLog.moved($0, startedAt: startedAt, minutes: m) }
            }), in: 1...600) {
                HStack {
                    Text("Duration")
                    Spacer()
                    Text("\(minutes) min").monospacedDigit().foregroundStyle(Brand.muted)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .accessibilityIdentifier("log-duration")
            if type != .none {
                Divider().padding(.leading, 14)
                ScoreEntryView(type: type, value: draft?.score) { score in
                    draft = draft.map { ScoreEntryView.scored($0, score, type: type) }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
            }
        }
        .cardSurface()
    }

    private func save() {
        guard let draft else { return }
        saving = true
        Task {
            await store.save(draft)
            onSaved()
            dismiss()
        }
    }
}

/// ＋ on History: pick the workout, then log it. Recently done first; search finds any other.
struct LogPickerView: View {
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""

    /// Workouts done lately, newest first, once each.
    private var recent: [Runsheet] {
        var seen = Set<String>()
        return store.results.sorted { $0.startedAt > $1.startedAt }
            .compactMap { r in seen.insert(r.runsheetId).inserted ? store.workout(id: r.runsheetId) : nil }
            .prefix(8).map { $0 }
    }

    private var found: [Runsheet] {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { return [] }
        return store.allWorkouts.filter { $0.title.localizedCaseInsensitiveContains(q) }.prefix(50).map { $0 }
    }

    var body: some View {
        NavigationStack {
            List {
                if query.isEmpty {
                    if !recent.isEmpty {
                        Section("Done lately") { ForEach(recent, id: \.key, content: row) }
                    }
                    if !store.myWorkouts.isEmpty {
                        Section("Mine") { ForEach(store.myWorkouts, id: \.key, content: row) }
                    }
                } else {
                    ForEach(found, id: \.key, content: row)
                }
            }
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Find a workout")
            .navigationTitle("Log a session")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }

    private func row(_ r: Runsheet) -> some View {
        NavigationLink {
            LogSessionView(runsheet: r, showsCancel: false) { dismiss() }
        } label: {
            HStack(spacing: 12) {
                WorkoutIcon(runsheet: r, size: 36)
                VStack(alignment: .leading, spacing: 2) {
                    Text(r.title).font(.subheadline.weight(.semibold)).foregroundStyle(Brand.ink)
                    Text("\(r.minutes) min").font(.footnote).foregroundStyle(Brand.muted)
                }
            }
        }
    }
}
