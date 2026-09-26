import SwiftUI

/// The one way to edit a workout (specs/unified-editing.md). The workout screen uses it before a
/// session and the timer's Session sheet during one. One flat list: hold and drag a step within a
/// block, into another block or out on its own; hold and drag a block's header to move the whole
/// block. Tap a header for its rounds and rest, a step for its sheet; swipe a step to remove it.
struct RunsheetEditor<Header: View>: View {
    var runsheet: Runsheet
    /// Items done or running in a live session: shown, never moved or changed.
    var locked: Set<String> = []
    /// The step running now, marked on its row.
    var current: String?
    /// The grey line under an exercise's name.
    var summary: (ExerciseStep) -> String
    var onExercise: (ExerciseStep) -> Void
    var apply: (Runsheet) -> Void
    @ViewBuilder var header: () -> Header

    @State private var editingRest: RestStep?
    @State private var editingBlock: Block?
    @State private var picking: PickTarget?

    private struct PickTarget: Identifiable {
        var id: String { blockId ?? "loose" }
        var blockId: String?
    }

    private var lockedSteps: Set<String> {
        Set(runsheet.items.filter { locked.contains($0.id) }.flatMap { item -> [String] in
            switch item {
            case .block(let b): b.steps.map(\.id)
            case .step(let s): [s.id]
            case .ref: []
            }
        })
    }

    var body: some View {
        let rows = Edit.rows(runsheet)
        let frozen = lockedSteps
        List {
            header()

            Section {
                ForEach(rows) { row in
                    rowView(row, frozen: frozen)
                        .moveDisabled(isFrozen(row, frozen))
                        .deleteDisabled(!isStep(row) || isFrozen(row, frozen))
                }
                .onMove { from, to in
                    guard let from = from.first else { return }
                    apply(Edit.moveRow(runsheet, from: from, to: to, locked: locked))
                }
                .onDelete { offsets in
                    let ids = offsets.compactMap { i -> String? in
                        if case .step(let id, _) = rows[i], !frozen.contains(id) { return id }
                        return nil
                    }
                    apply(ids.reduce(runsheet) { Edit.removeStep($0, stepId: $1) })
                }
            }

            Section {
                Button { apply(Edit.addBlock(runsheet)) } label: {
                    Label("Add block", systemImage: "square.stack.3d.up")
                }
                Button { picking = PickTarget(blockId: nil) } label: {
                    Label("Add a one-off exercise", systemImage: "figure.run")
                }
            }
            .foregroundStyle(Brand.coralInk)
            .listRowBackground(Brand.surface)
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Brand.canvas)
        .sheet(item: $editingRest) { rest in
            RestEditorView(seconds: rest.seconds) { seconds in
                apply(Edit.updateRest(runsheet, id: rest.id, seconds: seconds))
            } onRemove: {
                apply(Edit.removeStep(runsheet, stepId: rest.id))
            }
        }
        .sheet(item: $editingBlock) { block in
            BlockSheet(block: block) { changed in
                apply(Edit.updateBlock(runsheet, id: block.id) { $0 = changed })
            } onRemove: {
                apply(Edit.remove(runsheet, itemId: block.id))
            }
        }
        .sheet(item: $picking) { target in
            ExercisePickerView { exercise in
                apply(Edit.addExercise(runsheet, to: target.blockId, exercise: exercise))
            }
        }
    }

    private func isStep(_ row: Edit.Row) -> Bool {
        if case .step = row { return true }
        return false
    }

    private func isFrozen(_ row: Edit.Row, _ frozen: Set<String>) -> Bool {
        switch row {
        case .block(let b): locked.contains(b)
        case .step(let s, _): frozen.contains(s)
        case .add: true
        }
    }

    // MARK: - Rows

