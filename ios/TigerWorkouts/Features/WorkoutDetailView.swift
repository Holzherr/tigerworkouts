import SwiftUI

/// A workout before you start it, and the one place it is edited (specs/unified-editing.md). It
/// reads plain — block headers, exercise and rest rows — until Edit at the top right shows the set
/// steppers, add rows, grips, drags and swipes; Done saves and goes back to reading (Nick, 18 Oct
/// 2026). A workout still being written opens in edit mode.
struct WorkoutDetailView: View {
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State var runsheet: Runsheet
    /// A workout being written from ＋: it saves itself once it has a name and an exercise.
    var isNew = false
    /// The list this screen was reached from, handed to the session it starts.
    var startedFrom: SessionOrigin? = nil
    var onStart: (Runsheet, SessionOrigin?) -> Void

    @State private var editing: ExerciseStep?
    @State private var changingAmount: ExerciseStep?
    @State private var naming = false
    @State private var confirmDelete = false
    @State private var seeded = false
    /// Edit mode: the editing controls show.
    @State private var isEditing = false
    @State private var pendingSave: Task<Void, Never>?
    @AppStorage(Intent.storageKey) private var intent = Intent.maintain.rawValue
    @State private var dismissedStalls = StallDismissals.all()
    /// The last removal, for five seconds: Undo puts the workout back as it was.
    @State private var undo: (label: String, before: Runsheet)?
    /// Asked once per visit, at the first change on a workout that has been done: this session
    /// only, or the workout itself (Versions.swift).
    @State private var scope: EditScope?
    /// What waits for that answer: going into edit mode, or a change already made.
    @State private var asking: Asking?
    /// The page before its "Just this time" change: Undo goes back to it.
    @State private var onceFrom: Runsheet?

    private enum EditScope { case once, base }
    private enum Asking { case edit, change(Runsheet) }

    private var saved: Bool { store.saved.contains(runsheet.key) }
    private var editable: Bool { isNew || store.isMine(runsheet) }
    /// Something to run: a new workout has no Start, length or icon until it has an exercise.
    private var runnable: Bool { !store.prepared(runsheet).exerciseSteps.isEmpty }
    private var mustAsk: Bool { !isNew && scope == nil && store.doneCount(runsheet.key) > 0 }
    /// The versions your sessions ran of the workout as stored.
    private var versions: [Versions.Row] {
        store.workout(id: runsheet.key).map { Versions.rows(store.results, base: $0) } ?? []
    }

    /// Other workouts embedded in this one (a shared warm-up), with what each holds. Resolved into
    /// the session at Start; listed here so they are not a surprise.
    private var refs: [(ref: RefItem, sheet: Runsheet?)] {
        runsheet.items.compactMap { item in
            guard case .ref(let r) = item else { return nil }
            return (r, store.workout(id: r.runsheetId))
        }
    }

    /// Steps whose load is a % of a training max or × bodyweight.
    private var relative: [ExerciseStep] {
        store.prepared(runsheet).exerciseSteps.filter { $0.targetPct != nil || $0.loadFactor != nil }
    }

