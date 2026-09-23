import SwiftUI

struct WorkoutDetailView: View {
    @Environment(Store.self) private var store
    @State var runsheet: Runsheet
    var onStart: (Runsheet) -> Void

    @State private var editing: ExerciseStep?
    @State private var writing: Runsheet?
    @State private var seeded = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header
                ForEach(Array(runsheet.items.enumerated()), id: \.offset) { _, item in
                    switch item {
                    case .block(let b): blockCard(b)
                    case .step(let s): looseCard(s)
                    case .ref: EmptyView()
                    }
                }
            }
            .padding(16)
            .padding(.bottom, 96)
        }
        .background(Brand.canvas)
        .navigationTitle(runsheet.title)
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            // Seed once, before the numbers are seen: the screen shows what the session will start
            // with, and Start runs exactly what the screen shows. Seeding at Start instead put last
            // time's numbers back over what had just been set here.
            guard !seeded else { return }
            seeded = true
            runsheet = Settings.withLastUsed(runsheet, results: store.results)
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    if store.isMine(runsheet) {
                        Button {
                            writing = runsheet
                        } label: {
                            Label("Edit workout", systemImage: "square.and.pencil")
                        }
                    } else {
                        // A catalogue workout is never written over: you get a copy of your own.
                        Button {
                            writing = Edit.duplicate(runsheet, creator: store.user?.email)
                        } label: {
                            Label("Make a copy I can edit", systemImage: "doc.on.doc")
                        }
                    }
                    Button {
                        Task { await store.toggleSaved(runsheet.key) }
                    } label: {
                        Label(store.saved.contains(runsheet.key) ? "Remove from saved" : "Save to my list",
                              systemImage: store.saved.contains(runsheet.key) ? "bookmark.slash" : "bookmark")
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
        }
        .sheet(item: $writing) { sheet in
            WorkoutEditorView(runsheet: sheet, isExisting: store.isMine(sheet)) { saved in
                // What was just saved is what this screen shows next — the copy included, so Start
                // runs the copy you just edited rather than the catalogue original it came from.
                runsheet = saved
            }
        }
        .safeAreaInset(edge: .bottom) {
            Button("Start workout") {
                onStart(runsheet)
            }
            .buttonStyle(BigButtonStyle())
            .padding(16)
            .background(.bar)
        }
        .sheet(item: $editing) { step in
            // Steppers are here because this screen passes handlers — there is no separate edit
            // mode to find, on any screen that shows an exercise.
            ExerciseSheet(
                step: step,
                target: bind(step.id, \.target),
                incline: bind(step.id, \.incline)
            )
            .presentationDetents([.medium, .large])
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            Stripes().frame(width: 26, height: 22)
            HStack(spacing: 10) {
                Label("\(runsheet.minutes) min", systemImage: "clock")
                if let creator = runsheet.creator { Text(creator) }
                if store.doneCount(runsheet.key) > 0 { Text("done \(store.doneCount(runsheet.key))×") }
            }
            .font(.subheadline)
            .foregroundStyle(Brand.muted)
            if let description = runsheet.description {
                Text(description).font(.callout).foregroundStyle(Brand.body)
            }
        }
    }

    private func blockCard(_ b: Block) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text(b.name).font(.headline)
                Spacer()
                Text(b.modeLabel)
                    .font(.caption.weight(.semibold))
                    .padding(.horizontal, 8).padding(.vertical, 3)
                    .background(Brand.coralSoft, in: Capsule())
                    .foregroundStyle(Brand.coralInk)
            }
            .padding(14)

            ForEach(b.steps) { step in
                Divider().padding(.leading, 14)
                stepRow(step)
            }
        }
        .cardSurface()
    }

    private func looseCard(_ s: Step) -> some View {
        VStack(spacing: 0) { stepRow(s) }.cardSurface()
    }

    @ViewBuilder
    private func stepRow(_ step: Step) -> some View {
        switch step {
        case .rest(let r):
            HStack {
                Label("Rest", systemImage: "pause.circle").foregroundStyle(Brand.rest)
                Spacer()
                Text(Format.clock(r.seconds)).foregroundStyle(Brand.muted)
            }
            .font(.subheadline)
            .padding(14)
        case .exercise(let e):
            Button { editing = e } label: {
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(e.exercise.name).font(.body.weight(.medium)).foregroundStyle(Brand.ink)
                        HStack(spacing: 6) {
                            Text(e.forLabel)
                            if !e.loadLabel.isEmpty { Text("· \(e.loadLabel)") }
                            if let incline = e.incline { Text("· \(Format.number(incline))% incline") }
                        }
                        .font(.footnote)
                        .foregroundStyle(Brand.muted)
                    }
                    Spacer()
                    Image(systemName: "slider.horizontal.3").foregroundStyle(Brand.muted)
                }
                .frame(minHeight: Tap.regular)
                .padding(.horizontal, 14)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
    }

    /// Edits land on this screen's own copy and go into the session that starts from it.
    private func bind(_ stepId: String, _ path: WritableKeyPath<ExerciseStep, Double?>) -> Binding<Double?> {
        Binding(
            get: { find(stepId)?[keyPath: path] },
            set: { value in mutate(stepId) { $0[keyPath: path] = value } }
        )
    }

    private func find(_ stepId: String) -> ExerciseStep? {
        runsheet.exerciseSteps.first { $0.id == stepId }
    }

    private func mutate(_ stepId: String, _ change: (inout ExerciseStep) -> Void) {
        runsheet = Edit.updateStep(runsheet, id: stepId, change)
        if let updated = find(stepId), editing?.id == stepId { editing = updated }
    }
}
