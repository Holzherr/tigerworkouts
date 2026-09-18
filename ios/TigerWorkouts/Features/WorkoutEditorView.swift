import SwiftUI

/// Writing a workout. Blocks hold steps, steps are reordered inside their block, and nothing is
/// sent anywhere until Save — the screen holds one runsheet value and every edit returns a new one.
struct WorkoutEditorView: View {
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State var runsheet: Runsheet
    /// True when this workout is already the account's, false when it is a copy being made.
    var isExisting: Bool
    var onSaved: (Runsheet) -> Void

    @State private var picking: PickTarget?
    @State private var editingStep: ExerciseStep?
    @State private var editingRest: RestStep?
    @State private var confirmDelete = false
    @State private var saving = false

    private struct PickTarget: Identifiable {
        var id: String { blockId ?? "loose" }
        var blockId: String?
    }

    private var problem: String? { Edit.problem(with: runsheet) }

    var body: some View {
        NavigationStack {
            List {
                Section("Workout") {
                    TextField("Name", text: $runsheet.title)
                        .font(.headline)
                    TextField("Who wrote it", text: Binding(get: { runsheet.creator ?? "" }, set: { runsheet.creator = $0.isEmpty ? nil : $0 }))
                    LabeledContent("Length", value: "about \(runsheet.minutes) min")
                }

                ForEach(Array(runsheet.items.enumerated()), id: \.element.id) { index, item in
                    switch item {
                    case .block(let block): blockSection(block, at: index)
                    case .step(let step): looseSection(step, at: index)
                    case .ref: EmptyView()
                    }
                }

                Section {
                    Button { runsheet = Edit.addBlock(runsheet) } label: {
                        Label("Add block", systemImage: "square.stack.3d.up")
                    }
                    Button { picking = PickTarget(blockId: nil) } label: {
                        Label("Add a one-off exercise", systemImage: "figure.run")
                    }
                }

                if isExisting {
                    Section {
                        Button("Delete workout", role: .destructive) { confirmDelete = true }
                    }
                }
            }
            .navigationTitle(isExisting ? "Edit workout" : "New workout")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .primaryAction) { EditButton() }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }.disabled(problem != nil || saving)
                }
            }
            .safeAreaInset(edge: .bottom) {
                if let problem {
                    Text(problem)
                        .font(.footnote)
                        .foregroundStyle(Brand.muted)
                        .frame(maxWidth: .infinity)
                        .padding(10)
                        .background(.bar)
                }
            }
            .sheet(item: $picking) { target in
                ExercisePickerView { exercise in
                    runsheet = Edit.addExercise(runsheet, to: target.blockId, exercise: exercise)
                }
            }
            .sheet(item: $editingStep) { step in
                StepEditorView(step: step) { updated in
                    runsheet = Edit.updateStep(runsheet, id: step.id) { $0 = updated }
                } onRemove: {
                    runsheet = Edit.removeStep(runsheet, stepId: step.id)
                }
            }
            .sheet(item: $editingRest) { rest in
                RestEditorView(seconds: rest.seconds) { seconds in
                    runsheet = Edit.updateRest(runsheet, id: rest.id, seconds: seconds)
                } onRemove: {
                    runsheet = Edit.removeStep(runsheet, stepId: rest.id)
                }
            }
            .confirmationDialog("Delete this workout?", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("Delete", role: .destructive) {
                    Task {
                        await store.deleteWorkout(runsheet)
                        dismiss()
                    }
                }
                Button("Keep", role: .cancel) {}
            } message: {
                Text("Sessions you already logged against it stay in History.")
            }
        }
    }

    // MARK: - Sections

    @ViewBuilder
    private func blockSection(_ block: Block, at index: Int) -> some View {
        Section {
            TextField("Block name", text: binding(block, \.name))
                .font(.headline)

            Picker("Runs as", selection: binding(block, \.mode, default: .rounds)) {
                Text("Rounds").tag(BlockMode.rounds)
                Text("For time").tag(BlockMode.fortime)
                Text("AMRAP").tag(BlockMode.amrap)
                Text("EMOM").tag(BlockMode.emom)
            }

            if block.runMode == .amrap {
                Stepper(value: binding(block, \.timeCapSec, default: 600), in: 60...3_600, step: 60) {
                    LabeledContent("Cap", value: Format.clock(block.timeCapSec ?? 600))
                }
            } else if block.runMode == .emom {
                Stepper(value: binding(block, \.everySec, default: 60), in: 20...300, step: 10) {
                    LabeledContent("Every", value: Format.clock(block.everySec ?? 60))
                }
                Stepper(value: binding(block, \.repeatCount), in: 1...60) {
                    LabeledContent("Minutes", value: "\(block.repeatCount)")
                }
            } else {
                Stepper(value: binding(block, \.repeatCount), in: 1...60) {
                    LabeledContent("Rounds", value: "\(block.repeatCount)")
                }
            }

            Stepper(value: binding(block, \.restBetweenSec, default: 0), in: 0...600, step: 15) {
                LabeledContent("Rest between rounds", value: (block.restBetweenSec ?? 0) == 0 ? "none" : Format.clock(block.restBetweenSec ?? 0))
            }

            ForEach(block.steps) { step in stepRow(step) }
                .onDelete { offsets in
                    for i in offsets where block.steps.indices.contains(i) {
                        runsheet = Edit.removeStep(runsheet, stepId: block.steps[i].id)
                    }
                }
                .onMove { from, to in
                    runsheet = Edit.moveSteps(runsheet, in: block.id, from: from, to: to)
                }

            Button { picking = PickTarget(blockId: block.id) } label: {
                Label("Add exercise", systemImage: "plus.circle")
            }
            Button { runsheet = Edit.addRest(runsheet, to: block.id) } label: {
                Label("Add rest", systemImage: "pause.circle")
            }
        } header: {
            HStack {
                Text(block.name.isEmpty ? "Block" : block.name)
                Spacer()
                Text(block.modeLabel).foregroundStyle(Brand.muted)
            }
        } footer: {
            HStack {
                Text("about \(Int((block.estimatedSeconds / 60).rounded())) min")
                Spacer()
                moveControls(at: index)
            }
        }
    }

    @ViewBuilder
    private func looseSection(_ step: Step, at index: Int) -> some View {
        Section {
            stepRow(step)
        } footer: {
            HStack {
                Text("On its own, outside any block")
                Spacer()
                moveControls(at: index)
            }
        }
    }

    @ViewBuilder
    private func stepRow(_ step: Step) -> some View {
        switch step {
        case .exercise(let e):
            Button { editingStep = e } label: {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(e.exercise.name).foregroundStyle(Brand.ink)
                        Text(summary(e)).font(.footnote).foregroundStyle(Brand.muted)
                    }
                    Spacer()
                    Image(systemName: "chevron.right").font(.caption).foregroundStyle(Brand.muted)
                }
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        case .rest(let r):
            Button { editingRest = r } label: {
                HStack {
                    Label("Rest", systemImage: "pause.circle").foregroundStyle(Brand.rest)
                    Spacer()
                    Text(Format.clock(r.seconds)).foregroundStyle(Brand.muted)
                }
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
    }

    private func summary(_ e: ExerciseStep) -> String {
        var parts = [e.forLabel]
        if !e.loadLabel.isEmpty { parts.append(e.loadLabel) }
        if let incline = e.incline { parts.append("\(Format.number(incline))% incline") }
        return parts.joined(separator: " · ")
    }

    /// Blocks move with buttons rather than drag: a drag inside a form full of text fields and
    /// steppers is a fight, and there are rarely more than four of them.
    @ViewBuilder
    private func moveControls(at index: Int) -> some View {
        HStack(spacing: 16) {
            Button {
                runsheet = Edit.moveItems(runsheet, from: [index], to: index - 1)
            } label: {
                Image(systemName: "arrow.up")
            }
            .disabled(index == 0)

            Button {
                runsheet = Edit.moveItems(runsheet, from: [index], to: index + 2)
            } label: {
                Image(systemName: "arrow.down")
            }
            .disabled(index >= runsheet.items.count - 1)

            Button(role: .destructive) {
                runsheet = Edit.remove(runsheet, itemId: runsheet.items[index].id)
            } label: {
                Image(systemName: "trash")
            }
        }
        .buttonStyle(.borderless)
        .font(.footnote)
    }

    // MARK: - Bindings

    private func binding(_ block: Block, _ path: WritableKeyPath<Block, String>) -> Binding<String> {
        Binding(
            get: { runsheet.items.compactMap(\.asBlock).first { $0.id == block.id }?[keyPath: path] ?? "" },
            set: { value in runsheet = Edit.updateBlock(runsheet, id: block.id) { $0[keyPath: path] = value } }
        )
    }

    private func binding(_ block: Block, _ path: WritableKeyPath<Block, Int>) -> Binding<Int> {
        Binding(
            get: { runsheet.items.compactMap(\.asBlock).first { $0.id == block.id }?[keyPath: path] ?? 1 },
            set: { value in runsheet = Edit.updateBlock(runsheet, id: block.id) { $0[keyPath: path] = value } }
        )
    }

    private func binding(_ block: Block, _ path: WritableKeyPath<Block, Double?>, default fallback: Double) -> Binding<Double> {
        Binding(
            get: { runsheet.items.compactMap(\.asBlock).first { $0.id == block.id }?[keyPath: path] ?? fallback },
            set: { value in runsheet = Edit.updateBlock(runsheet, id: block.id) { $0[keyPath: path] = value == 0 ? nil : value } }
        )
    }

    private func binding(_ block: Block, _ path: WritableKeyPath<Block, BlockMode?>, default fallback: BlockMode) -> Binding<BlockMode> {
        Binding(
            get: { runsheet.items.compactMap(\.asBlock).first { $0.id == block.id }?[keyPath: path] ?? fallback },
            set: { value in runsheet = Edit.updateBlock(runsheet, id: block.id) { $0[keyPath: path] = value } }
        )
    }

    private func save() {
        saving = true
        var sheet = runsheet
        sheet.title = sheet.title.trimmingCharacters(in: .whitespaces)
        Task {
            await store.saveWorkout(sheet)
            saving = false
            onSaved(sheet)
            dismiss()
        }
    }
}
