import SwiftUI

/// A workout before you start it: what it is, where it came from, and every step with its photo.
/// The page is the editor: drag to reorder, swipe to remove, tap to change — no edit mode to find.
///
/// Two kinds of change (specs/workout-settings.md). A number — weight, reps, a rest, a block's
/// rounds — is saved straight away as your settings for this workout and never touches it. Anything
/// else is a new setup: your own workout saves it in place; anyone else's offers to keep it as your
/// own version, private.
struct WorkoutDetailView: View {
    @Environment(Store.self) private var store
    /// What the page shows and Start runs: the workout with your numbers on it.
    @State var runsheet: Runsheet
    var onStart: (Runsheet) -> Void

    /// The workout as stored, before your settings and last time's numbers.
    @State private var base: Runsheet?
    @State private var editing: ExerciseStep?
    @State private var editingRest: RestStep?
    @State private var editingBlock: Block?
    @State private var writing: Runsheet?
    @State private var picking: PickTarget?
    /// A new setup on someone else's workout, not saved yet: it rides along into this session.
    @State private var sessionOnly = false
    @State private var seeded = false
    @State private var pendingSave: Task<Void, Never>?

    private struct PickTarget: Identifiable {
        var id: String { blockId ?? "loose" }
        var blockId: String?
    }

    private var saved: Bool { store.saved.contains(runsheet.key) }
    private var original: Runsheet { base ?? runsheet }
    private var mine: Bool { store.isMine(original) }
    private var hasSettings: Bool { store.settings(for: original)?.hasAny == true }
    private var settingsNote: String {
        sessionOnly ? "Part of the changes above — keep them by saving your version." : "Saved as your settings for this workout. The original stays as written."
    }

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
                if mine { visibilityRow }
                if sessionOnly { sessionOnlyBanner } else if hasSettings { settingsBanner }
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
        .onAppear {
            // Seed once, before the numbers are seen: the screen shows what the session will start
            // with, and Start runs exactly what the screen shows. Seeding at Start instead put last
            // time's numbers back over what had just been set here.
            guard !seeded else { return }
            seeded = true
            base = runsheet
            runsheet = Settings.withLastUsed(runsheet, results: store.results, settings: store.settings(for: runsheet))
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    if mine {
                        Button {
                            writing = runsheet
                        } label: {
                            Label("Name, blocks and rounds", systemImage: "square.and.pencil")
                        }
                    } else {
                        // Someone else's workout is never written over: you get a version of your own.
                        Button {
                            saveVersion()
                        } label: {
                            Label("Make my own version", systemImage: "doc.on.doc")
                        }
                    }
                    if hasSettings {
                        Button {
                            resetToOriginal()
                        } label: {
                            Label("Reset to original", systemImage: "arrow.uturn.backward")
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
                if saved.key == runsheet.key { runsheet = saved; base = saved }
            }
        }
        .safeAreaInset(edge: .bottom) { bottomBar }
        .sheet(item: $editing) { step in
            ExerciseSheet(
                step: step,
                target: bind(step.id, \.target),
                incline: bind(step.id, \.incline),
                amount: bindAmount(step.id),
                note: settingsNote,
                onDrop: { apply(Edit.removeStep(runsheet, stepId: step.id)) },
                dropLabel: "Remove from this workout"
            )
            .presentationDetents([.medium, .large])
        }
        .sheet(item: $editingRest) { rest in
            RestEditorView(seconds: rest.seconds, note: settingsNote) { seconds in
                apply(Edit.updateRest(runsheet, id: rest.id, seconds: seconds))
            } onRemove: {
                apply(Edit.removeStep(runsheet, stepId: rest.id))
            }
        }
        .sheet(item: $editingBlock) { block in
            BlockSettingsView(block: block, note: settingsNote) { next in
                apply(Edit.updateBlock(runsheet, id: block.id) { $0 = next })
            }
            .presentationDetents([.medium])
        }
        .sheet(item: $picking) { target in
            ExercisePickerView { exercise in
                apply(Edit.addExercise(runsheet, to: target.blockId, exercise: exercise))
            }
        }
        .onDisappear { flushSave() }
    }

    // MARK: - Editing in place

