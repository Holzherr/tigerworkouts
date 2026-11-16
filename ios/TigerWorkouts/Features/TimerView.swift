import SwiftUI

struct TimerView: View {
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State var runner: SessionRunner
    /// The app's own appearance, from outside this cover. The finish screen uses it by value:
    /// handing `nil` back after `.dark` left the finish screen dark in a light app.
    var appearance: ColorScheme = .light
    var onClose: () -> Void
    /// Settings → Tones, switched from the top bar too. It holds for later sessions.
    @AppStorage(Switches.sound) private var sound = true

    @State private var showOverview = false
    @State private var editing: ExerciseStep?
    /// Opens tall: the alternatives sit under the steppers, and a half sheet hides them.
    @State private var sheetDetent: PresentationDetent = .large
    @State private var confirmQuit = false
    @State private var confirmDiscard = false
    /// Finish and save from the ⋯ menu with work still to come: what is left, asked first.
    @State private var confirmFinish: String?
    /// The set row open for editing on a straight-set block; nil = the set you are on.
    @State private var openSet: String?
    @State private var rowsFade = RowsFade()
    /// The card's steppers flipped from how they start: shut on a running step, open at the block
    /// gate, where the machine gets set. Back to that on every new step.
    @State private var amountsFlipped = false
    /// A number being typed in place of − / +: a load, a count, metres, an incline.
    @State private var entry: NumberEntryRequest?
    /// Everything still to come, opened from the Up next line.
    @State private var showRemaining = false
    /// Last time's sets and settings, worked out once per step, not on every redraw.
    @State private var memo = HistoryMemo()

    private var isRest: Bool { runner.slot?.kind == .rest }
    private var accent: Color { isRest ? Brand.Night.rest : Brand.coral }

    var body: some View {
        ZStack {
            (runner.isDone ? Brand.canvas : Brand.Night.ground).ignoresSafeArea()
            if runner.isDone {
                finished
            } else {
                running
            }
        }
        .overlay(alignment: .top) {
            if let flash = runner.recordFlash, !runner.isDone {
                RecordToast(text: flash.text) { runner.clearRecordFlash() }
                    .padding(.top, 60)
                    // Over the top bar for a moment; taps go through to End session and the rest.
                    .allowsHitTesting(false)
            }
        }
        .overlay(alignment: .bottom) {
            if let undo = runner.undoable, !runner.isDone {
                UndoToast(label: undo.label, dark: true) { runner.undo() } onExpire: { runner.clearUndo() }
                    .padding(.bottom, 150)
            }
        }
        .animation(.easeOut(duration: 0.2), value: runner.recordFlash)
        .animation(.easeOut(duration: 0.2), value: runner.undoable?.at)
        // Dark while it runs, as on the web: a white clock on slate reads across a bright gym.
        // Finished, it goes back to the rest of the app's look.
        .preferredColorScheme(runner.isDone ? appearance : .dark)
        .animation(.easeInOut(duration: 0.2), value: runner.slot?.id)
        .animation(.easeInOut(duration: 0.2), value: runner.state.phase)
        .onAppear { runner.begin() }
        .onChange(of: runner.slot?.id) { openSet = nil; amountsFlipped = false }
        .numberEntry($entry)
        .sheet(isPresented: $showRemaining) { remainingSheet.preferredColorScheme(.light) }
        .onDisappear { runner.end() }
        .sheet(isPresented: $showOverview) { overview.preferredColorScheme(.light) }
        .sheet(item: $editing) { step in
            ExerciseSheet(
                step: step,
                workout: runner.runsheet,
                sets: runner.straightSetStep?.id == step.id ? runner.setRows.map { ExerciseSheet.SetLine(type: $0.type, load: $0.load, count: TimerView.countShown($0, step)) } : nil,
                target: Binding(
                    get: { runner.plannedTarget(step.id) ?? step.target },
                    set: { if let v = $0 { runner.setStepTarget(step.id, v) } }
                ),
                incline: Binding(
                    get: { runner.plannedIncline(step.id) ?? step.incline },
                    set: { if let v = $0 { runner.setStepIncline(step.id, v) } }
                ),
                appliesFromHere: true,
                onDrop: { runner.drop(stepId: step.id) },
                onSwap: { option in runner.swap(stepId: step.id, to: option.exercise, target: option.target) }
            )
            .presentationDetents([.medium, .large], selection: $sheetDetent)
            .preferredColorScheme(.light)
        }
        .confirmationDialog("End this session?", isPresented: $confirmQuit, titleVisibility: .visible) {
            // Cutting a circuit short is one tap here, not one Skip per station.
            if runner.canEndBlock {
                Button("End this block") { runner.endBlock() }
            }
            Button("Finish and save") { runner.finish() }
            Button("Discard", role: .destructive) { discard() }
            // Not a cancel role: iOS hides that button in this dialog, and it has to be offered.
            Button("Keep going") {}
        } message: {
            Text("Finish and save keeps what you have done so far. Discard throws this session away: no history, no streak, nothing in Health.")
        }
        // The ⋯ menu's Discard sits right under Finish and save: it asks first.
        .confirmationDialog("Discard this session?", isPresented: $confirmDiscard, titleVisibility: .visible) {
            Button("Discard", role: .destructive) { discard() }
            // Not a cancel role, as above.
            Button("Keep going") {}
        } message: {
            Text("No history, no streak.")
        }
        // Finish and save sits one row above Discard: with work still to come it asks too.
        .confirmationDialog("Finish now?", isPresented: Binding(get: { confirmFinish != nil }, set: { if !$0 { confirmFinish = nil } }), titleVisibility: .visible) {
            Button("Finish and save") { runner.finish() }
            // Not a cancel role, as above.
            Button("Keep going") {}
        } message: {
            Text("\(confirmFinish ?? "") What you have done is saved.")
        }
    }

    /// Out of the session with nothing kept: the crash-safe copy goes, and nothing reached the
    /// store or Health, which only hear about a session once it finishes.
    private func discard() {
        runner.discard()
        onClose()
    }

    /// The ⋯ menu's Finish and save: one tap once every set is done, a question before that.
    private func menuFinish() {
        if let left = runner.leftLine { confirmFinish = left } else { runner.finish() }
    }

    // MARK: - Running

    private var running: some View {
        VStack(spacing: 0) {
            topBar
            capClock
            Spacer(minLength: 12)
            switch runner.state.phase {
            case .lead: leadIn
            case .ready: parked
            default: slotBody
            }
            Spacer(minLength: 12)
            if runner.state.phase != .lead {
                upNextBar
            }
            controls
        }
        // The timer follows the phone's text size up to the second accessibility size: past it a
        // set row and the clock no longer fit a phone.
        .dynamicTypeSize(...DynamicTypeSize.accessibility2)
    }

    /// Where you are: the block, which part of the session, and how far through the whole thing.
    private var topBar: some View {
        VStack(spacing: 10) {
            HStack(alignment: .center, spacing: 10) {
                Button { confirmQuit = true } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 16, weight: .bold))
                        .frame(width: 44, height: 44)
                        .background(Brand.Night.raised, in: Circle())
                }
                .accessibilityLabel("End session")

