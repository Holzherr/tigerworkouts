import SwiftUI

/// Round times per circuit, AMRAP or for-time block: a heading per block, then a wrapping row of
/// small tiles — "R3", the round's time, and against last time under it (faster in coral ink,
/// slower muted). The fastest round has a coral outline and "fastest", the slowest says "slowest";
/// a round that was the workout's fastest ever carries a medal. Nothing for a session with no
/// splits. Follows `splits-card.tsx`.
struct RoundTimesCard: View {
    let result: SessionResult
    var last: SessionResult?
    var blockName: (String) -> String? = { _ in nil }
    var records: [Rounds.PR] = []

    var body: some View {
        let rows = Rounds.rows(result, last: last).filter { $0.times.contains { $0 != nil } }
        if !rows.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Text(last == nil ? "Round times" : "Round times · vs last time")
                    .font(.caption.weight(.bold))
                    .textCase(.uppercase)
                    .tracking(0.6)
                    .foregroundStyle(Brand.muted)
                ForEach(rows, id: \.blockId) { row in
                    VStack(alignment: .leading, spacing: 6) {
                        if rows.count > 1 || blockName(row.blockId) != nil {
                            Text(blockName(row.blockId) ?? "Block").font(.subheadline.weight(.bold)).foregroundStyle(Brand.ink)
                        }
                        FlowRow(spacing: 6) {
                            ForEach(Array(row.times.enumerated()), id: \.offset) { i, t in tile(row, i, t) }
                        }
                    }
                }
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .cardSurface()
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("round-times")
        }
    }

    private func tile(_ row: Rounds.Row, _ i: Int, _ t: Double?) -> some View {
        let fast = row.fastest == i
        let slow = row.slowest == i
        let record = records.contains { $0.blockId == row.blockId && $0.round == i }
        return VStack(spacing: 1) {
            HStack(spacing: 2) {
                Text("R\(i + 1)")
                if record { Image(systemName: "medal.fill").foregroundStyle(Brand.coral) }
            }
            .font(.caption2.weight(.bold))
            .foregroundStyle(Brand.muted)
            Text(t.map(Logbook.duration) ?? "–").font(.subheadline.weight(.heavy)).monospacedDigit().foregroundStyle(Brand.ink)
            if let d = row.vsLast[i] {
                Text(Rounds.delta(d)).font(.caption2.weight(.semibold)).monospacedDigit().foregroundStyle(d < 0 ? Brand.coralInk : Brand.muted)
            }
            if fast || slow {
                Text(fast ? "fastest" : "slowest").font(.system(size: 10, weight: .bold)).foregroundStyle(fast ? Brand.coralInk : Brand.faint)
            }
        }
        .frame(minWidth: 58)
        .padding(.horizontal, 6)
        .padding(.vertical, 5)
        .background(fast ? Brand.coralSoft : Brand.canvas, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(fast ? Brand.coral : Brand.lineSoft))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Round \(i + 1)\(t.map { " \(Logbook.duration($0))" } ?? "")\(fast ? ", fastest" : slow ? ", slowest" : "")")
    }
}

/// Every logged set of a session, by exercise, and the way to put them right afterwards. Read: an
/// exercise per row (tap for its logbook) with its sets as pills — the mark (1, W, D, F), what was
/// done ("60 × 8", "500 m in 1:41", "45 s") and, small, when in the session it was ticked. Edit sets:
/// a line per set, the mark (tap to change the type), a number box per measure the row has and a
/// remove button, then Add set under each exercise.
/// Each change is saved and synced like any other edit to the session. Follows `logged-sets.tsx`.
struct LoggedSetsCard: View {
    let session: SessionResult
    /// The workout the session ran, for the reps each step prescribed: a reps edit below them is a miss.
    var runsheet: Runsheet? = nil
    var onEdit: (SessionResult) -> Void

    @State private var editing = false
    /// The columns each row is edited in, fixed when editing starts so clearing a box keeps it.
    @State private var frozen: [String: [Field]] = [:]

    enum Field: String, CaseIterable { case load, reps, meters, calories, seconds }

    /// The numbers a row's sets are edited in: what any set has, plus what the exercise counts in.
    static func fields(_ sets: [SetResult], unit: String) -> [Field] {
        let measure = Measure.of(unit)
        var out: [Field] = []
        let has = { (f: Field) in sets.contains { value($0, f) != nil } }
        if has(.load) || (!unit.isEmpty && unit != "reps" && measure == nil) { out.append(.load) }
        if has(.reps) || !(has(.seconds) || has(.meters) || has(.calories) || measure != nil) { out.append(.reps) }
        if has(.meters) || measure == .meters { out.append(.meters) }
        if has(.calories) || measure == .calories { out.append(.calories) }
        if has(.seconds) || measure != nil { out.append(.seconds) }
        return out
    }

    static func value(_ x: SetResult, _ f: Field) -> Double? {
        switch f {
        case .load: x.load
        case .reps: x.reps
        case .meters: x.meters
        case .calories: x.calories
        case .seconds: x.seconds
        }
    }

    static func set(_ x: inout SetResult, _ f: Field, _ v: Double?) {
        switch f {
        case .load: x.load = v
        case .reps: x.reps = v
        case .meters: x.meters = v
        case .calories: x.calories = v
        case .seconds: x.seconds = v
        }
    }