    /// Every change goes through here, and is sorted before anything is saved: numbers become your
    /// settings at once; a new setup saves in place on your own workout, and on anyone else's rides
    /// along into the session you start while the banner offers to keep it as your version.
    private func apply(_ next: Runsheet) {
        let before = runsheet
        runsheet = next
        if let id = editing?.id { editing = find(id) }
        switch Settings.classify(before, next) {
        case .none:
            return
        case .settings:
            // Numbers on an unsaved new setup belong to it, not to the original's settings.
            guard !sessionOnly else { return }
            let change = Settings.change(before, next)
            let target = original
            Task { await store.saveSettings(for: target, change) }
        case .structure:
            if mine { scheduleSave() } else { sessionOnly = true }
        }
    }

    /// Your own workout takes a new setup in place, numbers included, so its settings fold into it.
    private func scheduleSave() {
        pendingSave?.cancel()
        let sheet = runsheet
        pendingSave = Task {
            try? await Task.sleep(for: .milliseconds(700))
            guard !Task.isCancelled else { return }
            await saveInPlace(sheet)
        }
    }

    private func flushSave() {
        guard let task = pendingSave, !task.isCancelled, mine else { return }
        task.cancel()
        let sheet = runsheet
        Task { await saveInPlace(sheet) }
    }

    private func saveInPlace(_ sheet: Runsheet) async {
        var next = sheet
        next.isPublic = original.isPublic ?? false
        base = next
        await store.saveWorkout(next)
        await store.resetSettings(for: next)
    }

    /// Someone else's workout, changed: kept as your own version, private until you share it.
    private func saveVersion() {
        let wasSaved = saved
        let version = Settings.newVersion(runsheet, of: original, id: Edit.id("w"), creator: store.user?.email)
        runsheet = version
        base = version
        sessionOnly = false
        Task {
            await store.saveWorkout(version)
            if wasSaved { await store.toggleSaved(version.key) }
        }
    }

    private func resetToOriginal() {
        let target = original
        sessionOnly = false
        runsheet = Settings.withLastUsed(target, results: store.results)
        Task { await store.resetSettings(for: target) }
    }

    private var sessionOnlyBanner: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Changed for this session").font(.subheadline.weight(.semibold)).foregroundStyle(Brand.ink)
                Text("Keep it as your own version — private to you.").font(.footnote).foregroundStyle(Brand.muted)
            }
            Spacer()
            Button("Save my version") { saveVersion() }
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

    private var settingsBanner: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Your settings").font(.subheadline.weight(.semibold)).foregroundStyle(Brand.ink)
                Text("The original stays as written.").font(.footnote).foregroundStyle(Brand.muted)
            }
            Spacer()
            Button("Reset to original") { resetToOriginal() }
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Brand.coralInk)
                .buttonStyle(.plain)
        }
        .padding(12)
        .background(Brand.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Brand.line))
    }

    private var visibilityRow: some View {
        let isPublic = (store.myWorkouts.first { $0.key == original.key }?.isPublic) ?? original.isPublic ?? false
        return HStack(spacing: 10) {
            Image(systemName: isPublic ? "globe" : "lock.fill").foregroundStyle(Brand.muted)
            Text(isPublic ? "Public · shows in Discover" : "Private · only you see it")
                .font(.subheadline)
                .foregroundStyle(Brand.body)
            Spacer()
            Button(isPublic ? "Make private" : "Make public") {
                let target = original
                Task {
                    await store.setPublic(target, !isPublic)
                    if var b = base { b.isPublic = !isPublic; base = b }
                }
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(Brand.coralInk)
            .buttonStyle(.plain)
        }
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
                Button { editingBlock = b } label: {
                    Text(b.modeLabel)
                        .font(.footnote.weight(.bold))
                        .padding(.horizontal, 10).frame(height: 24)
                        .background(Brand.coralSoft, in: Capsule())
                        .foregroundStyle(Brand.coralInk)
                }
                .buttonStyle(.plain)
                .disabled(b.runMode == .ladder)
                .accessibilityLabel("Rounds for \(b.name): \(b.modeLabel)")
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

    private func bindAmount(_ stepId: String) -> Binding<Double?> {
        Binding(
            get: { find(stepId)?.forValue },
            set: { value in
                guard let value else { return }
                apply(Edit.updateStep(runsheet, id: stepId) { $0.forValue = max(1, value) })
            }
        )
    }

    private func find(_ stepId: String) -> ExerciseStep? {
        runsheet.exerciseSteps.first { $0.id == stepId }
    }
}
