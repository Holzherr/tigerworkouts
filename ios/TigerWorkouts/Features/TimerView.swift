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
    /// The set row open for editing on a straight-set block; nil = the set you are on.
    @State private var openSet: String?

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
        .onChange(of: runner.slot?.id) { openSet = nil }
        .onDisappear { runner.end() }
        .sheet(isPresented: $showOverview) { overview.preferredColorScheme(.light) }
        .sheet(item: $editing) { step in
            ExerciseSheet(
                step: step,
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
    }

    /// Out of the session with nothing kept: the crash-safe copy goes, and nothing reached the
    /// store or Health, which only hear about a session once it finishes.
    private func discard() {
        runner.discard()
        onClose()
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
            blockStrip
            controls
        }
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
                Button {
                    sound.toggle()
                    Cues.shared.enabled = sound
                } label: {
                    Image(systemName: sound ? "speaker.wave.2.fill" : "speaker.slash.fill")
                        .font(.system(size: 16, weight: .bold))
                        .frame(width: 44, height: 44)
                        .background(Brand.Night.raised, in: Circle())
                }
                .accessibilityLabel(sound ? "Mute tones" : "Unmute tones")
                Button { showOverview = true } label: {
                    Image(systemName: "list.bullet")
                        .font(.system(size: 16, weight: .bold))
                        .frame(width: 44, height: 44)
                        .background(Brand.Night.raised, in: Circle())
                }
                .accessibilityLabel("Session overview")
            }
            if let ghost = runner.ghost {
                // Racing the last session of this workout: one signed number, at the latest round or set.
                Text(ghost.text)
                    .font(.subheadline.weight(.bold))
                    .monospacedDigit()
                    .padding(.horizontal, 12)
                    .frame(height: 28)
                    .background(Brand.Night.raised, in: Capsule())
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityLabel("Against last time: \(ghost.text)")
                    .accessibilityIdentifier("ghost")
            }
            if let target = runner.goal, runner.state.phase != .done {
                // Today's target for this round or set, quieter than the race.
                Text(target)
                    .font(.footnote.weight(.semibold))
                    .monospacedDigit()
                    .foregroundStyle(Brand.Night.muted)
                    .padding(.horizontal, 12)
                    .frame(height: 24)
                    .overlay(Capsule().strokeBorder(Brand.Night.line))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityIdentifier("target")
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Brand.Night.line)
                    Capsule().fill(Brand.coral).frame(width: max(8, geo.size.width * runner.overall))
                }
            }
            .frame(height: 6)
        }
        .foregroundStyle(Brand.Night.text)
        .padding(.horizontal, 16)
        .padding(.top, 6)
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
                .font(.system(size: 110, weight: .heavy, design: .rounded))
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
                .font(.system(size: 34, weight: .heavy))
                .multilineTextAlignment(.center)
                .foregroundStyle(Brand.Night.text)
            if let first = runner.slot?.exercise {
                exerciseCard(first, eyebrow: "First up", adjustable: true)
            }
            if !isRest, let ex = runner.slot?.exercise, let label = TimerView.inclineLabel(runner.incline, for: ex) {
                Button { editing = ex } label: {
                    Text(label)
                        .font(.title3)
                        .foregroundStyle(Brand.muted)
                        .frame(minHeight: Tap.regular)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 16)
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
                ScrollView {
                    setGrid(straight)
                }
                .scrollBounceBehavior(.basedOnSize)
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
            circuitBody(clock: 110, demo: 104, spacing: 16)
            circuitBody(clock: 84, demo: 80, spacing: 12)
            circuitBody(clock: 64, demo: 64, spacing: 10)
        }
    }

    private func circuitBody(clock: CGFloat, demo: CGFloat, spacing: CGFloat) -> some View {
        VStack(spacing: spacing) {
            countdown(size: clock)
            if isRest {
                restCard
            } else if let ex = runner.slot?.exercise {
                exerciseCard(ex, eyebrow: runner.stepPosition.map { "Exercise \($0.index) of \($0.count)" }, adjustable: true, demo: demo)
            }
            if let next = runner.nextSlot, !isRest {
                nextCard(next)
            }
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

    private func countdown(size: CGFloat) -> some View {
        VStack(spacing: 2) {
            if let left = runner.clock.left {
                Text(Format.clock(left))
                    .font(.system(size: size, weight: .heavy, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(left <= 3 ? Brand.coral : (isRest ? Brand.Night.rest : Brand.Night.text))
                    .contentTransition(.numericText(countsDown: true))
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
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
                    Text("Tap Done when you finish the set")
                        .font(.subheadline)
                        .foregroundStyle(Brand.Night.muted)
                }
                if runner.restAdjustable {
                    HStack(spacing: 10) {
                        restNudge("−15 s", label: "15 seconds less rest") { runner.extendRest(by: -15); Haptics.shared.play(.tick) }
                        restNudge("+15 s", label: "15 seconds more rest") { runner.extendRest(by: 15); Haptics.shared.play(.tick) }
                    }
                    .padding(.top, 8)
                }
            } else {
                Text(Format.clock(runner.clock.spent))
                    .font(.system(size: size, weight: .heavy, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(Brand.Night.text)
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
                Text(runner.straightSetStep == nil ? "Tap Done when you finish the set" : "Tick the set when you finish it")
                    .font(.subheadline).foregroundStyle(Brand.Night.muted)
            }
        }
    }

    /// The exercise as a card you can read from a bench: the demo, the name, the cue, and the one
    /// number worth changing without opening anything — the weight in your hand.
    private func exerciseCard(_ ex: ExerciseStep, eyebrow: String?, adjustable: Bool, demo: CGFloat = 104) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Button { editing = ex } label: {
                HStack(alignment: .top, spacing: 14) {
                    ExerciseDemo(ref: ex.exercise, size: demo)
                    VStack(alignment: .leading, spacing: 5) {
                        if let eyebrow {
                            Text(eyebrow)
                                .font(.caption.weight(.bold))
                                .textCase(.uppercase)
                                .tracking(0.8)
                                .foregroundStyle(Brand.coralInk)
                        }
                        Text(ex.exercise.name)
                            .font(.system(size: 24, weight: .heavy))
                            .foregroundStyle(Brand.ink)
                            .lineLimit(2)
                            .minimumScaleFactor(0.7)
                        Text(detail(ex))
                            .font(.subheadline)
                            .foregroundStyle(Brand.muted)
                            .lineLimit(3)
                    }
                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if let set = LastTime.set(store.results, for: ex), let last = LastTime.label(set, for: ex) {
                let text = last.prefix(1).uppercased() + last.dropFirst()
                // On the running set, a tap puts last time's weight and reps in.
                if adjustable, let slot = runner.slot, slot.exercise?.id == ex.id, runner.state.phase == .running || runner.state.phase == .paused {
                    Button { runner.fill(slot.id, with: SetResult(reps: runner.countsReps ? set.reps : nil, load: ex.hasSetting ? set.load : nil)) } label: {
                        Text(text)
                            .font(.subheadline.weight(.semibold))
                            .underline(pattern: .dot)
                            .foregroundStyle(Brand.coralInk)
                            .frame(minHeight: 32)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .padding(.leading, demo + 14)
                    .padding(.top, -10)
                    .accessibilityLabel("Use last time")
                    .accessibilityValue(last)
                    .accessibilityIdentifier("use-last-time")
                } else {
                    Text(text)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Brand.coralInk)
                        .padding(.leading, demo + 14)
                        .padding(.top, -10)
                }
            }

            if adjustable, ex.hasSetting, Measure.of(ex.exercise.unit) == nil {
                Divider()
                HStack(spacing: 10) {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(ex.settingLabel).font(.subheadline.weight(.semibold)).foregroundStyle(Brand.body)
                        if let incline = runner.incline, runner.slot?.exercise?.id == ex.id {
                            Text("\(Format.number(incline))% incline").font(.caption).foregroundStyle(Brand.muted)
                        }
                    }
                    Spacer()
                    if Plates.kit(ex.exercise) == .barbell {
                        PlatesButton(load: runner.slot?.exercise?.id == ex.id ? runner.target : runner.plannedTarget(ex.id) ?? ex.target)
                    }
                    nudge("minus", label: "Less") { runner.nudgeTarget(-$0) }
                    VStack(spacing: 0) {
                        Text((runner.slot?.exercise?.id == ex.id ? runner.target : runner.plannedTarget(ex.id) ?? ex.target).map(Format.number) ?? "—")
                            .font(.system(size: 26, weight: .bold, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(Brand.ink)
                        Text(ex.shortUnit).font(.caption2).foregroundStyle(Brand.muted)
                    }
                    .frame(minWidth: 64)
                    nudge("plus", label: "More") { runner.nudgeTarget($0) }
                }
                .disabled(runner.slot?.exercise?.id != ex.id)
            }

            // Metres rowed or calories on the counter, when not what the plan said.
            if adjustable, runner.slot?.exercise?.id == ex.id, let field = runner.amountField {
                Divider()
                HStack(spacing: 10) {
                    Text(field == .meters ? "Metres done" : "Calories done").font(.subheadline.weight(.semibold)).foregroundStyle(Brand.body)
                    Spacer()
                    nudge("minus", label: field == .meters ? "Fewer metres" : "Fewer calories") { runner.nudgeAmount(-$0) }
                    Text(runner.amount.map(Format.number) ?? "—")
                        .font(.system(size: 26, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(Brand.ink)
                        .frame(minWidth: 64)
                        .accessibilityIdentifier("amount-done")
                    nudge("plus", label: field == .meters ? "More metres" : "More calories") { runner.nudgeAmount($0) }
                }
            }

            // What you did, not what the plan said: without this every rep in History was the
            // planned rep.
            if adjustable, runner.slot?.exercise?.id == ex.id, runner.countsReps {
                Divider()
                HStack(spacing: 10) {
                    Text("Reps done").font(.subheadline.weight(.semibold)).foregroundStyle(Brand.body)
                    Spacer()
                    nudge("minus", label: "Fewer reps") { runner.nudgeReps(-$0) }
                    Text(runner.reps.map(Format.number) ?? "—")
                        .font(.system(size: 26, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(Brand.ink)
                        .frame(minWidth: 64)
                        .accessibilityIdentifier("reps-done")
                    nudge("plus", label: "More reps") { runner.nudgeReps($0) }
                }
            }
        }
        .padding(16)
        .background(.white, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        // White card on the dark timer: its ink has to be the light-appearance ink.
        .environment(\.colorScheme, .light)
    }

    /// A straight-set block as the gym writes it: a row per set, load and reps filled in from the
    /// plan, the set you are on highlighted, a tick to finish it. A done row shows what was done and
    /// is locked until it is un-ticked (tap the tick again), so a weight is never changed by a stray
    /// tap on a set already logged.
    private func setGrid(_ ex: ExerciseStep) -> some View {
        let rows = runner.setRows
        let last = LastTime.sets(store.results, for: ex) ?? []
        return VStack(alignment: .leading, spacing: 10) {
            Button { editing = ex } label: {
                HStack(spacing: 12) {
                    ExerciseDemo(ref: ex.exercise, size: 64)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(ex.exercise.name)
                            .font(.system(size: 22, weight: .heavy))
                            .foregroundStyle(Brand.ink)
                            .lineLimit(2)
                            .minimumScaleFactor(0.7)
                        let cue = ex.exercise.cue ?? Library.shared.exercise(ex.exercise.key)?.cue ?? ""
                        if !cue.isEmpty {
                            Text(cue).font(.footnote).foregroundStyle(Brand.muted).lineLimit(2)
                        }
                    }
                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            HStack(spacing: SetRowMetrics.spacing) {
                Text("Set").frame(width: SetRowMetrics.number, alignment: .leading)
                if ex.hasSetLoad { Text(ex.shortUnit).frame(maxWidth: .infinity) }
                if let count = ex.countLabel { Text(count).frame(maxWidth: .infinity) }
                Color.clear.frame(width: 44, height: 1)
            }
            .padding(.horizontal, SetRowMetrics.inset)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
            .font(.caption.weight(.bold))
            .textCase(.uppercase)
            .tracking(0.8)
            .foregroundStyle(Brand.muted)

            ForEach(rows) { row in
                setRow(row, ex, last: last.indices.contains(row.number - 1) && (last[row.number - 1].type ?? .normal) == row.type ? last[row.number - 1] : nil)
            }
        }
        .padding(12)
        .background(.white, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .environment(\.colorScheme, .light)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("timer-set-grid")
    }

    private func setRow(_ row: SessionRunner.SetRow, _ ex: ExerciseStep, last: SetResult?) -> some View {
        let hint = LastTime.setLabel(last)
        let editable = !row.done && (openSet == row.slotId || (openSet == nil && row.current))
        return VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: SetRowMetrics.spacing) {
                SetMarkButton(mark: row.mark, type: row.type, label: "Set \(row.number)", highlight: row.current && !row.done) {
                    runner.cycleSetType(row.slotId)
                }
                .frame(width: SetRowMetrics.number, alignment: .leading)
                if ex.hasSetLoad, Measure.of(ex.exercise.unit) == nil {
                    Group {
                        if editable {
                            MiniStepper(value: row.load ?? 0, label: "Set \(row.number) load", onTint: row.current) { runner.nudgeSetLoad(row.slotId, $0) }
                        } else {
                            HStack(spacing: 2) {
                                Text(row.load.map(Format.number) ?? "—").font(.system(size: 18, weight: .bold, design: .rounded)).lineLimit(1).minimumScaleFactor(0.6)
                                if Plates.kit(ex.exercise) == .barbell { PlatesButton(load: row.load) }
                            }
                        }
                    }
                    .frame(maxWidth: .infinity)
                }
                if let count = ex.countLabel {
                    // A distance or calorie set counts its metres or calories; a timed one shows the
                    // time it ran once done, and its plan before.
                    let clocked = ex.forMode == .seconds || ex.forMode == .minutes
                    let shown = row.amount ?? (clocked ? row.seconds.map { ex.forMode == .minutes ? $0 / 60 : $0 } ?? row.reps : row.reps)
                    Group {
                        if editable, !clocked {
                            MiniStepper(value: shown, label: "Set \(row.number) \(count.lowercased())", onTint: row.current) {
                                if row.amount != nil { runner.nudgeSetAmount(row.slotId, $0) } else { runner.nudgeSetReps(row.slotId, $0) }
                            }
                        } else {
                            Text(Format.number((shown * 10).rounded() / 10)).font(.system(size: 18, weight: .bold, design: .rounded)).lineLimit(1).minimumScaleFactor(0.6)
                        }
                    }
                    .frame(maxWidth: .infinity)
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
            if let hint, let last, !row.done {
                // Tap to copy last time's set into this row.
                Button {
                    openSet = row.slotId
                    runner.fill(row.slotId, with: SetResult(reps: ex.countLabel == nil ? nil : last.reps, load: ex.hasSetLoad ? last.load : nil))
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
            } else if let hint {
                Text(hint).font(.caption).foregroundStyle(Brand.muted).padding(.leading, SetRowMetrics.number + SetRowMetrics.spacing)
            }
        }
        .padding(.horizontal, SetRowMetrics.inset)
        .padding(.vertical, 6)
        .background(row.current && !row.done ? Brand.coralSoft : Color.clear, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .contentShape(Rectangle())
        .onTapGesture { if !row.done { openSet = row.slotId } }
    }

    private func detail(_ ex: ExerciseStep) -> String {
        let cue = ex.exercise.cue ?? Library.shared.exercise(ex.exercise.key)?.cue ?? ""
        return cue.isEmpty ? ex.forLabel : "\(ex.forLabel) · \(cue)"
    }

    private func restNudge(_ title: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.headline)
                .monospacedDigit()
                .frame(width: 88, height: 48)
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
            Text("Rest").font(.system(size: 36, weight: .heavy)).foregroundStyle(Brand.Night.rest)
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

    private func nextCard(_ next: Slot) -> some View {
        HStack(spacing: 14) {
            if let ex = next.exercise {
                ExerciseThumb(ref: ex.exercise, size: 48)
            } else {
                Image(systemName: "pause.fill")
                    .font(.system(size: 16, weight: .bold))
                    .frame(width: 48, height: 48)
                    .background(Brand.Night.line, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .foregroundStyle(Brand.Night.rest)
            }
            VStack(alignment: .leading, spacing: 1) {
                Text("Next")
                    .font(.caption.weight(.bold)).textCase(.uppercase).tracking(0.8)
                    .foregroundStyle(Brand.Night.muted)
                Text(next.exercise?.exercise.name ?? "Rest").font(.headline).foregroundStyle(Brand.Night.text)
            }
            Spacer()
            Text(next.exercise?.forLabel ?? Format.clock(next.seconds ?? 0))
                .font(.subheadline.weight(.semibold))
                .monospacedDigit()
                .foregroundStyle(Brand.Night.muted)
        }
        .padding(12)
        .background(Brand.Night.raised, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    /// Where you are inside the block, at a glance — the live exercise filled in.
    @ViewBuilder
    private var blockStrip: some View {
        let steps = runner.blockSteps
        if steps.count > 1, runner.state.phase != .lead {
            ScrollView(.horizontal) {
                HStack(spacing: 8) {
                    ForEach(steps) { s in
                        let live = s.id == runner.slot?.step.id
                        Button { editing = s } label: {
                            Text(s.exercise.name)
                                .font(.footnote.weight(live ? .bold : .medium))
                                .lineLimit(1)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 9)
                                .background(live ? Brand.coral : Brand.Night.raised, in: Capsule())
                                .foregroundStyle(live ? .white : Brand.Night.muted)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 16)
            }
            .scrollIndicators(.hidden)
            .padding(.bottom, 10)
        }
    }

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

                    Button {
                        runner.pauseOrResume()
                    } label: {
                        Label(runner.state.phase == .paused ? "Resume" : "Pause", systemImage: runner.state.phase == .paused ? "play.fill" : "pause.fill")
                    }
                    .buttonStyle(NightButtonStyle())

                    Button {
                        runner.skip()
                    } label: {
                        Label("Skip", systemImage: "forward.end.fill")
                    }
                    .buttonStyle(NightButtonStyle())
                }
                // On a countdown, Done ends it early and logs the time it ran.
                Button(runner.timedWork ? "Done early" : "Done") { runner.done() }
                    .buttonStyle(BigButtonStyle(tint: accent))
            }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
    }

    // MARK: - Overview

    /// The same editor as the workout screen. What is done or running is greyed and stays put;
    /// everything still to come can be changed or dragged — a block dragged up runs next.
    private var overview: some View {
        NavigationStack {
            RunsheetEditor(
                runsheet: runner.runsheet,
                locked: runner.passedItems,
                current: runner.slot?.step.id,
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
        return FinishView(result: result, runsheet: runner.runsheet, onClose: onClose) {
            // The crash-safe copy goes too, or the next launch would log the session again.
            SessionRunner.clearSaved(startedAt: startedAt)
            Task { await store.discard(result) }
            onClose()
        }
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