    @ViewBuilder
    private func rowView(_ row: Edit.Row, frozen: Set<String>) -> some View {
        switch row {
        case .block(let id):
            if let b = runsheet.items.compactMap(\.asBlock).first(where: { $0.id == id }) {
                blockHeader(b, done: locked.contains(id))
            }
        case .step(let id, _):
            if let step = Edit.findStep(runsheet, id) {
                stepRow(step, done: frozen.contains(id))
                    .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 0, trailing: 0))
                    .listRowBackground(Brand.surface)
            }
        case .add(let blockId):
            if !locked.contains(blockId) {
                HStack(spacing: 20) {
                    Button { picking = PickTarget(blockId: blockId) } label: {
                        Label("Add exercise", systemImage: "plus")
                    }
                    Button { apply(Edit.addRest(runsheet, to: blockId)) } label: {
                        Label("Add rest", systemImage: "pause")
                    }
                    Spacer()
                }
                .buttonStyle(.borderless)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Brand.coralInk)
                .listRowBackground(Brand.surface)
            }
        }
    }

    /// The header is a row of its own, so it can be dragged: the whole block follows it.
    private func blockHeader(_ b: Block, done: Bool) -> some View {
        Button { if !done { editingBlock = b } } label: {
            HStack(alignment: .firstTextBaseline) {
                Text(b.name.isEmpty ? "Block" : b.name).font(.headline).foregroundStyle(done ? Brand.muted : Brand.ink)
                Text(Format.duration(b.estimatedSeconds)).font(.footnote).foregroundStyle(Brand.muted)
                Spacer()
                Text(b.modeLabel)
                    .font(.footnote.weight(.bold))
                    .padding(.horizontal, 10).frame(height: 24)
                    .background(Brand.coralSoft, in: Capsule())
                    .foregroundStyle(Brand.coralInk)
            }
            .padding(.top, 14)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(b.name), \(b.modeLabel)")
        .accessibilityHint(done ? "" : "Tap for rounds and rest. Hold and drag to move the block.")
        .listRowBackground(Color.clear)
        .listRowSeparator(.hidden)
        .listRowInsets(EdgeInsets(top: 0, leading: 4, bottom: 6, trailing: 4))
    }

    @ViewBuilder
    private func stepRow(_ step: Step, done: Bool) -> some View {
        switch step {
        case .rest(let r):
            Button { if !done { editingRest = r } } label: {
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
            .opacity(done ? 0.5 : 1)
        case .exercise(let e):
            Button { onExercise(e) } label: {
                HStack(spacing: 14) {
                    ExerciseThumb(ref: e.exercise, size: 48)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(e.exercise.name).font(.body.weight(.medium)).foregroundStyle(Brand.ink)
                        if !summary(e).isEmpty {
                            Text(summary(e)).font(.footnote).foregroundStyle(Brand.muted)
                        }
                    }
                    Spacer(minLength: 8)
                    if e.id == current {
                        Text("now").font(.caption.weight(.bold)).foregroundStyle(Brand.coral)
                    }
                    Text(e.forLabel).font(.body.weight(.semibold)).monospacedDigit().foregroundStyle(Brand.ink)
                    Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(Brand.faint)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .opacity(done && e.id != current ? 0.5 : 1)
        }
    }
}

/// A block's settings: what the form used to show inline, now behind a tap on the block's header.
struct BlockSheet: View {
    @State var block: Block
    var onChange: (Block) -> Void
    var onRemove: () -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Block name", text: $block.name).font(.headline)
                    Picker("Runs as", selection: Binding(get: { block.mode ?? .rounds }, set: { block.mode = $0 })) {
                        Text("Rounds").tag(BlockMode.rounds)
                        Text("For time").tag(BlockMode.fortime)
                        Text("AMRAP").tag(BlockMode.amrap)
                        Text("EMOM").tag(BlockMode.emom)
                    }
                    if block.runMode == .amrap {
                        Stepper(value: seconds(\.timeCapSec, 600), in: 60...3_600, step: 60) {
                            LabeledContent("Cap", value: Format.clock(block.timeCapSec ?? 600))
                        }
                    } else if block.runMode == .emom {
                        Stepper(value: seconds(\.everySec, 60), in: 20...300, step: 10) {
                            LabeledContent("Every", value: Format.clock(block.everySec ?? 60))
                        }
                        Stepper(value: $block.repeatCount, in: 1...60) {
                            LabeledContent("Minutes", value: "\(block.repeatCount)")
                        }
                    } else {
                        Stepper(value: $block.repeatCount, in: 1...60) {
                            LabeledContent("Rounds", value: "\(block.repeatCount)")
                        }
                    }
                    Stepper(value: seconds(\.restBetweenSec, 0), in: 0...600, step: 15) {
                        LabeledContent("Rest between rounds", value: (block.restBetweenSec ?? 0) == 0 ? "none" : Format.clock(block.restBetweenSec ?? 0))
                    }
                }
                Section {
                    Button("Remove block", role: .destructive) {
                        onRemove()
                        dismiss()
                    }
                }
            }
            .navigationTitle("Block")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
            .onChange(of: block) { _, changed in onChange(changed) }
        }
        .presentationDetents([.medium, .large])
    }

    /// 0 means "not set" for the optional block timings, as the form had it.
    private func seconds(_ path: WritableKeyPath<Block, Double?>, _ fallback: Double) -> Binding<Double> {
        Binding(
            get: { block[keyPath: path] ?? fallback },
            set: { block[keyPath: path] = $0 == 0 ? nil : $0 }
        )
    }
}

/// The workout's own name and who wrote it.
struct NameSheet: View {
    @State var title: String
    @State var creator: String
    var onDone: (String, String?) -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                TextField("Name", text: $title).font(.headline)
                TextField("Who wrote it", text: $creator)
            }
            .navigationTitle("Workout")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        onDone(title.trimmingCharacters(in: .whitespaces), creator.isEmpty ? nil : creator)
                        dismiss()
                    }
                }
            }
        }
        .presentationDetents([.medium])
    }
}
