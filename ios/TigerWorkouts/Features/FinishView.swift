import SwiftUI

/// The screen a finished session lands on. The session is already saved (it is logged the moment
/// it finishes), so everything here is extra and nothing blocks Done: the celebration and the share
/// card, a one-tap effort, notes, then the stats and the one-time bodyweight question.
struct FinishView: View {
    @Environment(Store.self) private var store
    let result: SessionResult
    let runsheet: Runsheet
    var onClose: () -> Void
    /// Takes the session out again: the phone, the account and Health.
    var onDiscard: () -> Void = {}

    /// Bodyweight is asked for once, on a finish screen, and never again once answered or skipped.
    @AppStorage("bodyweightAsked") private var bodyweightAsked = false
    @State private var bodyweightDraft = EffortModel.defaultBodyweightKg
    @State private var rpe: Double?
    @State private var notes = ""
    /// The score as corrected here; nil until it is touched.
    @State private var score: Double??
    /// Made it / Missed and AMRAP reps as set here, by step id.
    @State private var success: [String: Bool] = [:]
    @State private var repsDone: [String: Double] = [:]
    @State private var sharing = false
    @State private var confirmDiscard = false
    @FocusState private var notesFocused: Bool

    /// This session as it now stands, with what was tapped here.
    private var current: SessionResult {
        var r = result
        r.rpe = rpe
        r.notes = notes.isEmpty ? nil : notes
        if let score { r = ScoreEntryView.scored(r, score, type: runsheet.effectiveScore) }
        r.steps = r.steps.map { Self.marked($0, success: success[$0.stepId], reps: repsDone[$0.stepId]) }
        return r
    }

    /// A row with what was set on the finish screen.
    static func marked(_ row: StepResult, success: Bool?, reps: Double?) -> StepResult {
        var row = row
        if let success { row.success = success }
        if let reps { row.reps = [reps] }
        return row
    }

    /// What the program's rules make of this session, as it now stands.
    private var nextLoads: [ProgressionRules.NextLoad] {
        ProgressionRules.nextLoads(runsheet, last: current, history: store.results, maxes: store.trainingMaxes, kit: Equipment.current())
    }

    private var celebration: Celebrate.Celebration { Celebrate.celebrate(current, all: store.results, lineage: runsheet.lineage) }
    /// Notes from the last time of this workout, offered back as a starting point.
    private var lastNotes: String? {
        store.results
            .filter { $0.runsheetId == result.runsheetId && $0.rowId != result.rowId && $0.startedAt < result.startedAt }
            .max { $0.startedAt < $1.startedAt }?.notes
    }

    private func blockName(_ id: String) -> String? { runsheet.items.compactMap(\.asBlock).first { $0.id == id }?.name }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                VStack(spacing: 6) {
                    Stripes().frame(width: 34, height: 28)
                    Text("Workout saved").font(.largeTitle.weight(.bold))
                    Text(runsheet.title).font(.headline).foregroundStyle(Brand.muted)
                }
                .padding(.top, 24)

                CelebrationCard(celebration: celebration, scoreType: runsheet.effectiveScore, blockName: blockName) { sharing = true }

                if runsheet.effectiveScore != .none {
                    ScoreEntryView(type: runsheet.effectiveScore, value: current.score) { value in
                        score = .some(value)
                        let type = runsheet.effectiveScore
                        store.amend(result.rowId) { $0 = ScoreEntryView.scored($0, value, type: type) }
                    }
                    .padding(14)
                    .cardSurface()
                    .accessibilityIdentifier("score-entry")
                }

                RoundTimesCard(result: current, last: celebration.last, blockName: blockName, records: celebration.rounds)

                EffortRow(value: rpe) { value in
                    rpe = value
                    store.amend(result.rowId) { $0.rpe = value }
                }

                notesField

                SessionStatsView(result: current, runsheet: runsheet, history: store.results, bodyweightKg: store.bodyweightKg)