                VStack(alignment: .leading, spacing: 1) {
                    Text(runner.slot?.blockName ?? runner.runsheet.title)
                        .font(.headline)
                        .lineLimit(1)
                    // Wraps rather than truncates: "Block 2 of 9 · Round 3 of 8" beside three buttons
                    // does not fit one line on the narrower phones.
                    Text(whereabouts)
                        .font(.subheadline)
                        .foregroundStyle(Brand.Night.muted)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 8)
                VStack(alignment: .trailing, spacing: 1) {
                    Text("\(Int((runner.overall * 100).rounded()))%").font(.headline).monospacedDigit()
                    // The whole-session clock, always somewhere, always smaller than the countdown.
                    Text(Format.clock(runner.elapsed))
                        .font(.subheadline)
                        .foregroundStyle(Brand.Night.muted)
                        .monospacedDigit()
                }
                // Sound and the overview sit in the ⋯ menu with Finish: the bar keeps to where you are.
                SessionMenu(sound: sound, toggleSound: toggleSound, overview: { showOverview = true }, finish: menuFinish, discard: { confirmDiscard = true }).equatable()
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Brand.Night.line)
                    Capsule().fill(Brand.coral).frame(width: max(8, geo.size.width * runner.overall))
                }
            }
            .frame(height: 6)
            if runner.ghost != nil || (runner.goal != nil && runner.state.phase != .done) {
                pace
            }
        }
        .foregroundStyle(Brand.Night.text)
        .padding(.horizontal, 16)
        .padding(.top, 6)
    }

    /// One quiet line: today's target, then the race against last time — "Target 45 × 10 · 14:26
    /// ahead of last time". Either part alone when the other has nothing to say.
    private var pace: some View {
        let target = runner.state.phase == .done ? nil : runner.goal
        return HStack(spacing: 0) {
            if let target {
                Text(target).accessibilityIdentifier("target")
            }
            if let ghost = runner.ghost {
                Text((target == nil ? "" : " · ") + TimerView.paceLine(ghost.short))
                    .accessibilityLabel("Against last time: \(ghost.text)")
                    .accessibilityIdentifier("ghost")
            }
            Spacer(minLength: 0)
        }
        .font(.subheadline)
        .monospacedDigit()
        .foregroundStyle(Brand.Night.muted)
        .lineLimit(1)
        .minimumScaleFactor(0.7)
    }

    /// "14:26 ahead" → "14:26 ahead of last time", "8 s behind" → "8 s behind last time",
    /// "on pace" → "on pace with last time".
    nonisolated static func paceLine(_ short: String) -> String {
        if short == "on pace" { return "on pace with last time" }
        return short.hasSuffix("behind") ? "\(short) last time" : "\(short) of last time"
    }

    private func toggleSound() {
        sound.toggle()
        Cues.shared.enabled = sound
    }

    /// "Block 2 of 9 · Round 3 of 8"
    private var whereabouts: String {
        guard let slot = runner.slot else { return runner.runsheet.title }
        var parts = ["Block \(slot.part + 1) of \(slot.parts)"]
        if let round = slot.roundLabel { parts.append(round) }
        return parts.joined(separator: " · ")
    }

    private var leadIn: some View {
        VStack(spacing: 18) {
            Text("Get ready").font(.title3.weight(.semibold)).foregroundStyle(Brand.Night.muted)
            Text(Format.clock(runner.clock.left ?? 0))
                .scaledFont(110, weight: .heavy, design: .rounded, relativeTo: .largeTitle, cap: 1.15)
                .monospacedDigit()
                .foregroundStyle(Brand.coral)
                .contentTransition(.numericText(countsDown: true))
            if let first = runner.slot?.exercise {
                exerciseCard(first, eyebrow: "First up", adjustable: false)
            }
        }
        .padding(.horizontal, 16)
    }

    /// Between blocks the timer waits for you, so moving to the next machine eats no work time.
    private var parked: some View {
        VStack(spacing: 18) {
            Text("Next block").font(.title3.weight(.semibold)).foregroundStyle(Brand.Night.muted)
            Text(runner.slot?.blockName ?? "Block")
                .scaledFont(34, weight: .heavy, relativeTo: .largeTitle)
                .multilineTextAlignment(.center)
                .foregroundStyle(Brand.Night.text)
            if let first = runner.slot?.exercise {
                exerciseCard(first, eyebrow: "First up", adjustable: true)
            }
            addSetToBlockBehind
            cappedRoundAsk
        }
        .padding(.horizontal, 16)
    }

    /// The AMRAP before this gate ended on its cap with its rounds ticked whole: the reps into the
    /// round it cut short, asked once, here.
    @ViewBuilder
    private var cappedRoundAsk: some View {
        if let cut = runner.cappedRound {
            HStack(spacing: 12) {
                Text("Time. Reps into round \(cut.round + 1)")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Brand.ink)
                    .frame(maxWidth: .infinity, alignment: .leading)
                let most = max(0, cut.reps - 1)
                nudge("minus", label: "Fewer reps") { runner.setExtraReps(blockId: cut.blockId, reps: max(0, cut.extra - $0)) }
                Text(Format.number(cut.extra))
                    .font(.title2.weight(.bold))
                    .monospacedDigit()
                    .foregroundStyle(Brand.ink)
                    .frame(minWidth: 40)
                    .accessibilityLabel("Reps into round \(cut.round + 1)")
                    .accessibilityValue(Format.number(cut.extra))
                    .accessibilityIdentifier("capped-round-value")
                nudge("plus", label: "More reps") { runner.setExtraReps(blockId: cut.blockId, reps: min(most, cut.extra + $0)) }
            }
            .padding(12)
            .background(.white, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            // White card on the dark timer: its ink has to be the light-appearance ink.
            .environment(\.colorScheme, .light)
            .accessibilityIdentifier("capped-round-reps")
        }
    }

    /// An AMRAP's or EMOM's round of plain rep work on one card: every exercise with its clip (tap
    /// for the how-to) and its reps. One button, "Round n done", ticks them all.
    private func roundCardView(_ rows: [(slot: Slot, exercise: ExerciseStep, done: Bool)], demo: CGFloat) -> some View {
        VStack(spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.element.slot.id) { n, row in
                Button { editing = row.exercise } label: {
                    HStack(spacing: 12) {
                        ExerciseDemo(ref: row.exercise.exercise, size: demo)
                        Text(row.exercise.exercise.name)
                            .font(.title3.weight(.heavy))
                            .foregroundStyle(row.done ? Brand.muted : Brand.ink)
                            .lineLimit(2)
                            .minimumScaleFactor(0.7)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        if row.done {
                            Image(systemName: "checkmark").font(.subheadline.weight(.bold)).foregroundStyle(Brand.muted)
                        }
                        Text(Format.number(row.exercise.forValue))
                            .font(.title2.weight(.heavy))
                            .monospacedDigit()
                            .foregroundStyle(row.done ? Brand.muted : Brand.ink)
                    }
                    .padding(.vertical, 8)
                    .frame(minHeight: 60)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(row.exercise.exercise.name), \(Format.number(row.exercise.forValue)) reps\(row.done ? ", done" : "")")
                .accessibilityHint("How to do it")
                .accessibilityIdentifier("round-row-\(n)")
                if n < rows.count - 1 { Divider().overlay(Brand.line) }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 4)
        .background(.white, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        // White card on the dark timer: its ink has to be the light-appearance ink.
        .environment(\.colorScheme, .light)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("round-card")
    }

    /// "+ One more set of Hip thrust": the block just finished, while nothing after it is done yet.
    /// The timer goes back to the new set.
    @ViewBuilder
    private var addSetToBlockBehind: some View {
        if let b = runner.addableBlock, b.id != runner.slot?.blockId, let ex = b.straightSetStep {
            Button { runner.addSet(blockId: b.id) } label: {
                Label("One more set of \(ex.exercise.name)", systemImage: "plus")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Brand.Night.text)
                    .padding(.horizontal, 14)
                    .frame(minHeight: 44)
                    .background(Brand.Night.raised, in: Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("add-set-behind")
        }
    }

    /// An amrap or a capped for-time block runs against a clock of its own, and EMOM work against its
    /// minute; this is what is left of it.
    @ViewBuilder
    private var capClock: some View {
        if let clock = runner.capLeft.map({ (left: $0, of: "block") }) ?? runner.minuteLeft.map({ (left: $0, of: (runner.slot?.everySec ?? 60) == 60 ? "minute" : "interval") }),
           runner.state.phase == .running || runner.state.phase == .paused {
            let left = clock.left
            HStack(spacing: 6) {
                Image(systemName: "timer")
                Text("\(Format.clock(left)) left in the \(clock.of)").monospacedDigit()
            }
            .font(.subheadline.weight(.bold))
            .foregroundStyle(left <= 10 ? Brand.coral : Brand.Night.text)
            .padding(.horizontal, 14)
            .frame(height: 32)
            .background(Brand.Night.raised, in: Capsule())
            .padding(.top, 10)
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("cap-left")
        }
    }

    @ViewBuilder
    private var slotBody: some View {
        if let straight = runner.straightSetStep {
            VStack(spacing: 12) {
                if isRest {
                    Text("Rest").font(.title3.weight(.bold)).foregroundStyle(Brand.Night.rest)
                }
                countdown(size: 76)
                // The whole card scrolls, header and all, so the window is as tall as before; the
                // set you are on moves to the middle whenever it changes, and an edge with more of
                // the card behind it fades out instead of cutting a row in half.
                let focus = openSet ?? runner.setRows.first(where: \.current)?.slotId
                ScrollViewReader { proxy in
                    ScrollView {
                        setGrid(straight)
                            // Where the window sits on the card, in the card's own coordinates.
                            .onGeometryChange(for: RowsFade.self) { g in
                                let window = g.bounds(of: .named("set-rows")) ?? CGRect(origin: .zero, size: g.size)
                                return RowsFade(top: window.minY > 1, bottom: window.maxY < g.size.height - 1, window: window.height)
                            } action: { rowsFade = $0 }
                    }
                    .coordinateSpace(.named("set-rows"))
                    .scrollBounceBehavior(.basedOnSize)
                    .mask {
                        VStack(spacing: 0) {
                            LinearGradient(colors: [.clear, .black], startPoint: .top, endPoint: .bottom)
                                .frame(height: rowsFade.top ? 16 : 0)
                            Color.black
                            LinearGradient(colors: [.black, .clear], startPoint: .top, endPoint: .bottom)
                                .frame(height: rowsFade.bottom ? 16 : 0)
                        }
                    }
                    .accessibilityIdentifier("set-rows")
                    .accessibilityValue([rowsFade.top ? "faded top" : nil, rowsFade.bottom ? "faded bottom" : nil].compactMap { $0 }.joined(separator: ", "))
                    .onAppear { if let focus { proxy.scrollTo(focus, anchor: .center) } }
                    .onChange(of: focus) {
                        if let focus { withAnimation(.easeInOut(duration: 0.3)) { proxy.scrollTo(focus, anchor: .center) } }
                    }
                    // A rest adds its ±15 s under the clock and the window shrinks from the bottom,
                    // which hid the last set; centre it again.
                    .onChange(of: rowsFade.window) {
                        if let focus { withAnimation(.easeInOut(duration: 0.3)) { proxy.scrollTo(focus, anchor: .center) } }
                    }
                }
            }
            .padding(.horizontal, 16)
        } else {
            circuitBody
        }
    }

    /// The biggest clock and demo that fit the height left. On a 390 × 844 phone an AMRAP with a
    /// cap clock, a reps row and the block strip does not fit at full size: the column grew past
    /// the screen and pushed the top bar under the status bar.
    private var circuitBody: some View {
        ViewThatFits(in: .vertical) {
            circuitBody(clock: 110, demo: 72, spacing: 16)
            circuitBody(clock: 84, demo: 72, spacing: 12)
            circuitBody(clock: 64, demo: 56, spacing: 10)
        }
    }

    private func circuitBody(clock: CGFloat, demo: CGFloat, spacing: CGFloat) -> some View {
        VStack(spacing: spacing) {
            countdown(size: clock)
            if isRest {
                restCard
            } else if let rows = runner.roundCard {
                roundCardView(rows, demo: demo >= 72 ? 48 : 40)
            } else if let ex = runner.slot?.exercise {
                exerciseCard(ex, eyebrow: runner.stepPosition.map { "Exercise \($0.index) of \($0.count)" }, adjustable: true, demo: demo)
            }
            addSetToBlockBehind
        }
        .padding(.horizontal, 16)
    }

    /// The treadmill's other dial, under the speed. Nil for anything without one, so a bench has
    /// no incline line; a treadmill step with none yet set gets a line that opens the sheet.
    nonisolated static func inclineLabel(_ incline: Double?, for step: ExerciseStep) -> String? {
        let treadmill = Library.shared.group(step.exercise.key).map { [.treadmill, .walk, .run].contains($0) } ?? false
        guard incline != nil || step.incline != nil || treadmill else { return nil }
        return incline.map { "\(Format.number($0))% incline" } ?? "Set incline"
    }

    /// One dial of the next machine, with what it was set to last time.
    struct BlockSetting: Equatable {
        let label: String
        let unit: String
        let value: Double?
        let last: Double?

        var lastLabel: String? {
            last.map { "last time \(Format.number($0))\(unit == "%" ? "" : " ")\(unit)" }
        }
    }

    /// What the Next block card lets you set before the block starts: the step's own dial (speed,
    /// load) and, beside it, the treadmill's incline.
    nonisolated static func blockSettings(_ step: ExerciseStep, target: Double?, incline: Double?, results: [SessionResult], in workout: Runsheet? = nil) -> [BlockSetting] {
        var out: [BlockSetting] = []
        if step.hasSetting, Measure.of(step.exercise.unit) == nil {
            // What the first set was done at last time, which is what this sets up.
            let first = LastTime.set(results, for: step, round: 0, in: workout)?.load ?? LastTime.set(results, for: step, in: workout)?.load
            out.append(BlockSetting(label: step.settingLabel, unit: step.shortUnit, value: target, last: first))
        }
        if inclineLabel(incline, for: step) != nil {
            let used = Settings.lastUsed(results, workout: workout)
            let own = used["step:\(step.id)"].flatMap { $0.exerciseKey == step.exercise.key ? $0 : nil }
            let last = own?.incline ?? used["ex:\(step.exercise.key)"]?.incline
            out.append(BlockSetting(label: "Incline", unit: "%", value: incline, last: last))
        }
        return out
    }

    /// The incline a press of − or + on the card leaves: half a percent a step, never below flat.
    nonisolated static func inclineStep(_ incline: Double?, by presses: Double) -> Double {
        max(0, (incline ?? 0) + 0.5 * presses)
    }

    private func countdown(size: CGFloat) -> some View {
        VStack(spacing: 2) {
            if let left = runner.clock.left {
                let clock = Text(Format.clock(left))
                    .scaledFont(size, weight: .heavy, design: .rounded, relativeTo: .largeTitle, cap: 1.15)
                    .monospacedDigit()
                    .foregroundStyle(left <= 3 ? Brand.coral : (isRest ? Brand.Night.rest : Brand.Night.text))
                    .contentTransition(.numericText(countsDown: true))
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
                if runner.restAdjustable {
                    // −15 s and +15 s either side of the clock, one row instead of two.
                    HStack(spacing: 12) {
                        restNudge("−15s", label: "15 seconds less rest") { runner.extendRest(by: -15); Haptics.shared.play(.tick) }
                        clock
                        restNudge("+15s", label: "15 seconds more rest") { runner.extendRest(by: 15); Haptics.shared.play(.tick) }
                    }
                } else {
                    clock
                    // Both figures: how far into this step, and how long the step is. A 10-minute
                    // walk should read as a 10-minute walk, not only as a number falling.
                    if let total = runner.slot?.seconds {
                        Text("\(Format.clock(runner.clock.spent)) of \(Format.clock(total))")
                            .font(.subheadline)
                            .foregroundStyle(Brand.Night.muted)
                            .monospacedDigit()
                    } else if Runner.minuteOnly(runner.slot) {
                        // EMOM reps: the minute running out. Done logs the set; left alone, the minute
                        // logs it and the next one starts.
                        Text(runner.roundCard != nil ? "Tap Round done when you finish the round" : "Tap Done when you finish the set")
                            .font(.subheadline)
                            .foregroundStyle(Brand.Night.muted)
                    }
                }
            } else {
                Text(Format.clock(runner.clock.spent))
                    .scaledFont(size, weight: .heavy, design: .rounded, relativeTo: .largeTitle, cap: 1.15)
                    .monospacedDigit()
                    .foregroundStyle(Brand.Night.text)
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
                Text(runner.straightSetStep != nil ? "Tick the set when you finish it" : runner.roundCard != nil ? "Tap Round done when you finish the round" : "Tap Done when you finish the set")
                    .font(.subheadline).foregroundStyle(Brand.Night.muted)
            }
        }
    }

    /// The exercise as a card you can read from a bench: the demo (tap for the how-to), the name,
    /// and one line of what you are about to do — "24 kg × 10 reps" — that opens its steppers.
    private func exerciseCard(_ ex: ExerciseStep, eyebrow: String?, adjustable: Bool, demo: CGFloat = 72) -> some View {
        // Parked before a block: every dial of the next machine, each with last time's setting.
        let parked = adjustable && runner.state.phase == .ready && runner.slot?.exercise?.id == ex.id
        let sheet = runner.runsheet
        let settings = parked ? memo.value("settings|\(ex.id)|\(ex.exercise.key)|\(runner.target ?? -1)|\(runner.incline ?? -1)", store.results) { TimerView.blockSettings(ex, target: runner.target, incline: runner.incline, results: store.results, in: sheet) } : []
        let live = adjustable && runner.slot?.exercise?.id == ex.id
        let hasLoad = adjustable && ex.hasSetting && Measure.of(ex.exercise.unit) == nil
        let hasDials = hasLoad || !settings.isEmpty || (live && (runner.amountField != nil || runner.countsReps))
        // At the gate the steppers start open: that is when the weight goes on the bar.
        let open = hasDials && (parked != amountsFlipped)
        // Last time's set for this round (set n against set n), never the heaviest of the session.
        let round = live ? runner.slot?.round ?? 0 : 0
        let lastSet = memo.value("set|\(ex.id)|\(ex.exercise.key)|\(round)", store.results) { LastTime.set(store.results, for: ex, round: round, in: sheet) }
        let last = lastSet.flatMap { LastTime.compact([$0], unit: ex.shortUnit) }.map { "Last time \($0)" }
        return VStack(alignment: .leading, spacing: 14) {
            Button { editing = ex } label: {
                HStack(alignment: .center, spacing: 14) {
                    ExerciseDemo(ref: ex.exercise, size: demo)
                    VStack(alignment: .leading, spacing: 3) {
                        if let eyebrow {
                            Text(eyebrow)
                                .font(.caption.weight(.bold))
                                .textCase(.uppercase)
                                .tracking(0.8)
                                .foregroundStyle(Brand.coralInk)
                        }
                        Text(ex.exercise.name)
                            .scaledFont(24, weight: .heavy, relativeTo: .title2)
                            .foregroundStyle(Brand.ink)
                            .lineLimit(2)
                            .minimumScaleFactor(0.7)
                        // With no dials, what the step asks for; the cue is in the how-to.
                        if !hasDials {
                            Text(ex.forLabel).font(.subheadline).foregroundStyle(Brand.muted)
                            if let last {
                                Text(last).font(.subheadline.weight(.semibold)).foregroundStyle(Brand.coralInk)
                            }
                        }
                    }
                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if hasDials {
                Button { withAnimation(.easeInOut(duration: 0.2)) { amountsFlipped.toggle() } } label: {
                    HStack(spacing: 10) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(amountsLine(ex, live: live, hasLoad: hasLoad, settings: settings))
                                .scaledFont(22, weight: .heavy, relativeTo: .title2)
                                .monospacedDigit()
                                .foregroundStyle(Brand.ink)
                                .lineLimit(1)
                                .minimumScaleFactor(0.6)
                            if let last {
                                Text(last).font(.footnote).foregroundStyle(Brand.muted)
                            }
                        }
                        Spacer(minLength: 0)
                        Text(open ? "Close" : "Change")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Brand.coralInk)
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .frame(maxWidth: .infinity, minHeight: 60, alignment: .leading)
                    .background(Brand.lineSoft, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(open ? "Close" : "Change")
                .accessibilityValue(amountsLine(ex, live: live, hasLoad: hasLoad, settings: settings))
                .accessibilityIdentifier("amounts")
            }

            if open {
                // On the running set, a tap puts last time's weight and reps in.
                if live, let lastSet, last != nil, runner.state.phase == .running || runner.state.phase == .paused, let slot = runner.slot {
                    Button { runner.fill(slot.id, with: SetResult(reps: runner.countsReps ? lastSet.reps : nil, load: ex.hasSetting ? lastSet.load : nil, meters: runner.amountFields.contains(.meters) ? lastSet.meters : nil, calories: runner.amountFields.contains(.calories) ? lastSet.calories : nil)) } label: {
                        Text("Use last time")
                            .font(.subheadline.weight(.semibold))
                            .underline(pattern: .dot)
                            .foregroundStyle(Brand.coralInk)
                            .frame(minHeight: 32)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .padding(.vertical, -6)
                    .accessibilityLabel("Use last time")
                    .accessibilityValue(last ?? "")
                    .accessibilityIdentifier("use-last-time")
                }
                dials(ex, parked: parked, live: live, hasLoad: hasLoad, settings: settings)
            }
        }
        .padding(16)
        .background(.white, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        // White card on the dark timer: its ink has to be the light-appearance ink.
        .environment(\.colorScheme, .light)
    }

    /// "24 kg × 10 reps", "500 m", "10 kph · 2% incline": the card's dials in one line.
    private func amountsLine(_ ex: ExerciseStep, live: Bool, hasLoad: Bool, settings: [BlockSetting]) -> String {
        var parts: [String] = []
        if hasLoad, let load = live ? runner.target : runner.plannedTarget(ex.id) ?? ex.target {
            parts.append([Format.number(load), ex.shortUnit].filter { !$0.isEmpty }.joined(separator: " "))
        }
        if live {
            for field in runner.amountFields {
                parts.append("\(runner.amount(field).map(Format.number) ?? "—") \(field == .meters ? "m" : "cal")")
            }
        }
        if live, runner.countsReps {
            let reps = runner.reps ?? ex.forValue
            parts.append("\(Format.number(reps)) \(reps == 1 ? "rep" : "reps")")
        }
        var line = parts.isEmpty ? ex.forLabel : parts.joined(separator: " × ")
        if let incline = settings.first(where: { $0.label == "Incline" })?.value ?? (live ? runner.incline : nil) {
            line += " · \(Format.number(incline))% incline"
        }
        return line
    }

    /// The card's steppers: the load, at the gate the incline, then metres or calories and reps.
    @ViewBuilder
    private func dials(_ ex: ExerciseStep, parked: Bool, live: Bool, hasLoad: Bool, settings: [BlockSetting]) -> some View {
            if hasLoad {
                Divider()
                HStack(spacing: 10) {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(ex.settingLabel).font(.subheadline.weight(.semibold)).foregroundStyle(Brand.body)
                        if let last = settings.first(where: { $0.label == ex.settingLabel })?.lastLabel {
                            Text(last).font(.caption).foregroundStyle(Brand.muted)
                        } else if !parked, let incline = runner.incline, runner.slot?.exercise?.id == ex.id {
                            Text("\(Format.number(incline))% incline").font(.caption).foregroundStyle(Brand.muted)
                        }
                    }
                    Spacer()
                    if Plates.kit(ex.exercise) == .barbell {
                        PlatesButton(load: runner.slot?.exercise?.id == ex.id ? runner.target : runner.plannedTarget(ex.id) ?? ex.target)
                    }
                    nudge("minus", label: "Less") { runner.nudgeTarget(-$0) }
                    let load = runner.slot?.exercise?.id == ex.id ? runner.target : runner.plannedTarget(ex.id) ?? ex.target
                    typed(load, title: ex.settingLabel, unit: ex.shortUnit) { runner.setStepTarget(ex.id, $0) } label: {
                        VStack(spacing: 0) {
                            Text(load.map(Format.number) ?? "—")
                                .scaledFont(26, weight: .bold, design: .rounded, relativeTo: .title2)
                                .monospacedDigit()
                                .foregroundStyle(Brand.ink)
                            Text(ex.shortUnit).font(.caption2).foregroundStyle(Brand.muted)
                        }
                        .frame(minWidth: 64)
                    }
                    nudge("plus", label: "More") { runner.nudgeTarget($0) }
                }
                .disabled(runner.slot?.exercise?.id != ex.id)
            }

            if let incline = settings.first(where: { $0.label == "Incline" }) {
                Divider()
                HStack(spacing: 10) {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(incline.label).font(.subheadline.weight(.semibold)).foregroundStyle(Brand.body)
                        if let last = incline.lastLabel {
                            Text(last).font(.caption).foregroundStyle(Brand.muted)
                        }
                    }
                    Spacer()
                    nudge("minus", label: "Less incline") { runner.setStepIncline(ex.id, TimerView.inclineStep(runner.incline, by: -$0)) }
                    typed(incline.value, title: "Incline", unit: "%") { runner.setStepIncline(ex.id, $0) } label: {
                        VStack(spacing: 0) {
                            Text(incline.value.map(Format.number) ?? "—")
                                .scaledFont(26, weight: .bold, design: .rounded, relativeTo: .title2)
                                .monospacedDigit()
                                .foregroundStyle(Brand.ink)
                                .accessibilityIdentifier("incline-value")
                            Text(incline.unit).font(.caption2).foregroundStyle(Brand.muted)
                        }
                        .frame(minWidth: 64)
                    }
                    nudge("plus", label: "More incline") { runner.setStepIncline(ex.id, TimerView.inclineStep(runner.incline, by: $0)) }
                }
            }

            // Metres rowed and/or calories on the counter, when not what the plan said: each the step
            // records gets its own row.
            if live {
                ForEach(Array(runner.amountFields.enumerated()), id: \.element) { i, field in
                    Divider()
                    HStack(spacing: 10) {
                        Text(field == .meters ? "Metres done" : "Calories done").font(.subheadline.weight(.semibold)).foregroundStyle(Brand.body)
                        Spacer()
                        nudge("minus", label: field == .meters ? "Fewer metres" : "Fewer calories") { runner.nudgeAmount(-$0, field: field) }
                        typed(runner.amount(field), title: field == .meters ? "Metres done" : "Calories done", unit: field == .meters ? "m" : "cal") { runner.setAmount($0, field: field) } label: {
                            Text(runner.amount(field).map(Format.number) ?? "—")
                                .scaledFont(26, weight: .bold, design: .rounded, relativeTo: .title2)
                                .monospacedDigit()
                                .foregroundStyle(Brand.ink)
                                .frame(minWidth: 64)
                                .accessibilityIdentifier(i == 0 ? "amount-done" : "\(field.rawValue)-done")
                        }
                        nudge("plus", label: field == .meters ? "More metres" : "More calories") { runner.nudgeAmount($0, field: field) }
                    }
                }
            }

            // What you did, not what the plan said: without this every rep in History was the
            // planned rep.
            if live, runner.countsReps {
                Divider()
                HStack(spacing: 10) {
                    Text("Reps done").font(.subheadline.weight(.semibold)).foregroundStyle(Brand.body)
                    Spacer()
                    nudge("minus", label: "Fewer reps") { runner.nudgeReps(-$0) }
                    typed(runner.reps, title: "Reps done", unit: "reps") { runner.setReps($0.rounded()) } label: {
                        Text(runner.reps.map(Format.number) ?? "—")
                            .scaledFont(26, weight: .bold, design: .rounded, relativeTo: .title2)
                            .monospacedDigit()
                            .foregroundStyle(Brand.ink)
                            .frame(minWidth: 64)
                            .accessibilityIdentifier("reps-done")
                    }
                    nudge("plus", label: "More reps") { runner.nudgeReps($0) }
                }
            }
    }

    /// A straight-set block as the gym writes it: a done set is one line, and every set still to do
    /// is a row of its own with its weight and reps and last time's set of the same number, each
    /// changeable before and during it (Priyanka, 14 Nov 2026: the sets after the next one were
    /// folded into "2 more sets · 105 kg × 6"). "+ Add set" under the last copies it. A done set is
    /// locked until it is un-ticked (tap the tick again), so a weight is never changed by a stray
    /// tap on a set already logged.
    private func setGrid(_ ex: ExerciseStep) -> some View {
        let rows = runner.setRows
        let sheet = runner.runsheet
        let last = memo.value("sets|\(ex.id)|\(ex.exercise.key)", store.results) { LastTime.sets(store.results, for: ex, in: sheet) ?? [] }
        let incline = Self.setColumns(ex, inclines: rows.map(\.incline)).contains("INCL")
        return VStack(alignment: .leading, spacing: 4) {
            Button { editing = ex } label: {
                HStack(spacing: 12) {
                    ExerciseDemo(ref: ex.exercise, size: 56)
                    Text(ex.exercise.name)
                        .scaledFont(22, weight: .heavy, relativeTo: .title2)
                        .foregroundStyle(Brand.ink)
                        .lineLimit(2)
                        .minimumScaleFactor(0.7)
                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            // The row being set has no room for the plates; they sit by the name, for its load.
            .overlay(alignment: .trailing) {
                if Plates.kit(ex.exercise) == .barbell, let row = rows.first(where: { openSet == $0.slotId }) ?? rows.first(where: \.current) {
                    PlatesButton(load: row.load)
                }
            }
            .padding(.bottom, 6)

            ForEach(rows) { row in
                Group {
                    if row.done {
                        doneLine(row, ex)
                    } else {
                        setRow(row, ex, incline: incline, last: last.indices.contains(row.number - 1) && (last[row.number - 1].type ?? .normal) == row.type ? last[row.number - 1] : nil)
                    }
                }
                .id(row.slotId)
            }
            if let block = runner.addableBlock, block.id == runner.slot?.blockId {
                Button { runner.addSet(blockId: block.id) } label: {
                    Label("Add set", systemImage: "plus")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Brand.coralInk)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityHint("Copies the last set's weight and reps")
                .accessibilityIdentifier("add-set")
            }
        }
        .padding(12)
        .background(.white, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .environment(\.colorScheme, .light)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("timer-set-grid")
    }

    /// "45 kg × 10", "20 sec", "500 m · 2%": a set in a few characters.
    private func setSummary(_ row: SessionRunner.SetRow, _ ex: ExerciseStep) -> String {
        var parts: [String] = []
        if ex.hasSetLoad, Measure.of(ex.exercise.unit) == nil {
            parts.append([row.load.map(Format.number) ?? "—", ex.shortUnit].filter { !$0.isEmpty }.joined(separator: " "))
        }
        if let count = ex.countLabel {
            let n = Format.number((Self.countShown(row, ex) * 10).rounded() / 10)
            parts.append(count == "Reps" ? n : "\(n) \(count.lowercased())")
        }
        var line = parts.joined(separator: " × ")
        for extra in ex.extraLogs {
            if let v = Self.loggedShown(row, extra) {
                line = [line, Rounds.amount(v, extra)].filter { !$0.isEmpty }.joined(separator: " · ")
            }
        }
        return row.incline.map { "\(line) · \(Format.number($0))%" } ?? line
    }

    /// "✓ Set 1    45 kg × 10". The tick takes it back.
    private func doneLine(_ row: SessionRunner.SetRow, _ ex: ExerciseStep) -> some View {
        HStack(spacing: 10) {
            Button {
                openSet = row.slotId
                runner.tickSet(row.slotId)
            } label: {
                Image(systemName: "checkmark")
                    .font(.system(size: 13, weight: .heavy))
                    .foregroundStyle(.white)
                    .frame(width: 28, height: 28)
                    .background(Brand.coral, in: Circle())
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(!row.tickable)
            .accessibilityLabel("Un-tick set \(row.number)")
            Text(row.type == .normal ? "Set \(row.number)" : "Set \(row.number) · \(row.type.label)")
                .font(.body)
            Spacer(minLength: 8)
            if runner.records.contains(row.slotId) {
                Image(systemName: "medal.fill")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(Brand.coral)
                    .accessibilityLabel("New record")
                    .accessibilityIdentifier("set-record")
            }
            Text(setSummary(row, ex))
                .font(.body.weight(.semibold))
                .monospacedDigit()
        }
        .foregroundStyle(Brand.body)
        .padding(.horizontal, SetRowMetrics.inset)
    }

    /// The number in a set's count column: metres or calories on a distance or calorie set, the time
    /// a timed one ran once done (its plan before), else the reps.
    nonisolated static func countShown(_ row: SessionRunner.SetRow, _ ex: ExerciseStep) -> Double {
        switch ex.forMode {
        case .meters, .calories: row.amount ?? row.reps
        case .seconds, .minutes: row.seconds.map { ex.forMode == .minutes ? $0 / 60 : $0 } ?? row.plan
        default: row.reps
        }
    }

    /// What a set logged beyond its count (`ExerciseStep.extraLogs`); nil until entered.
    nonisolated static func loggedShown(_ row: SessionRunner.SetRow, _ log: StepLog) -> Double? {
        switch log {
        case .reps: row.counted
        case .meters: row.amounts[.meters]
        case .calories: row.amounts[.calories]
        }
    }

    /// The set table's columns after SET, as its header writes them. INCL shows when a set has an
    /// incline or the exercise is a treadmill, walk or run, so a bench never gets one.
    nonisolated static func setColumns(_ step: ExerciseStep, inclines: [Double?]) -> [String] {
        let treadmill = Library.shared.group(step.exercise.key).map { [.treadmill, .walk, .run].contains($0) } ?? false
        let incline = treadmill || inclines.contains { $0 != nil }
        let extra = step.extraLogs.map { $0 == .reps ? "Reps" : $0 == .meters ? "m" : "Cal" }
        return ((step.hasSetLoad ? [step.shortUnit] : []) + (incline ? ["Incl"] : []) + (step.countLabel.map { [$0] } ?? []) + extra)
            .map { $0.uppercased() }
    }

    /// A set counted in metres, reps or calories has −/+ on its count too, and three steppers and
    /// the tick overflow the row: there the row being set takes its incline on a line under it.
    nonisolated static func inclineWraps(_ step: ExerciseStep) -> Bool {
        step.countLabel != nil && step.forMode != .seconds && step.forMode != .minutes
    }

    /// With INCL in, a timed set's count is a short read-only number and gives the steppers its room.
    private static func countWidth(_ ex: ExerciseStep, incline: Bool) -> CGFloat {
        incline && !inclineWraps(ex) ? 32 : .infinity
    }

    private func setRow(_ row: SessionRunner.SetRow, _ ex: ExerciseStep, incline: Bool, last: SetResult?) -> some View {
        let hint = LastTime.setLabel(last)
        let editable = !row.done
        let wraps = incline && editable && Self.inclineWraps(ex)
        let inclineCell = SetInclineCell(incline: row.incline, number: row.number, editable: editable, onTint: row.current) {
            runner.nudgeSetIncline(row.slotId, $0)
        }.equatable()
        return VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: SetRowMetrics.spacing) {
                SetMarkButton(mark: row.mark, type: row.type, label: "Set \(row.number)", highlight: row.current && !row.done) {
                    runner.cycleSetType(row.slotId)
                }
                .frame(width: SetRowMetrics.number, alignment: .leading)
                if ex.hasSetLoad, Measure.of(ex.exercise.unit) == nil {
                    Group {
                        if editable {
                            MiniStepper(value: row.load ?? 0, label: "Set \(row.number) load", onTint: row.current, onTapValue: {
                                entry = NumberEntryRequest(title: "Set \(row.number) \(ex.settingLabel.lowercased())", unit: ex.shortUnit, current: row.load) { runner.setSetLoad(row.slotId, $0) }
                            }) { runner.nudgeSetLoad(row.slotId, $0) }
                        } else {
                            HStack(spacing: 2) {
                                Text(row.load.map(Format.number) ?? "—").scaledFont(18, weight: .bold, design: .rounded, relativeTo: .body).lineLimit(1).minimumScaleFactor(0.6)
                                if Plates.kit(ex.exercise) == .barbell { PlatesButton(load: row.load) }
                            }
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .overlay(alignment: .bottom) { if editable { unitCaption(ex.shortUnit) } }
                }
                if incline, !wraps { inclineCell.frame(width: SetInclineCell.width(ex)).overlay(alignment: .bottom) { if editable { unitCaption("incl %") } } }
                if let count = ex.countLabel {
                    // A distance or calorie set counts its metres or calories; a timed one shows the
                    // time it ran once done, and its plan before.
                    let clocked = ex.forMode == .seconds || ex.forMode == .minutes
                    let shown = Self.countShown(row, ex)
                    Group {
                        if editable, !clocked {
                            let amount = ex.forMode == .meters || ex.forMode == .calories
                            MiniStepper(value: shown, label: "Set \(row.number) \(count.lowercased())", onTint: row.current, onTapValue: {
                                entry = NumberEntryRequest(title: "Set \(row.number) \(count.lowercased())", unit: ex.forMode == .meters ? "m" : ex.forMode == .calories ? "cal" : "reps", current: shown) { v in
                                    if amount { runner.setSetAmount(row.slotId, v) } else { runner.setSetReps(row.slotId, v.rounded()) }
                                }
                            }) {
                                if amount { runner.nudgeSetAmount(row.slotId, $0) } else { runner.nudgeSetReps(row.slotId, $0) }
                            }
                        } else {
                            Text(Format.number((shown * 10).rounded() / 10)).scaledFont(18, weight: .bold, design: .rounded, relativeTo: .body).lineLimit(1).minimumScaleFactor(0.6)
                        }
                    }
                    .frame(maxWidth: Self.countWidth(ex, incline: incline))
                    .overlay(alignment: .bottom) { if editable { unitCaption(count.lowercased()) } }
                }
                ForEach(ex.extraLogs, id: \.self) { extra in
                    // What the step is set to log beyond its count, a column each: reps in a timed
                    // set, metres and calories on a timed row.
                    let unit = extra == .reps ? "reps" : extra == .meters ? "m" : "cal"
                    Group {
                        if editable {
                            MiniStepper(value: Self.loggedShown(row, extra) ?? 0, label: "Set \(row.number) \(extra.label.lowercased()) done", onTint: row.current, onTapValue: {
                                entry = NumberEntryRequest(title: "Set \(row.number) \(extra.label.lowercased()) done", unit: unit, current: Self.loggedShown(row, extra)) { v in
                                    if extra == .reps { runner.setSetReps(row.slotId, v.rounded()) } else { runner.setSetAmount(row.slotId, v, field: extra == .meters ? .meters : .calories) }
                                }
                            }) {
                                if extra == .reps { runner.nudgeSetCounted(row.slotId, $0) } else { runner.nudgeSetAmount(row.slotId, $0, field: extra == .meters ? .meters : .calories) }
                            }
                        } else {
                            Text(Self.loggedShown(row, extra).map(Format.number) ?? "—").scaledFont(18, weight: .bold, design: .rounded, relativeTo: .body).lineLimit(1).minimumScaleFactor(0.6)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .overlay(alignment: .bottom) { if editable { unitCaption("\(unit) done") } }
                }
                if runner.records.contains(row.slotId), row.done {
                    Image(systemName: "medal.fill")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(Brand.coral)
                        .accessibilityLabel("New record")
                        .accessibilityIdentifier("set-record")
                }
                Button {
                    if row.done { openSet = row.slotId } else if row.current { openSet = nil }
                    runner.tickSet(row.slotId)
                } label: {
                    Image(systemName: "checkmark")
                        .font(.system(size: 17, weight: .bold))
                        .frame(width: 44, height: 44)
                        .background(row.done ? Brand.coral : Color.clear, in: Circle())
                        .overlay(Circle().strokeBorder(row.done ? Brand.coral : Brand.line, lineWidth: 2))
                        .foregroundStyle(row.done ? .white : Brand.faint)
                }
                .buttonStyle(.plain)
                .disabled(!row.tickable)
                .opacity(row.tickable ? 1 : 0.35)
                .accessibilityLabel(row.done ? "Un-tick set \(row.number)" : "Tick set \(row.number)")
            }
            .monospacedDigit()
            .foregroundStyle(row.done ? Brand.muted : Brand.ink)
            // Room for the unit captions under the steppers.
            .padding(.bottom, editable ? 12 : 0)
            if wraps {
                HStack { Text("INCL").font(.caption.weight(.bold)).tracking(0.8).foregroundStyle(Brand.muted); inclineCell }
                    .padding(.leading, SetRowMetrics.number + SetRowMetrics.spacing)
            }
            if editable, let hint, let last {
                // Tap to copy last time's set into this row.
                Button {
                    openSet = row.slotId
                    runner.fill(row.slotId, with: SetResult(reps: ex.countLabel == nil && !ex.extraLogs.contains(.reps) ? nil : last.reps, load: ex.hasSetLoad ? last.load : nil, meters: ex.amountLogs.contains(.meters) ? last.meters : nil, calories: ex.amountLogs.contains(.calories) ? last.calories : nil))
                } label: {
                    Text(hint)
                        .font(.caption.weight(.semibold))
                        .underline(pattern: .dot)
                        .foregroundStyle(Brand.coralInk)
                        .frame(minHeight: 28)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .padding(.leading, SetRowMetrics.number + SetRowMetrics.spacing)
                .accessibilityLabel("Use last time for set \(row.number)")
            }
        }
        .padding(.horizontal, SetRowMetrics.inset)
        .padding(.vertical, 6)
        .background(row.current && !row.done ? Brand.coralSoft : Color.clear, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .contentShape(Rectangle())
        .onTapGesture { if !row.done { openSet = row.slotId } }
    }

    /// "kg", "reps" under a stepper's number, now the table has no header to name its columns.
    private func unitCaption(_ unit: String) -> some View {
        Text(unit)
            .font(.caption2)
            .foregroundStyle(Brand.muted)
            .offset(y: 12)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }

    private func restNudge(_ title: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.headline)
                .monospacedDigit()
                .frame(width: 64, height: 44)
                .background(Brand.Night.raised, in: Capsule())
                .foregroundStyle(Brand.Night.text)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    /// Minus or plus beside a number. Held, it repeats and speeds up; the action gets how many
    /// steps this press is worth.
    private func nudge(_ symbol: String, label: String, action: @escaping (Double) -> Void) -> some View {
        RepeatButton(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 18, weight: .bold))
                .frame(width: 56, height: 56)
                .background(Brand.coralSoft, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .foregroundStyle(Brand.coralInk)
        }
        .accessibilityLabel(label)
    }

    private var restCard: some View {
        VStack(spacing: 14) {
            Text("Rest").scaledFont(36, weight: .heavy, relativeTo: .largeTitle).foregroundStyle(Brand.Night.rest)
            if let next = runner.nextSlot?.exercise {
                HStack(spacing: 14) {
                    ExerciseThumb(ref: next.exercise, size: 64, radius: 16)
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Up next")
                            .font(.caption.weight(.bold)).textCase(.uppercase).tracking(0.8)
                            .foregroundStyle(Brand.Night.muted)
                        Text(next.exercise.name).font(.title3.weight(.bold)).foregroundStyle(Brand.Night.text)
                        Text(next.forLabel).font(.subheadline).foregroundStyle(Brand.Night.muted)
                    }
                    Spacer()
                }
                .padding(14)
                .background(Brand.Night.raised, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            }
        }
    }

    /// "UP NEXT  Leg press  60 kg × 10  ›": always on screen (Priyanka, 14 Nov 2026: she could not
    /// see what was coming). A tap opens everything still to come, block by block, set by set.
    @ViewBuilder
    private var upNextBar: some View {
        let next = runner.upNext
        Button { showRemaining = true } label: {
            HStack(spacing: 10) {
                Text("Up next")
                    .font(.caption.weight(.semibold)).textCase(.uppercase).tracking(0.8)
                    .foregroundStyle(Brand.Night.muted)
                Text(next?.name ?? "Finish")
                    .font(.body)
                    .foregroundStyle(Brand.Night.text)
                    .lineLimit(1)
                Spacer(minLength: 8)
                if let detail = next?.detail {
                    Text(detail)
                        .font(.body)
                        .monospacedDigit()
                        .foregroundStyle(Brand.Night.muted)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }
                Image(systemName: "chevron.up")
                    .font(.footnote.weight(.bold))
                    .foregroundStyle(Brand.Night.muted)
            }
            .padding(.horizontal, 22)
            .frame(minHeight: 40)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityHint("Shows everything still to come")
        .accessibilityIdentifier("next-up")
    }

    /// Every block and set still to do, in order, with its weight and reps as they stand now.
    private var remainingSheet: some View {
        let parts = SessionRunner.remaining(runner.state, runsheet: runner.runsheet)
        return NavigationStack {
            List {
                ForEach(parts) { part in
                    Section(part.name) {
                        ForEach(part.sets) { set in
                            HStack(spacing: 10) {
                                VStack(alignment: .leading, spacing: 2) {
                                    if part.sets.contains(where: { $0.name != part.name }) || part.name != set.name {
                                        Text(set.name).font(.body.weight(set.current ? .semibold : .regular)).foregroundStyle(Brand.ink)
                                    }
                                    Text(set.detail).font(.subheadline).monospacedDigit().foregroundStyle(Brand.body)
                                }
                                Spacer(minLength: 8)
                                if set.current {
                                    Text("Now").font(.caption.weight(.bold)).foregroundStyle(Brand.coralInk)
                                }
                            }
                        }
                    }
                }
                if parts.isEmpty {
                    Text("Nothing left: finish when you are ready.").foregroundStyle(Brand.muted)
                }
            }
            .navigationTitle("Still to come")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Close") { showRemaining = false }
                }
                ToolbarItem(placement: .cancellationAction) {
                    Button("Change") {
                        showRemaining = false
                        // One sheet after the other: presented while this one goes, it would not show.
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) { showOverview = true }
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .accessibilityIdentifier("remaining")
    }

    /// A number on the card that a tap lets you type: the keypad comes up with it as it is.
    private func typed<Label: View>(_ value: Double?, title: String, unit: String, set: @escaping (Double) -> Void, @ViewBuilder label: () -> Label) -> some View {
        Button {
            entry = NumberEntryRequest(title: title, unit: unit, current: value, apply: set)
        } label: {
            label().contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityHint("Type a number")
    }

    /// A countdown ends by itself: its big button is Pause. A set's says which set it logs.
    private var controls: some View {
        VStack(spacing: 10) {
            if runner.state.phase == .ready {
                HStack(spacing: 10) {
                    // A stray Done on the last station of the block before is taken back from here.
                    Button {
                        runner.back()
                    } label: {
                        Image(systemName: "backward.end.fill")
                    }
                    .buttonStyle(NightButtonStyle())
                    .frame(maxWidth: 72)
                    .accessibilityLabel("Previous step")

                    Button("Start \(runner.slot?.blockName ?? "block")") { runner.startBlock() }
                        .buttonStyle(BigButtonStyle())
                }
            } else {
                // EMOM reps run against the minute, but only Done moves them on: they keep "Set n of m done".
                let countdown = SessionRunner.countsDown(runner.state) || runner.state.phase == .lead
                HStack(spacing: 10) {
                    // Undoes a stray Done — on the Lock Screen too, where there is no way back.
                    Button {
                        runner.back()
                    } label: {
                        Image(systemName: "backward.end.fill")
                    }
                    .buttonStyle(NightButtonStyle())
                    .frame(maxWidth: 72)
                    .disabled(runner.state.i == 0 || runner.state.phase == .lead)
                    .accessibilityLabel("Previous step")

                    if !countdown {
                        pauseButton.buttonStyle(NightButtonStyle())
                    } else if runner.timedWork {
                        // Ends the countdown early and logs the time it ran.
                        Button("Done early") { runner.done() }
                            .buttonStyle(NightButtonStyle())
                    }

                    Button {
                        runner.skip()
                    } label: {
                        Label("Skip", systemImage: "forward.end.fill")
                    }
                    .buttonStyle(NightButtonStyle())
                    .accessibilityLabel(runner.state.phase == .lead ? "Skip" : isRest ? "Skip rest" : "Skip this step")
                    .accessibilityIdentifier("Skip")
                }
                if countdown {
                    pauseButton.buttonStyle(BigButtonStyle(tint: accent))
                } else {
                    Button(setDone) { if runner.roundCard != nil { runner.roundDone() } else { runner.done() } }
                        .buttonStyle(BigButtonStyle(tint: accent))
                        .accessibilityIdentifier("Done")
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
    }

    private var pauseButton: some View {
        Button(runner.state.phase == .paused ? "Resume" : "Pause", systemImage: runner.state.phase == .paused ? "play.fill" : "pause.fill") { runner.pauseOrResume() }
    }

    /// "Set 2 of 4 done". An amrap has no last round to count towards; a one-off step is just Done.
    private var setDone: String {
        guard let s = runner.slot, s.kind == .work, s.mode == .amrap || s.rounds > 1 else { return "Done" }
        if runner.roundCard != nil { return "Round \(s.round + 1) done" }
        return s.mode == .amrap ? "Set \(s.round + 1) done" : "Set \(s.round + 1) of \(s.rounds) done"
    }

    // MARK: - Overview

    /// The same editor as the workout screen. What is done or running is greyed and stays put;
    /// everything still to come can be changed or dragged — a block dragged up runs next.
    private var overview: some View {
        let used = Settings.lastUsed(store.results, workout: runner.runsheet)
        return NavigationStack {
            RunsheetEditor(
                runsheet: runner.runsheet,
                locked: runner.passedItems,
                current: runner.slot?.step.id,
                incline: { step in
                    Binding(
                        get: { runner.plannedIncline(step.id) ?? step.incline },
                        set: { if let v = $0 { runner.setStepIncline(step.id, v) } }
                    )
                },
                lastIncline: { step in used["step:\(step.id)"].flatMap { $0.exerciseKey == step.exercise.key ? $0.incline : nil } ?? used["ex:\(step.exercise.key)"]?.incline },
                summary: planned,
                onExercise: { e in
                    showOverview = false
                    editing = e
                },
                apply: { runner.edit($0) }
            ) {
                Section {
                    Text("Hold and drag to move what is still to come · tap to change")
                        .font(.footnote)
                        .foregroundStyle(Brand.faint)
                }
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
            }
            .navigationTitle("Session")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Close") { showOverview = false }
                }
            }
        }
    }

    private func planned(_ e: ExerciseStep) -> String {
        var parts = [e.forLabel]
        if let t = runner.plannedTarget(e.id), !e.shortUnit.isEmpty { parts.append("\(Format.number(t)) \(e.shortUnit)") }
        if let i = runner.plannedIncline(e.id) { parts.append("\(Format.number(i))% incline") }
        return parts.joined(separator: " · ")
    }

    // MARK: - Finished

    private var finished: some View {
        let result = runner.finalResult ?? runner.result()
        let startedAt = runner.state.startedAt
        let base = store.workout(id: runner.runsheet.key)
        let added = base.map { store.isMine($0) } == true ? runner.addedSets.values.reduce(0, +) : 0
        return FinishView(result: result, runsheet: runner.runsheet, onClose: onClose, onDiscard: {
            // The crash-safe copy goes too, or the next launch would log the session again.
            SessionRunner.clearSaved(startedAt: startedAt)
            Task { await store.discard(result) }
            onClose()
        }, addedSets: added, onUpdateWorkout: {
            guard let base else { return }
            let next = SessionRunner.withAddedSets(base, added: runner.addedSets, result: result)
            Task { await store.saveWorkout(next) }
            // The session ran the workout as it now is: no version to keep.
            store.amend(result.rowId) { $0.version = nil }
        })
    }
}

/// The timer's set row, sized for a 390 pt phone: 16 pt screen gutters, the card's 12 pt padding
/// and this inset leave 324 pt for the set mark (28 pt at its narrowest), two steppers (116 pt
/// each at full tap size) and the 44 pt tick.
private enum SetRowMetrics {
    static let number: CGFloat = 28
    static let spacing: CGFloat = 6
    static let inset: CGFloat = 5
}

/// A set row's incline: −/+ by 0.5 % on the row being set, the value alone on the others. Apart from
/// the row the clock rebuilds ten times a second; narrower than the load's stepper to fit 390 pt.
struct SetInclineCell: View, Equatable {
    static func width(_ step: ExerciseStep) -> CGFloat { TimerView.inclineWraps(step) ? 36 : 88 }

    let incline: Double?
    let number: Int
    let editable: Bool
    let onTint: Bool
    let nudge: (Double) -> Void

    static func == (a: Self, b: Self) -> Bool {
        a.incline == b.incline && a.number == b.number && a.editable == b.editable && a.onTint == b.onTint
    }

    var body: some View {
        // The tap targets are 44 pt wide and reach over the number between them: the cell stays
        // 88 pt, as wide as it was with 30 pt targets.
        HStack(spacing: editable ? -14 : 0) {
            if editable { button("minus", "less", edge: .leading) { nudge(-$0) } }
            Text(incline.map(Format.number) ?? "—").scaledFont(18, weight: .bold, design: .rounded, relativeTo: .body).lineLimit(1).minimumScaleFactor(0.5)
                .frame(width: 28).accessibilityLabel("Set \(number) incline").accessibilityValue(incline.map(Format.number) ?? "none")
            if editable { button("plus", "more", edge: .trailing) { nudge($0) } }
        }
    }

    private func button(_ symbol: String, _ word: String, edge: Alignment, action: @escaping (Double) -> Void) -> some View {
        RepeatButton(action: action) {
            Image(systemName: symbol).font(.system(size: 14, weight: .bold)).frame(width: 28, height: 38)
                .background(onTint ? Brand.surface : Brand.coralSoft, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(onTint ? Brand.brandLine : .clear))
                .foregroundStyle(Brand.coralInk).frame(width: 44, height: 44, alignment: edge).contentShape(Rectangle())
        }
        .accessibilityLabel("Set \(number) incline, \(word)")
    }
}

/// The set table's scroll state: which edges have more of the card behind them, and how tall the
/// window onto it is.
private struct RowsFade: Equatable {
    var top = false
    var bottom = false
    var window: CGFloat = 0
}

/// The ⋯ menu, apart from the top bar the clock redraws ten times a second: an open menu rebuilt
/// that often never settles, and a tap on Finish and save did nothing. Only the sound switch changes it.
private struct SessionMenu: View, Equatable {
    let sound: Bool
    let toggleSound: () -> Void
    let overview: () -> Void
    let finish: () -> Void
    let discard: () -> Void

    static func == (a: Self, b: Self) -> Bool { a.sound == b.sound }

    var body: some View {
        Menu {
            Button("Session overview", systemImage: "list.bullet", action: overview)
            Button(sound ? "Mute tones" : "Unmute tones", systemImage: sound ? "speaker.slash.fill" : "speaker.wave.2.fill", action: toggleSound)
            Divider()
            Button("Finish and save", action: finish)
            Button("Discard", role: .destructive, action: discard)
        } label: {
            Image(systemName: "ellipsis")
                .font(.system(size: 16, weight: .bold))
                .frame(width: 44, height: 44)
                .background(Brand.Night.raised, in: Circle())
        }
        .accessibilityLabel("Session menu")
    }
}

/// What the timer reads out of the history, kept per step until the history changes. Each lookup
/// sorts every session; made on every redraw, that was the whole history re-sorted several times a
/// second for a number that changes when a session is saved.
@MainActor
final class HistoryMemo {
    private var stamp: [String] = []
    private var kept: [String: Any] = [:]
    private(set) var made = 0

    /// The history as far as these lookups care: how many sessions, and which is first and last.
    static func stamp(_ results: [SessionResult]) -> [String] {
        ["\(results.count)", results.first?.id ?? "", results.last?.id ?? "", results.first?.startedAt ?? "", results.last?.startedAt ?? ""]
    }

    func value<T>(_ key: String, _ results: [SessionResult], _ make: () -> T) -> T {
        let now = Self.stamp(results)
        if now != stamp {
            stamp = now
            kept = [:]
        }
        if let hit = kept[key] as? Kept<T> { return hit.value }
        let value = make()
        made += 1
        kept[key] = Kept(value: value)
        return value
    }

    private struct Kept<T> { let value: T }
}

extension View {
    /// A design size in points that follows the phone's text size (Dynamic Type), up to `cap` times
    /// itself: at the default size it is the design size.
    func scaledFont(_ size: CGFloat, weight: Font.Weight = .bold, design: Font.Design = .default, relativeTo style: Font.TextStyle = .body, cap: CGFloat = 1.6) -> some View {
        modifier(ScaledFont(size: size, weight: weight, design: design, style: style, cap: cap))
    }
}

private struct ScaledFont: ViewModifier {
    @ScaledMetric private var scaled: CGFloat
    private let size: CGFloat
    private let weight: Font.Weight
    private let design: Font.Design
    private let cap: CGFloat

    init(size: CGFloat, weight: Font.Weight, design: Font.Design, style: Font.TextStyle, cap: CGFloat) {
        _scaled = ScaledMetric(wrappedValue: size, relativeTo: style)
        self.size = size
        self.weight = weight
        self.design = design
        self.cap = cap
    }

    func body(content: Content) -> some View {
        content.font(.system(size: min(scaled, size * cap), weight: weight, design: design))
    }
}