    var body: some View {
        RunsheetEditor(
            runsheet: runsheet,
            editing: isEditing,
            setHint: { step, round in
                let sets = LastTime.sets(store.results, for: step, in: runsheet) ?? []
                return sets.indices.contains(round) ? LastTime.setLabel(sets[round]) : nil
            },
            summary: settingSummary,
            onExercise: { editing = $0 },
            apply: apply,
            onRemoved: { label, before in undo = (label, before) }
        ) {
            Section {
                if runnable {
                    header
                    progress
                    refRows
                    trainingMaxLink
                } else if !runsheet.title.isEmpty {
                    Text(runsheet.title)
                        .font(.system(size: 26, weight: .heavy))
                        .foregroundStyle(Brand.ink)
                }
                if let description = runsheet.description, !description.isEmpty {
                    Text(description)
                        .font(.callout)
                        .foregroundStyle(Brand.body)
                        .lineSpacing(3)
                }
                if onceFrom != nil { onceBanner }
                if !isEditing, !versions.isEmpty { versionsCard }
                if let assignment = store.assignment(forWorkout: runsheet.key) {
                    CoachNotesCard(assignment: assignment)
                }
                if !runnable {
                    Text("Add an exercise to get going. Start shows up once there is something to run.")
                        .font(.footnote)
                        .foregroundStyle(Brand.muted)
                }
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
            // One copy per original: once you have a copy, the original's page is your copy's.
            if !editable, let copy = Edit.copy(of: runsheet, in: store.myWorkouts) { runsheet = copy }
            runsheet = store.seeded(runsheet)
            if isNew || !runnable { isEditing = true }
            if isNew && runsheet.title.isEmpty { naming = true }
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button(isEditing ? "Done" : "Edit") {
                    if !isEditing, mustAsk { return asking = .edit }
                    if isEditing { flushSave() }
                    withAnimation { isEditing.toggle() }
                }
                .fontWeight(isEditing ? .bold : .regular)
                .accessibilityIdentifier("edit-toggle")
            }
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
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
                        Button { setPublic(!isPublic) } label: {
                            isPublic
                                ? Label("Make private", systemImage: "lock")
                                : Label("Make public on my page", systemImage: "globe")
                        }
                        Button(role: .destructive) { confirmDelete = true } label: {
                            Label("Delete workout", systemImage: "trash")
                        }
                    }
                } label: {
                    Image(systemName: "ellipsis")
                }
                .accessibilityLabel("More")
            }
        }
        .safeAreaInset(edge: .bottom) {
            VStack(spacing: 8) {
                if let u = undo {
                    UndoToast(label: u.label) {
                        // The steps come back; the identity stays, since a catalogue workout's
                        // first edit made it a copy of your own.
                        var restored = runsheet
                        restored.items = u.before.items
                        apply(restored)
                        undo = nil
                    } onExpire: { undo = nil }
                }
                if runnable { bottomBar }
            }
            .animation(.easeOut(duration: 0.2), value: undo?.label)
        }
        .sheet(item: $editing) { step in
            ExerciseSheet(
                step: step,
                target: bind(step.id, \.target),
                incline: bind(step.id, \.incline),
                onDrop: { remove(step) },
                dropLabel: "Remove from this workout",
                onAmount: { changingAmount = find(step.id) ?? step }
            )
            .presentationDetents([.medium, .large])
            .confirmationDialog("Change it for…", isPresented: Binding(get: { asking != nil && editing != nil && changingAmount == nil }, set: { if !$0 { asking = nil } }), titleVisibility: .visible) {
                scopeButtons
            }
            .sheet(item: $changingAmount) { step in
                StepEditorView(step: step) { updated in
                    apply(Edit.updateStep(runsheet, id: step.id) { $0 = updated })
                } onRemove: {
                    remove(step)
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
        .confirmationDialog("Change it for…", isPresented: Binding(get: { asking != nil && editing == nil }, set: { if !$0 { asking = nil } }), titleVisibility: .visible) {
            scopeButtons
        } message: {
            Text("Just this time: the next session runs it changed and keeps it as your version. Update workout: changes it for every session from now on.")
        }
        .onDisappear { flushSave() }
    }

    @ViewBuilder
    private var scopeButtons: some View {
        Button("Just this time") { answer(.once) }
            .accessibilityIdentifier("scope-once")
        Button("Update workout") { answer(.base) }
            .accessibilityIdentifier("scope-base")
        Button("Cancel", role: .cancel) { asking = nil }
    }

    private func answer(_ to: EditScope) {
        let held = asking
        asking = nil
        scope = to
        switch held {
        case .edit: withAnimation { isEditing = true }
        case .change(let next): apply(next)
        case nil: break
        }
    }

    // MARK: - Versions

    /// While the page holds a "Just this time" change: what it means and the two ways out.
    private var onceBanner: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Just this time").font(.subheadline.weight(.bold)).foregroundStyle(Brand.ink)
            Text("Start runs it as changed; it is kept with that session as your version, not on the workout.")
                .font(.caption)
                .foregroundStyle(Brand.body)
            HStack(spacing: 16) {
                Button("Update workout instead") {
                    scope = .base
                    onceFrom = nil
                    commit(runsheet)
                }
                .accessibilityIdentifier("once-keep")
                Button("Undo changes") {
                    if let before = onceFrom { runsheet = before }
                    onceFrom = nil
                    scope = nil
                }
                .foregroundStyle(Brand.muted)
                .accessibilityIdentifier("once-undo")
            }
            .font(.subheadline.weight(.semibold))
            .buttonStyle(.borderless)
            .padding(.top, 2)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Brand.coralSoft, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("once-banner")
    }

    /// One row per version a session ran — what is different, how often and when last — with Run
    /// and Make base. Private: only the person who ran them sees it.
    private var versionsCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "arrow.triangle.branch").foregroundStyle(Brand.coralInk)
                Text("Your versions").font(.subheadline.weight(.bold)).foregroundStyle(Brand.ink)
                Spacer()
                Text("only you see these").font(.caption).foregroundStyle(Brand.muted)
            }
            ForEach(versions) { v in
                HStack(spacing: 10) {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(v.changes).font(.subheadline.weight(.semibold)).foregroundStyle(Brand.ink).lineLimit(1)
                        Text("\(v.sessions)× · last \(ISO8601.date(v.lastDone)?.formatted(date: .abbreviated, time: .omitted) ?? "")")
                            .font(.caption)
                            .foregroundStyle(Brand.muted)
                    }
                    Spacer(minLength: 4)
                    Button("Make base") { makeBase(v) }
                        .font(.subheadline)
                        .accessibilityIdentifier("version-make-base")
                    Button { runVersion(v) } label: { Label("Run", systemImage: "play.fill") }
                        .font(.subheadline.weight(.semibold))
                        .accessibilityLabel("Run this version: \(v.changes)")
                        .accessibilityIdentifier("version-run")
                }
                .buttonStyle(.borderless)
            }
        }
        .padding(12)
        .background(Brand.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Brand.line))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("versions-card")
    }

    /// The workout with the version's items, seeded as the page seeds: its session keeps it as its version.
    private func runVersion(_ v: Versions.Row) {
        guard var sheet = store.workout(id: runsheet.key) else { return }
        sheet.items = v.items
        onStart(store.seeded(sheet), startedFrom)
    }

    /// The version becomes the workout, items as the session kept them (not seeded), so it no
    /// longer shows as a version.
    private func makeBase(_ v: Versions.Row) {
        var next = store.workout(id: runsheet.key) ?? runsheet
        next.items = v.items
        scope = .base
        onceFrom = nil
        guard editable else { return commit(store.seeded(next)) }
        pendingSave?.cancel()
        store.stage(next)
        Task { await store.pushWorkouts() }
        runsheet = store.seeded(next)
    }

    // MARK: - Editing in place

    private func remove(_ step: ExerciseStep) {
        let before = runsheet
        apply(Edit.removeStep(runsheet, stepId: step.id))
        undo = ("Removed \(step.exercise.name)", before)
    }

    /// Every change goes through here. On a workout that has been done, the first one asks whether
    /// it is for this session only; a "Just this time" change stays on the page, unsaved, until
    /// Start runs it.
    private func apply(_ next: Runsheet) {
        if mustAsk { return asking = .change(next) }
        guard scope != .once else {
            if onceFrom == nil { onceFrom = runsheet }
            runsheet = next
            if let id = editing?.id { editing = find(id) }
            return
        }
        commit(next)
    }

    /// Saves itself a moment after the last change. A catalogue workout is never written over: its
    /// first edit silently makes it yours, as a copy, and this screen carries on with the copy.
    private func commit(_ next: Runsheet) {
        guard !editable else {
            runsheet = next
            if let id = editing?.id { editing = find(id) }
            scheduleSave()
            return
        }
        let copy = Edit.duplicate(next, creator: store.user?.email)
        // The copy keeps its step ids; an open sheet follows its step across either way.
        let renamed = Dictionary(zip(Edit.ids(next), Edit.ids(copy)), uniquingKeysWith: { a, _ in a })
        let wasSaved = saved
        runsheet = copy
        if let id = editing?.id { editing = renamed[id].flatMap(find) }
        store.stage(copy)
        Task {
            await store.pushWorkouts()
            if wasSaved { await store.toggleSaved(copy.key) }
        }
    }

    /// A copy of your own to vary, next to the original. The screen carries on with the copy.
    private func duplicate() {
        flushSave()
        var copy = Edit.duplicate(runsheet, creator: store.user?.email)
        if store.isMine(runsheet) { copy.title = "\(runsheet.title) (copy)" }
        // A workout of its own beside the original, not the original edited: its own history.
        copy.copyOf = nil
        copy.program = nil
        runsheet = copy
        scope = nil
        onceFrom = nil
        Task { await store.saveWorkout(copy) }
    }

    /// Who can see it, as the store last heard from the server: this screen's copy can be older.
    private var isPublic: Bool { (store.workout(id: runsheet.key) ?? runsheet).isPublic ?? false }

    /// The one edit that sends `public`; saved at once with whatever else is waiting.
    private func setPublic(_ on: Bool) {
        pendingSave?.cancel()
        // A "Just this time" change is not the workout's: the workout as it was goes up.
        var next = onceFrom ?? runsheet
        next.isPublic = on
        if onceFrom != nil { onceFrom = next } else { runsheet = next }
        Task { await store.saveWorkout(next, visibility: true) }
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

    /// Start never runs a workout of yours that is not stored: a session of one that is not would
    /// have no workout behind it in History, and a crash could not bring it back. A new one saved a
    /// moment ago, or still without a name, is saved now.
    private func keepBeforeStart() {
        guard editable else { return }
        guard store.workout(id: runsheet.key) == nil else { return flushSave() }
        pendingSave?.cancel()
        runsheet = Edit.namedForStart(runsheet)
        store.stage(runsheet)
        Task { await store.pushWorkouts() }
    }

    /// In the store before it returns, so a session started next reads the edit as the workout,
    /// not as a version of it; the upload follows.
    private func flushSave() {
        guard let task = pendingSave, !task.isCancelled, Edit.problem(with: runsheet) == nil else { return }
        task.cancel()
        store.stage(runsheet)
        Task { await store.pushWorkouts() }
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

    /// One row per embedded workout: its role, its title and how many exercises it adds.
    @ViewBuilder
    private var refRows: some View {
        ForEach(refs, id: \.ref.id) { item in
            HStack(spacing: 10) {
                Image(systemName: "link").foregroundStyle(Brand.coralInk)
                VStack(alignment: .leading, spacing: 1) {
                    Text("\((item.ref.role ?? .main).label): \(item.sheet?.title ?? "a workout not on this phone")")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Brand.ink)
                    Text(item.sheet.map { "\($0.exerciseSteps.count) exercises · runs where it sits in the list" } ?? "Skipped at Start")
                        .font(.caption)
                        .foregroundStyle(Brand.muted)
                }
            }
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("ref-row")
        }
    }

    /// Loads given as a % of a training max: a way to set the maxes, and a note when one is missing.
    @ViewBuilder
    private var trainingMaxLink: some View {
        let pct = relative.filter { $0.targetPct != nil }
        let keys = Array(Set(pct.map(\.exercise.key))).sorted()
        if !relative.isEmpty {
            NavigationLink {
                TrainingMaxesView(
                    exercises: keys.map { k in pct.first { $0.exercise.key == k }!.exercise },
                    needsBodyweight: relative.contains { $0.loadFactor != nil }
                )
            } label: {
                let missing = keys.filter { store.trainingMaxes[$0] == nil }.count + (relative.contains { $0.loadFactor != nil } && store.bodyweightKg == nil ? 1 : 0)
                Label(missing > 0 ? "Set \(missing == 1 ? "a training max" : "\(missing) training maxes") to see these loads in kilos" : "Training maxes", systemImage: "percent")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Brand.coralInk)
            }
            .accessibilityIdentifier("training-maxes-link")
        }
    }

    /// Today's target and, when the workout's score has stood still, its stall. Nothing on a first run.
    @ViewBuilder
    private var progress: some View {
        if let today = Targets.today(store.prepared(runsheet), results: store.results, intent: Intent(rawValue: intent) ?? .maintain, kit: store.equipment) {
            TodayLine(today: today)
        }
        if let stall = Stall.workout(runsheet, results: store.results), !dismissedStalls.contains(stall.id) {
            StallCard(stall: stall) {
                StallDismissals.dismiss(stall.id)
                dismissedStalls = StallDismissals.all()
            }
        }
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
                keepBeforeStart()
                onStart(runsheet, startedFrom)
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
        // 65% TM reads as the kilos it comes to, the way the timer will show it.
        if e.targetPct != nil || e.loadFactor != nil,
           let kg = Relative.target(e, maxes: store.trainingMaxes, bodyweightKg: store.bodyweightKg, kit: store.equipment) {
            parts.append("\(Format.number(kg)) \(e.shortUnit)")
        }
        if let incline = e.incline { parts.append("\(Format.number(incline))% incline") }
        if let last = LastTime.label(store.results, for: e, in: runsheet) { parts.append(last) }
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
