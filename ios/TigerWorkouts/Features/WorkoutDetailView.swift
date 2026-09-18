import SwiftUI

/// A workout before you start it: what it is, where it came from, and every step with its photo.
/// The page is the editor: drag to reorder, swipe to remove, tap to change — no edit mode to find.
struct WorkoutDetailView: View {
    @Environment(Store.self) private var store
    @State var runsheet: Runsheet
    var onStart: (Runsheet) -> Void

    @State private var editing: ExerciseStep?
    @State private var editingRest: RestStep?
    @State private var writing: Runsheet?
    @State private var picking: PickTarget?
    @State private var sessionOnly = false
    @State private var pendingSave: Task<Void, Never>?

    private struct PickTarget: Identifiable {
        var id: String { blockId ?? "loose" }
        var blockId: String?
    }

    private var saved: Bool { store.saved.contains(runsheet.key) }

    var body: some View {
        List {
            Section {
                header
                if let description = runsheet.description, !description.isEmpty {
                    Text(description)
                        .font(.callout)
                        .foregroundStyle(Brand.body)
                        .lineSpacing(3)
                }
                if sessionOnly { sessionOnlyBanner }
                Text("Hold and drag to reorder · swipe to remove · tap to change")
                    .font(.footnote)
                    .foregroundStyle(Brand.faint)
            }
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
            .listRowInsets(EdgeInsets(top: 6, leading: 4, bottom: 6, trailing: 4))

            ForEach(runsheet.items, id: \.id) { item in
                switch item {
                case .block(let b): blockSection(b)
                case .step(let s): looseSection(s)
                case .ref: EmptyView()
                }
            }

            Section {
                Button { apply(Edit.addBlock(runsheet)) } label: {
                    Label("Add block", systemImage: "square.stack.3d.up")
                }
                .foregroundStyle(Brand.coralInk)
            }
            .listRowBackground(Brand.surface)
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Brand.canvas)
        .navigationTitle(runsheet.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    if store.isMine(runsheet) {
                        Button {
                            writing = runsheet
                        } label: {
                            Label("Name, blocks and rounds", systemImage: "square.and.pencil")
                        }
                    } else {
                        // A catalogue workout is never written over: you get a copy of your own.
                        Button {
                            saveAsMine()
                        } label: {
                            Label("Save as my workout", systemImage: "doc.on.doc")
                        }
                    }
                    if let url = runsheet.source?.url.flatMap(URL.init(string:)) {
                        Link(destination: url) {
                            Label("Open the original", systemImage: "arrow.up.right.square")
                        }
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
        }
        .sheet(item: $writing) { sheet in
            WorkoutEditorView(runsheet: sheet, isExisting: store.isMine(sheet)) { saved in
                // Editing in place should leave this screen showing what was just saved.
                if saved.key == runsheet.key { runsheet = saved }
            }
        }
        .safeAreaInset(edge: .bottom) { bottomBar }
        .sheet(item: $editing) { step in
            ExerciseSheet(
                step: step,
                target: bind(step.id, \.target),
                incline: bind(step.id, \.incline),
                onDrop: { apply(Edit.removeStep(runsheet, stepId: step.id)) },
                dropLabel: "Remove from this workout"
            )
            .presentationDetents([.medium, .large])
        }
        .sheet(item: $editingRest) { rest in
            RestEditorView(seconds: rest.seconds) { seconds in
                apply(Edit.updateRest(runsheet, id: rest.id, seconds: seconds))
            } onRemove: {
                apply(Edit.removeStep(runsheet, stepId: rest.id))
            }
        }
        .sheet(item: $picking) { target in
            ExercisePickerView { exercise in
                apply(Edit.addExercise(runsheet, to: target.blockId, exercise: exercise))
            }
        }
        .onDisappear { flushSave() }
    }

    // MARK: - Editing in place

    /// Every change goes through here. Your own workout saves itself a moment after the last
    /// change; a catalogue workout is never written over, so its changes ride along into the
    /// session you start and the banner offers to keep them as a copy.
    private func apply(_ next: Runsheet) {
        runsheet = next
        if let id = editing?.id { editing = find(id) }
        if store.isMine(runsheet) {
            scheduleSave()
        } else {
            sessionOnly = true
        }
    }

    private func scheduleSave() {
        pendingSave?.cancel()
        let sheet = runsheet
        pendingSave = Task {
            try? await Task.sleep(for: .milliseconds(700))
            guard !Task.isCancelled else { return }
            await store.saveWorkout(sheet)
        }
    }

    private func flushSave() {
        guard let task = pendingSave, !task.isCancelled, store.isMine(runsheet) else { return }
        task.cancel()
        let sheet = runsheet
        Task { await store.saveWorkout(sheet) }
    }

    private func saveAsMine() {
        let wasSaved = saved
        let copy = Edit.duplicate(runsheet, creator: store.user?.email)
        runsheet = copy
        sessionOnly = false
        Task {
            await store.saveWorkout(copy)
            if wasSaved { await store.toggleSaved(copy.key) }
        }
    }

    private var sessionOnlyBanner: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Changed for this session").font(.subheadline.weight(.semibold)).foregroundStyle(Brand.ink)
                Text("Keep them by saving your own copy.").font(.footnote).foregroundStyle(Brand.muted)
            }
            Spacer()
            Button("Save as mine") { saveAsMine() }
                .font(.subheadline.weight(.bold))
                .padding(.horizontal, 14)
                .frame(height: 36)
                .background(Brand.coral, in: Capsule())
                .foregroundStyle(.white)
                .buttonStyle(.plain)
        }
        .padding(12)
        .background(Brand.coralSoft, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 14) {
            WorkoutIcon(runsheet: runsheet, size: 64)
            VStack(alignment: .leading, spacing: 8) {
                Text(runsheet.title)
                    .font(.system(size: 26, weight: .heavy))
                    .foregroundStyle(Brand.ink)
                    .fixedSize(horizontal: false, vertical: true)
                if !meta.isEmpty {
                    Text(meta).font(.subheadline).foregroundStyle(Brand.muted)
                }
                HStack(spacing: 6) {
                    pill("\(runsheet.minutes) min", filled: true)
                    if let level = runsheet.level { pill(level, filled: false) }
                    if store.doneCount(runsheet.key) > 0 { pill("done \(store.doneCount(runsheet.key))×", filled: false, brand: true) }
                }
            }
        }
        .padding(.bottom, 4)
    }

    /// "Benchmark · CrossFit", "Program · StrongLifts · Day A" — what it is, and whose.
    private var meta: String {
        var parts: [String] = []
        switch runsheet.source?.kind {
        case "benchmark": parts.append("Benchmark")
        case "program": parts.append("Program")
        case "protocol": parts.append("Protocol")
        case "article": parts.append("NHS")
        case "video": parts.append("Follow-along")
        case "user": parts.append("Yours")
        default: break
        }
        if let creator = runsheet.creator { parts.append(creator) }
        if let program = runsheet.program, !program.day.isEmpty { parts.append(program.day) }
        return parts.joined(separator: " · ")
    }

    private func pill(_ text: String, filled: Bool, brand: Bool = false) -> some View {
        Text(text)
            .font(.subheadline.weight(.bold))
            .padding(.horizontal, 12)
            .frame(height: 30)
            .background(brand ? Brand.coralSoft : (filled ? Brand.lineSoft : Brand.surface), in: Capsule())
            .overlay(Capsule().strokeBorder(filled || brand ? .clear : Brand.line))
            .foregroundStyle(brand ? Brand.coralInk : Brand.ink)
    }

    private var bottomBar: some View {
        HStack(spacing: 10) {
            Button {
                onStart(Settings.withLastUsed(runsheet, results: store.results))
            } label: {
                Label("Start workout", systemImage: "play.fill")
            }
            .buttonStyle(BigButtonStyle())

            Button {
                Task { await store.toggleSaved(runsheet.key) }
            } label: {
                Image(systemName: saved ? "bookmark.fill" : "bookmark")
                    .font(.system(size: 20, weight: .semibold))
                    .frame(width: Tap.big, height: Tap.big)
                    .background(Brand.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Brand.line))
                    .foregroundStyle(saved ? Brand.coral : Brand.ink)
            }
            .accessibilityLabel(saved ? "Remove from saved" : "Save to my list")
        }
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 6)
        .background(.bar)
    }

    private func blockSection(_ b: Block) -> some View {
        Section {
            ForEach(b.steps) { step in
                stepRow(step)
                    .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 0, trailing: 0))
                    .listRowBackground(Brand.surface)
            }
            .onMove { from, to in apply(Edit.moveSteps(runsheet, in: b.id, from: from, to: to)) }
            .onDelete { offsets in
                let ids = offsets.map { b.steps[$0].id }
                apply(ids.reduce(runsheet) { Edit.removeStep($0, stepId: $1) })
            }

            Button { picking = PickTarget(blockId: b.id) } label: {
                Label("Add exercise", systemImage: "plus")
                    .font(.subheadline.weight(.semibold))
            }
            .foregroundStyle(Brand.coralInk)
            .listRowBackground(Brand.surface)
        } header: {
            HStack(alignment: .firstTextBaseline) {
                Text(b.name).font(.headline).foregroundStyle(Brand.ink)
                Text(Format.duration(b.estimatedSeconds)).font(.footnote).foregroundStyle(Brand.muted)
                Spacer()
                Text(b.modeLabel)
                    .font(.footnote.weight(.bold))
                    .padding(.horizontal, 10).frame(height: 24)
                    .background(Brand.coralSoft, in: Capsule())
                    .foregroundStyle(Brand.coralInk)
            }
            .textCase(nil)
            .padding(.horizontal, -4)
        }
    }

    private func looseSection(_ s: Step) -> some View {
        Section {
            stepRow(s)
                .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 0, trailing: 0))
                .listRowBackground(Brand.surface)
                .swipeActions {
                    Button("Remove", role: .destructive) { apply(Edit.removeStep(runsheet, stepId: s.id)) }
                }
        }
    }

    @ViewBuilder
    private func stepRow(_ step: Step) -> some View {
        switch step {
        case .rest(let r):
            Button { editingRest = r } label: {
            HStack(spacing: 14) {
                Image(systemName: "pause.fill")
                    .font(.system(size: 16, weight: .bold))
                    .frame(width: 48, height: 48)
                    .background(Brand.well, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .foregroundStyle(Brand.rest.opacity(0.7))
                Text("Rest").foregroundStyle(Brand.body)
                Spacer()
                Text(Format.clock(r.seconds)).font(.body.weight(.semibold)).monospacedDigit().foregroundStyle(Brand.ink)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        case .exercise(let e):
            Button { editing = e } label: {
                HStack(spacing: 14) {
                    ExerciseThumb(ref: e.exercise, size: 48)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(e.exercise.name).font(.body.weight(.medium)).foregroundStyle(Brand.ink)
                        if !settingSummary(e).isEmpty {
                            Text(settingSummary(e)).font(.footnote).foregroundStyle(Brand.muted)
                        }
                    }
                    Spacer(minLength: 8)
                    Text(e.forLabel).font(.body.weight(.semibold)).monospacedDigit().foregroundStyle(Brand.ink)
                    Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(Brand.faint)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
    }

    private func settingSummary(_ e: ExerciseStep) -> String {
        var parts: [String] = []
        if !e.loadLabel.isEmpty { parts.append(e.loadLabel) }
        if let incline = e.incline { parts.append("\(Format.number(incline))% incline") }
        return parts.joined(separator: " · ")
    }

    /// Stepper changes take the same path as every other edit.
    private func bind(_ stepId: String, _ path: WritableKeyPath<ExerciseStep, Double?>) -> Binding<Double?> {
        Binding(
            get: { find(stepId)?[keyPath: path] },
            set: { value in apply(Edit.updateStep(runsheet, id: stepId) { $0[keyPath: path] = value }) }
        )
    }

    private func find(_ stepId: String) -> ExerciseStep? {
        runsheet.exerciseSteps.first { $0.id == stepId }
    }
}
