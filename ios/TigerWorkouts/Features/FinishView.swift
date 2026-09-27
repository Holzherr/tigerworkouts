import SwiftUI

/// The screen a finished session lands on. The session is already saved (it is logged the moment
/// it finishes), so everything here is extra and nothing blocks Done: the celebration and the share
/// card, a one-tap effort, notes, then the stats and the one-time bodyweight question.
struct FinishView: View {
    @Environment(Store.self) private var store
    let result: SessionResult
    let runsheet: Runsheet
    var onClose: () -> Void

    /// Bodyweight is asked for once, on a finish screen, and never again once answered or skipped.
    @AppStorage("bodyweightAsked") private var bodyweightAsked = false
    @State private var bodyweightDraft = EffortModel.defaultBodyweightKg
    @State private var rpe: Double?
    @State private var notes = ""
    @State private var sharing = false
    @FocusState private var notesFocused: Bool

    /// This session as it now stands, with what was tapped here.
    private var current: SessionResult {
        var r = result
        r.rpe = rpe
        r.notes = notes.isEmpty ? nil : notes
        return r
    }

    private var celebration: Celebrate.Celebration { Celebrate.celebrate(current, all: store.results) }
    /// Notes from the last time of this workout, offered back as a starting point.
    private var lastNotes: String? {
        store.results
            .filter { $0.runsheetId == result.runsheetId && $0.rowId != result.rowId && $0.startedAt < result.startedAt }
            .max { $0.startedAt < $1.startedAt }?.notes
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                VStack(spacing: 6) {
                    Stripes().frame(width: 34, height: 28)
                    Text("Workout saved").font(.largeTitle.weight(.bold))
                    Text(runsheet.title).font(.headline).foregroundStyle(Brand.muted)
                }
                .padding(.top, 24)

                CelebrationCard(celebration: celebration, scoreType: runsheet.effectiveScore) { sharing = true }

                EffortRow(value: rpe) { value in
                    rpe = value
                    store.amend(result.rowId) { $0.rpe = value }
                }

                notesField

                SessionStatsView(result: current, runsheet: runsheet, history: store.results, bodyweightKg: store.bodyweightKg)

                if store.bodyweightKg == nil && !bodyweightAsked {
                    bodyweightAsk
                }

                Button("Done") {
                    commitNotes()
                    onClose()
                }
                .buttonStyle(BigButtonStyle())
            }
            .padding(16)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Brand.canvas)
        .sheet(isPresented: $sharing) {
            ShareCardSheet(card: ShareCard(current, celebration, type: runsheet.effectiveScore))
        }
        .onChange(of: notesFocused) { _, focused in if !focused { commitNotes() } }
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