                MadeItCard(runsheet: runsheet, result: current) { id, ok in
                    success[id] = ok
                    store.amend(result.rowId) { r in r.steps = r.steps.map { $0.stepId == id ? Self.marked($0, success: ok, reps: nil) : $0 } }
                } onReps: { id, reps, planned in
                    repsDone[id] = reps
                    // An AMRAP set is made when it reaches the reps it asks for, as on the web.
                    let amrap = runsheet.exerciseSteps.first { $0.id == id }?.forMode == .amrap
                    if amrap { success[id] = reps >= planned }
                    let ok: Bool? = amrap ? reps >= planned : nil
                    store.amend(result.rowId) { r in r.steps = r.steps.map { $0.stepId == id ? Self.marked($0, success: ok, reps: reps) : $0 } }
                }

                NextTimeView(runsheet: runsheet, result: current, history: store.results, loads: nextLoads)

                if store.bodyweightKg == nil && !bodyweightAsked {
                    bodyweightAsk
                }

                Button("Done") {
                    commitNotes()
                    bumpTrainingMaxes()
                    onClose()
                }
                .buttonStyle(BigButtonStyle())

                // Started by mistake, or not worth keeping: the session is already saved, so this
                // deletes it, and asks first.
                Button("Discard workout", role: .destructive) { confirmDiscard = true }
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Brand.muted)
                    .frame(minHeight: 44)
                    .accessibilityIdentifier("discard-workout")
            }
            .padding(16)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Brand.canvas)
        .sheet(isPresented: $sharing) {
            ShareCardSheet(card: ShareCard(current, celebration, type: runsheet.effectiveScore))
        }
        .onChange(of: notesFocused) { _, focused in if !focused { commitNotes() } }
        .confirmationDialog("Discard this workout?", isPresented: $confirmDiscard, titleVisibility: .visible) {
            Button("Discard workout", role: .destructive) { onDiscard() }
            Button("Keep it", role: .cancel) {}
        } message: {
            Text("It comes out of History here and on the web, and out of Apple Health.")
        }
    }

    private var notesField: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let last = lastNotes, notes.isEmpty {
                Button { notes = last } label: {
                    (Text("Last time: ").bold().foregroundColor(Brand.ink) + Text(last).foregroundColor(Brand.muted) + Text(" · tap to reuse").foregroundColor(Brand.coralInk))
                        .font(.footnote)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(.plain)
            }
            TextField("Notes (how it felt, what to change)", text: $notes, axis: .vertical)
                .lineLimit(2...6)
                .focused($notesFocused)
                .accessibilityIdentifier("finish-notes")
                .padding(14)
                .cardSurface()
        }
    }

    /// An AMRAP set that reached the program's mark moves its training max, as Save does on the
    /// web; the next session's loads are worked out from the new one.
    private func bumpTrainingMaxes() {
        for n in nextLoads where n.tmBump {
            guard let to = n.to else { continue }
            let key = n.exerciseKey
            Task { await store.setTrainingMax(key, to) }
        }
    }

    private func commitNotes() {
        let value = notes.trimmingCharacters(in: .whitespacesAndNewlines)
        guard (store.results.first { $0.rowId == result.rowId }?.notes ?? "") != value else { return }
        store.amend(result.rowId) { $0.notes = value.isEmpty ? nil : value }
    }

    /// Light and skippable: one stepper, Save or Skip. Health's figure, when there is one, has
    /// already filled the bodyweight in, so this never shows then.
    private var bodyweightAsk: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("What do you weigh?").font(.headline).foregroundStyle(Brand.ink)
            Text("The calorie estimate assumes \(Int(EffortModel.defaultBodyweightKg)) kg until you say. Change it any time under Me.")
                .font(.footnote)
                .foregroundStyle(Brand.muted)
            Stepper(value: $bodyweightDraft, in: 35...200, step: 0.5) {
                Text("\(Format.number(bodyweightDraft)) kg").font(.title3.weight(.bold)).monospacedDigit()
            }
            .accessibilityIdentifier("bodyweight-stepper")
            HStack {
                Button("Skip") { bodyweightAsked = true }
                    .foregroundStyle(Brand.muted)
                Spacer()
                Button("Save") {
                    bodyweightAsked = true
                    let kg = bodyweightDraft
                    Task { await store.setBodyweight(kg) }
                }
                .fontWeight(.semibold)
                .foregroundStyle(Brand.coralInk)
            }
            .padding(.top, 2)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface()
    }
}
