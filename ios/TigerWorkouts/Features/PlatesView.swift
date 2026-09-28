import SwiftUI

/// The set number as a button: 1, 2, 3 for normal sets, W / D / F for a warm-up, a drop set and a
/// set to failure. A tap steps it through the types, as on the web (`SetMark` in set-grid.tsx).
struct SetMarkButton: View {
    var mark: String
    var type: SetType
    var label: String
    var highlight = false
    var cycle: (() -> Void)?

    private var tint: (fg: Color, bg: Color) {
        switch type {
        case .warmup: (Color(hex: 0xB45309), Color(hex: 0xFFFBEB))
        case .drop: (Brand.rest, Brand.well)
        case .failure: (Color(hex: 0xB91C1C), Color(hex: 0xFEE2E2))
        case .normal: (highlight ? Brand.coralInk : Brand.ink, .clear)
        }
    }

    var body: some View {
        Button { cycle?() } label: {
            Text(mark)
                .font(.system(size: 17, weight: .heavy, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(tint.fg)
                .frame(minWidth: 28, minHeight: 30)
                .background(tint.bg, in: RoundedRectangle(cornerRadius: 7, style: .continuous))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(cycle == nil)
        .accessibilityLabel("\(label): \(type.label)")
        .accessibilityHint("Tap to change the set type")
        .accessibilityIdentifier("set-mark")
    }
}

/// The plate calculator: one side of the bar from the collar out, heaviest plate innermost and
/// labelled, then the same in words ("20 kg bar + 20 + 2.5 per side"). A load the plates cannot
/// make shows the closest they can. Plates are Settings → My equipment's, or a gym's set.
struct PlateSheet: View {
    var load: Double
    var equipment: Equipment?

    var body: some View {
        let p = Plates.plates(for: load, equipment)
        VStack(alignment: .leading, spacing: 14) {
            Text("\(Format.number(load)) kg on the bar").font(.title3.weight(.heavy))
            HStack(spacing: 3) {
                Capsule().fill(Brand.faint).frame(width: 36, height: 12)
                RoundedRectangle(cornerRadius: 2).fill(Brand.muted).frame(width: 8, height: 28)
                ForEach(Array(p.perSide.enumerated()), id: \.offset) { _, kg in
                    Text(Plates.num(kg))
                        .font(.system(size: 11, weight: .heavy))
                        .foregroundStyle(.white)
                        .frame(width: 28, height: 28 + min(1, kg / 25) * 72)
                        .background(Brand.ink, in: RoundedRectangle(cornerRadius: 6, style: .continuous))
                }
                Capsule().fill(Brand.faint).frame(height: 12).frame(minWidth: 24)
            }
            .frame(maxWidth: .infinity, minHeight: 112)
            .padding(.horizontal, 12)
            .background(Brand.well, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(Plates.text(p))
            Text(Plates.text(p)).font(.headline).foregroundStyle(Brand.ink)
                .accessibilityIdentifier("plate-text")
            if !p.exact {
                Text("Your plates cannot make \(Format.number(load)) kg. Closest: \(Format.number(p.total)) kg.")
                    .font(.footnote).foregroundStyle(Color(hex: 0xB45309))
            }
            if (equipment?.plates ?? []).isEmpty {
                Text("A gym’s plates. Set yours in Me → Settings → My equipment.").font(.caption).foregroundStyle(Brand.muted)
            }
            Spacer(minLength: 0)
        }
        .padding(20)
        // Light, whatever it is opened over: the timer runs dark, and the plates are ink on a pale well.
        .environment(\.colorScheme, .light)
        .presentationBackground(Brand.surface)
        .presentationDetents([.height(320)])
        .presentationDragIndicator(.visible)
    }
}

/// A small disc beside a barbell load that opens the plate calculator for it.
struct PlatesButton: View {
    var load: Double?
    var equipment: Equipment? = Equipment.current()
    @State private var open = false

    var body: some View {
        if let load, load > 0 {
            Button { open = true } label: {
                Image(systemName: "circle.circle")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Brand.muted)
                    .frame(width: 30, height: 30)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.borderless)
            .accessibilityLabel("Plates for \(Format.number(load)) kg")
            .sheet(isPresented: $open) { PlateSheet(load: load, equipment: equipment) }
        }
    }
}

/// Settings → My equipment: the bar's weight, a count per plate size (counted singly — a pair puts
/// one on each side), and the dumbbells and kettlebells you own. Suggested loads snap to what these
/// make; a section left empty is no constraint, except kettlebells, which fall back to 4 kg steps.
struct EquipmentView: View {
    @Environment(Store.self) private var store

    private var e: Equipment { store.equipment ?? Equipment() }

    private func set(_ change: (inout Equipment) -> Void) {
        var next = e
        change(&next)
        Task { await store.setEquipment(next) }
    }

    var body: some View {
        Form {
            Section {
                Stepper(value: Binding(get: { e.barKg ?? Plates.defaultBarKg }, set: { v in set { $0.barKg = v } }), in: 0...50, step: 2.5) {
                    LabeledContent("Bar", value: "\(Format.number(e.barKg ?? Plates.defaultBarKg)) kg")
                }
                ForEach(Plates.plateSizes, id: \.self) { kg in
                    let count = e.plates?.first(where: { $0.kg == kg })?.count ?? 0
                    Stepper(value: Binding(get: { count }, set: { n in set { eq in
                        var plates = (eq.plates ?? []).filter { $0.kg != kg }
                        if n > 0 { plates.append(PlateCount(kg: kg, count: n)) }
                        eq.plates = plates.sorted { $0.kg > $1.kg }
                    } }), in: 0...20, step: 2) {
                        LabeledContent("\(Plates.num(kg)) kg plates", value: "\(count)")
                    }
                    .accessibilityIdentifier("plates-\(Plates.num(kg))")
                }
            } header: {
                Text("Barbell")
            } footer: {
                Text((e.plates ?? []).isEmpty ? "No plates set: bar loads round to 2.5 kg." : "Bar loads snap to what these plates make. Count plates singly: a pair is 2.")
            }
            Section {
                chips(Plates.dumbbellSizes, owned: e.dumbbells ?? []) { kg in set { $0.dumbbells = toggle($0.dumbbells ?? [], kg) } }
            } header: {
                Text("Dumbbells")
            } footer: {
                Text((e.dumbbells ?? []).isEmpty ? "None set: dumbbell loads round to the exercise’s step." : "One of a pair.")
            }
            Section {
                let bells = (e.kettlebells ?? []).isEmpty ? Plates.defaultKettlebells : e.kettlebells!
                chips(Plates.kettlebellSizes, owned: bells) { kg in set { $0.kettlebells = toggle(bells, kg) } }
            } header: {
                Text("Kettlebells")
            } footer: {
                Text((e.kettlebells ?? []).isEmpty ? "Not set: 4 to 48 kg in 4 kg steps." : "Tap the bells you have.")
            }
        }
        .navigationTitle("My equipment")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            // Back to a gym's plates and the default steps, on the web too.
            if store.equipment != nil {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Clear", role: .destructive) { Task { await store.setEquipment(nil) } }
                        .accessibilityIdentifier("clear-equipment")
                }
            }
        }
    }

    private func toggle(_ list: [Double], _ kg: Double) -> [Double] {
        list.contains(kg) ? list.filter { $0 != kg } : (list + [kg]).sorted()
    }

    private func chips(_ sizes: [Double], owned: [Double], tap: @escaping (Double) -> Void) -> some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 52), spacing: 6)], spacing: 6) {
            ForEach(sizes, id: \.self) { kg in
                let on = owned.contains(kg)
                Button { tap(kg) } label: {
                    Text(Plates.num(kg))
                        .font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity, minHeight: 34)
                        .foregroundStyle(on ? .white : Brand.ink)
                        .background(on ? Brand.ink : Brand.surface, in: Capsule())
                        .overlay(Capsule().strokeBorder(on ? .clear : Brand.line))
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
        .padding(.vertical, 4)
    }
}

