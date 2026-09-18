import SwiftUI

/// A workout before you start it: what it is, where it came from, and every step with its photo.
/// Any exercise opens with its steppers — there is no edit mode to find.
struct WorkoutDetailView: View {
    @Environment(Store.self) private var store
    @State var runsheet: Runsheet
    var onStart: (Runsheet) -> Void

    @State private var editing: ExerciseStep?
    @State private var writing: Runsheet?

    private var saved: Bool { store.saved.contains(runsheet.key) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header
                if let description = runsheet.description, !description.isEmpty {
                    Text(description)
                        .font(.callout)
                        .foregroundStyle(Brand.body)
                        .lineSpacing(3)
                        .padding(.horizontal, 4)
                }
                ForEach(Array(runsheet.items.enumerated()), id: \.offset) { _, item in
                    switch item {
                    case .block(let b): blockCard(b)
                    case .step(let s): looseCard(s)
                    case .ref: EmptyView()
                    }
                }
            }
            .padding(16)
            .padding(.bottom, 24)
        }
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

    private func blockCard(_ b: Block) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(b.name).font(.headline).foregroundStyle(Brand.ink)
                    Text(Format.duration(b.estimatedSeconds)).font(.footnote).foregroundStyle(Brand.muted)
                }
                Spacer()
                Text(b.modeLabel)
                    .font(.subheadline.weight(.bold))
                    .padding(.horizontal, 10).frame(height: 28)
                    .background(Brand.coralSoft, in: Capsule())
                    .foregroundStyle(Brand.coralInk)
            }
            .padding(14)

            ForEach(b.steps) { step in
                Divider().padding(.leading, 76)
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
        runsheet.items = runsheet.items.map { item in
            switch item {
            case .block(var b):
                b.steps = b.steps.map { step in
                    guard case .exercise(var e) = step, e.id == stepId else { return step }
                    change(&e)
                    return .exercise(e)
                }
                return .block(b)
            case .step(.exercise(var e)) where e.id == stepId:
                change(&e)
                return .step(.exercise(e))
            default:
                return item
            }
        }
        if let updated = find(stepId), editing?.id == stepId { editing = updated }
    }
}
