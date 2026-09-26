import SwiftUI

/// A workout before you start it, and the one place it is edited (specs/unified-editing.md): hold
/// and drag a step or a whole block, swipe to remove, tap to change — no edit mode to find.
struct WorkoutDetailView: View {
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State var runsheet: Runsheet
    /// A workout being written from ＋: it saves itself once it has a name and an exercise.
    var isNew = false
    var onStart: (Runsheet) -> Void

    @State private var editing: ExerciseStep?
    @State private var changingAmount: ExerciseStep?
    @State private var naming = false
    @State private var confirmDelete = false
    @State private var seeded = false
    @State private var pendingSave: Task<Void, Never>?

    private var saved: Bool { store.saved.contains(runsheet.key) }
    private var editable: Bool { isNew || store.isMine(runsheet) }

    var body: some View {
        RunsheetEditor(
            runsheet: runsheet,
            summary: settingSummary,
            onExercise: { editing = $0 },
            apply: apply
        ) {
            Section {
                header
                if let description = runsheet.description, !description.isEmpty {
                    Text(description)
                        .font(.callout)
                        .foregroundStyle(Brand.body)
                        .lineSpacing(3)
                }
                Text("Hold and drag to move a step or a whole block · swipe to remove · tap to change")
                    .font(.footnote)
                    .foregroundStyle(Brand.faint)
            }
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
            .listRowInsets(EdgeInsets(top: 6, leading: 4, bottom: 6, trailing: 4))
        }
        .navigationTitle(runsheet.title.isEmpty ? "New workout" : runsheet.title)
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            // Seed once, before the numbers are seen: the screen shows what the session will start
            // with, and Start runs exactly what the screen shows. Seeding at Start instead put last
            // time's numbers back over what had just been set here.
            guard !seeded else { return }
            seeded = true
            runsheet = Settings.withLastUsed(runsheet, results: store.results)
            if isNew && runsheet.title.isEmpty { naming = true }
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu("Edit") {
                    Button { naming = true } label: {
                        Label("Name and creator", systemImage: "character.cursor.ibeam")
                    }
                    Button { duplicate() } label: {
                        Label("Duplicate", systemImage: "plus.square.on.square")
                    }
                    if let url = runsheet.source?.url.flatMap(URL.init(string:)) {
                        Link(destination: url) {
                            Label("Open the original", systemImage: "arrow.up.right.square")
                        }
                    }
                    if store.isMine(runsheet) {
                        Button {
                            var next = runsheet
                            next.isPublic = !(runsheet.isPublic ?? false)
                            apply(next)
                        } label: {
                            (runsheet.isPublic ?? false)
                                ? Label("Make private", systemImage: "lock")
                                : Label("Make public on my page", systemImage: "globe")
                        }
                        Button(role: .destructive) { confirmDelete = true } label: {
                            Label("Delete workout", systemImage: "trash")
                        }
                    }
                }
            }
        }
        .safeAreaInset(edge: .bottom) { bottomBar }
        .sheet(item: $editing) { step in
            ExerciseSheet(
                step: step,
                target: bind(step.id, \.target),
                incline: bind(step.id, \.incline),
                onDrop: { apply(Edit.removeStep(runsheet, stepId: step.id)) },
                dropLabel: "Remove from this workout",
                onAmount: { changingAmount = find(step.id) ?? step }
            )
            .presentationDetents([.medium, .large])
            .sheet(item: $changingAmount) { step in
                StepEditorView(step: step) { updated in
                    apply(Edit.updateStep(runsheet, id: step.id) { $0 = updated })
                } onRemove: {
                    apply(Edit.removeStep(runsheet, stepId: step.id))
                }
            }
        }
        .sheet(isPresented: $naming) {
            NameSheet(title: runsheet.title, creator: runsheet.creator ?? "") { title, creator in
                var next = runsheet
                next.title = title
                next.creator = creator
                apply(next)
            }
        }
        .confirmationDialog("Delete this workout?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) {
                pendingSave?.cancel()
                let sheet = runsheet
                Task { await store.deleteWorkout(sheet) }
                dismiss()
            }
            Button("Keep", role: .cancel) {}
        } message: {
            Text("Sessions you already logged against it stay in History.")
        }
        .onDisappear { flushSave() }
    }

    // MARK: - Editing in place

    /// Every change goes through here, and saves itself a moment after the last one. A catalogue
    /// workout is never written over: its first edit silently makes it yours, as a copy, and this
    /// screen carries on with the copy.
    private func apply(_ next: Runsheet) {
        guard !editable else {
            runsheet = next
            if let id = editing?.id { editing = find(id) }
            scheduleSave()
            return
        }
        let copy = Edit.duplicate(next, creator: store.user?.email)
        // The copy has fresh ids; an open sheet follows its step across.
        let renamed = Dictionary(zip(Edit.ids(next), Edit.ids(copy)), uniquingKeysWith: { a, _ in a })
        let wasSaved = saved
        runsheet = copy
        if let id = editing?.id { editing = renamed[id].flatMap(find) }
        Task {
            await store.saveWorkout(copy)
            if wasSaved { await store.toggleSaved(copy.key) }
        }
    }

    /// A copy of your own to vary, next to the original. The screen carries on with the copy.
    private func duplicate() {
        flushSave()
        var copy = Edit.duplicate(runsheet, creator: store.user?.email)
        if store.isMine(runsheet) { copy.title = "\(runsheet.title) (copy)" }
        runsheet = copy
        Task { await store.saveWorkout(copy) }
    }

    private func scheduleSave() {
        pendingSave?.cancel()
        // A new workout waits until it is worth keeping: a name and an exercise.
        guard Edit.problem(with: runsheet) == nil else { return }
        let sheet = runsheet
        pendingSave = Task {
            try? await Task.sleep(for: .milliseconds(700))
            guard !Task.isCancelled else { return }
            await store.saveWorkout(sheet)
        }
    }

    private func flushSave() {
        guard let task = pendingSave, !task.isCancelled, Edit.problem(with: runsheet) == nil else { return }
        task.cancel()
        let sheet = runsheet
        Task { await store.saveWorkout(sheet) }
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
                onStart(runsheet)
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