/// Training maxes for the lifts a workout gives as a % of one (5/3/1, nSuns), and your bodyweight
/// for the ones given as × bodyweight. The port of the web's Training maxes sheet; the same
/// `user_state.prefs` fields, so a max set on either side holds on both.
struct TrainingMaxesView: View {
    @Environment(Store.self) private var store
    /// The exercises to list: the relative ones in a workout, or the big four.
    var exercises: [ExerciseRef]
    var needsBodyweight = false

    static let bigFour = ["bb_back_squat", "bb_bench", "bb_deadlift", "bb_ohp"]

    /// Me → Training maxes: the big four, every lift a workout loads as a % of a training max, and
    /// any lift that already has one. The port of `maxLifts` in training-maxes.ts.
    static func lifts(in workouts: [Runsheet], maxes: [String: Double], ref: (String) -> ExerciseRef) -> [ExerciseRef] {
        var out: [ExerciseRef] = []
        var seen = Set<String>()
        func add(_ e: ExerciseRef) { if seen.insert(e.key).inserted { out.append(e) } }
        bigFour.forEach { add(ref($0)) }
        for w in workouts {
            for item in w.items {
                let steps: [Step] = switch item {
                case .block(let b): b.steps
                case .step(let s): [s]
                case .ref: []
                }
                for case .exercise(let e) in steps where e.targetPct != nil { add(e.exercise) }
            }
        }
        maxes.keys.sorted().forEach { add(ref($0)) }
        return out
    }

    var body: some View {
        Form {
            Section {
                ForEach(exercises, id: \.key) { ex in
                    let tm = store.trainingMaxes[ex.key]
                    Stepper(value: Binding(get: { tm ?? 0 }, set: { v in Task { await store.setTrainingMax(ex.key, v > 0 ? v : nil) } }), in: 0...500, step: ex.step > 0 ? ex.step : 2.5) {
                        LabeledContent(ex.name, value: tm.map { "\(Format.number($0)) kg" } ?? "not set")
                    }
                    .accessibilityIdentifier("tm-\(ex.key)")
                }
            } footer: {
                Text("A set written as 65% TM is 65% of the training max here, rounded to a load you can make. Step one down to 0 to take it off.")
            }
            if !store.trainingMaxes.isEmpty {
                Section {
                    Button("Clear all training maxes", role: .destructive) { Task { await store.clearTrainingMaxes() } }
                        .accessibilityIdentifier("clear-training-maxes")
                }
            }
            if needsBodyweight {
                Section {
                    Stepper(value: Binding(get: { store.bodyweightKg ?? 70 }, set: { v in Task { await store.setBodyweight(v) } }), in: 30...200, step: 0.5) {
                        LabeledContent("Bodyweight", value: store.bodyweightKg.map { "\(Format.number($0)) kg" } ?? "not set")
                    }
                } footer: {
                    Text("For loads written as × bodyweight. Apple Health fills it when it is on.")
                }
            }
        }
        .navigationTitle("Training maxes")
        .navigationBarTitleDisplayMode(.inline)
    }
}