    private static func head(_ f: Field, unit: String) -> String {
        switch f {
        case .load: unit.isEmpty ? "kg" : unit
        case .reps: "Reps"
        case .meters: "m"
        case .calories: "Cal"
        case .seconds: "Sec"
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("Sets").font(.headline)
                Spacer()
                Button(editing ? "Done" : "Edit sets") {
                    if !editing {
                        frozen = Dictionary(uniqueKeysWithValues: session.steps.map { ($0.id, Self.fields(Logbook.sets(of: $0), unit: Library.shared.exercise($0.exerciseKey)?.unit ?? "")) })
                    }
                    editing.toggle()
                }
                    .font(.subheadline.weight(.semibold))
                    .accessibilityIdentifier("edit-sets")
            }
            .padding(14)
            ForEach(session.steps) { step in
                Divider().padding(.leading, 14)
                VStack(alignment: .leading, spacing: 8) {
                    if editing {
                        Text(Library.shared.name(step.exerciseKey)).font(.subheadline.weight(.semibold)).foregroundStyle(Brand.ink)
                        editor(step)
                    } else {
                        NavigationLink { ExerciseHistoryView(exerciseKey: step.exerciseKey) } label: {
                            HStack {
                                Text(Library.shared.name(step.exerciseKey)).font(.subheadline.weight(.semibold)).foregroundStyle(Brand.ink)
                                Spacer()
                                if let i = step.incline { Text("\(Format.number(i))% incline").font(.caption).foregroundStyle(Brand.muted) }
                                if step.success == false { Text("missed").font(.caption.weight(.bold)).foregroundStyle(Color(light: 0xB91C1C, dark: 0xF87171)) }
                                Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(Brand.faint)
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        pills(step)
                    }
                }
                .padding(14)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface()
    }

    private func unit(_ key: String) -> String {
        (Library.shared.exercise(key)?.unit ?? "").replacingOccurrences(of: " per arm", with: "").replacingOccurrences(of: " per side", with: "").trimmingCharacters(in: .whitespaces)
    }

    private func pills(_ step: StepResult) -> some View {
        let sets = Logbook.sets(of: step)
        let marks = SetType.marks(sets.map(\.type))
        let u = Measure.of(unit(step.exerciseKey)) == nil ? unit(step.exerciseKey) : ""
        return FlowRow(spacing: 6) {
            ForEach(Array(sets.enumerated()), id: \.offset) { i, x in
                HStack(spacing: 4) {
                    Text(marks[i]).fontWeight(.heavy).foregroundStyle(x.type == .warmup ? Color(hex: 0xB45309) : x.type == .drop ? Brand.rest : x.type == .failure ? Color(hex: 0xB91C1C) : Brand.muted)
                    Text(Logbook.label(x, unit: u).isEmpty ? "–" : Logbook.label(x, unit: u)).fontWeight(.semibold).foregroundStyle(Brand.ink)
                    if let at = x.at { Text(Format.clock(at)).font(.caption2).foregroundStyle(Brand.faint) }
                }
                .font(.caption)
                .monospacedDigit()
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(Brand.lineSoft, in: Capsule())
            }
        }
    }

    private func editor(_ step: StepResult) -> some View {
        let sets = Logbook.sets(of: step)
        let marks = SetType.marks(sets.map(\.type))
        let fields = frozen[step.id] ?? Self.fields(sets, unit: Library.shared.exercise(step.exerciseKey)?.unit ?? "")
        let u = unit(step.exerciseKey)
        return VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Text("Set").frame(width: 34, alignment: .leading)
                ForEach(fields, id: \.self) { Text(Self.head($0, unit: u)).frame(maxWidth: .infinity, alignment: .leading) }
                Color.clear.frame(width: 36, height: 1)
            }
            .font(.caption2.weight(.bold))
            .textCase(.uppercase)
            .foregroundStyle(Brand.muted)
            ForEach(Array(sets.enumerated()), id: \.offset) { i, x in
                HStack(spacing: 6) {
                    SetMarkButton(mark: marks[i], type: x.type ?? .normal, label: "Set \(i + 1)") {
                        onEdit(EditSets.edit(session, row: step.id, index: i, plan: EditSets.plannedFor(runsheet, stepId: step.stepId)) { $0.type = ($0.type ?? .normal).next })
                    }
                    .frame(width: 34, alignment: .leading)
                    ForEach(fields, id: \.self) { f in
                        TextField(
                            "–",
                            value: Binding(
                                get: { Self.value(x, f) },
                                set: { v in onEdit(EditSets.edit(session, row: step.id, index: i, plan: EditSets.plannedFor(runsheet, stepId: step.stepId)) { Self.set(&$0, f, v) }) }
                            ),
                            format: .number
                        )
                        .keyboardType(.decimalPad)
                        .font(.body.weight(.semibold))
                        .monospacedDigit()
                        .padding(.horizontal, 8)
                        .frame(maxWidth: .infinity, minHeight: 36)
                        .background(Brand.surface, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(Brand.line))
                        .accessibilityLabel("Set \(i + 1) \(Self.head(f, unit: u))")
                        .accessibilityIdentifier("set-\(step.exerciseKey)-\(i)-\(f.rawValue)")
                    }
                    Button {
                        onEdit(EditSets.removeSet(session, row: step.id, index: i, plan: EditSets.plannedFor(runsheet, stepId: step.stepId)))
                    } label: {
                        Image(systemName: "minus.circle")
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundStyle(Brand.faint)
                            .frame(width: 36, height: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Remove set \(i + 1)")
                    .accessibilityIdentifier("remove-set-\(step.exerciseKey)-\(i)")
                }
            }
            Button {
                onEdit(EditSets.addSet(session, row: step.id, plan: EditSets.plannedFor(runsheet, stepId: step.stepId)))
            } label: {
                Label("Add set", systemImage: "plus")
                    .font(.subheadline.weight(.semibold))
                    .frame(minHeight: 44)
            }
            .buttonStyle(.plain)
            .foregroundStyle(Brand.coralInk)
            .accessibilityIdentifier("add-set-\(step.exerciseKey)")
        }
    }
}
