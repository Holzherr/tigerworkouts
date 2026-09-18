import SwiftUI

struct TimerView: View {
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State var runner: SessionRunner
    var onSave: (SessionResult) -> Void

    @State private var showOverview = false
    @State private var editing: ExerciseStep?
    @State private var confirmQuit = false

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
        // Dark while it runs, as on the web: a white clock on slate reads across a bright gym.
        .preferredColorScheme(runner.isDone ? nil : .dark)
        .animation(.easeInOut(duration: 0.2), value: runner.slot?.id)
        .animation(.easeInOut(duration: 0.2), value: runner.state.phase)
        .onAppear { runner.begin() }
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
                onDrop: { runner.drop(stepId: step.id) }
            )
            .presentationDetents([.medium, .large])
            .preferredColorScheme(.light)
        }
        .confirmationDialog("End this session?", isPresented: $confirmQuit, titleVisibility: .visible) {
            Button("Finish and save", role: .destructive) { runner.finish() }
            Button("Keep going", role: .cancel) {}
        } message: {
            Text("What you have done so far is saved.")
        }
    }

    // MARK: - Running

    private var running: some View {
        VStack(spacing: 0) {
            topBar
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
                    Text(whereabouts)
                        .font(.subheadline)
                        .foregroundStyle(Brand.Night.muted)
                        .lineLimit(1)
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
                Button { showOverview = true } label: {
                    Image(systemName: "list.bullet")
                        .font(.system(size: 16, weight: .bold))
                        .frame(width: 44, height: 44)
                        .background(Brand.Night.raised, in: Circle())
                }
                .accessibilityLabel("Session overview")
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
        if slot.rounds > 1 { parts.append("Round \(slot.round + 1) of \(slot.rounds)") }
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
        }
        .padding(.horizontal, 16)
    }

    private var slotBody: some View {
        VStack(spacing: 16) {
            countdown
            if isRest {
                restCard
            } else if let ex = runner.slot?.exercise {
                exerciseCard(ex, eyebrow: runner.stepPosition.map { "Exercise \($0.index) of \($0.count)" }, adjustable: true)
            }
            if let next = runner.nextSlot, !isRest {
                nextCard(next)
            }
        }
        .padding(.horizontal, 16)
    }

    private var countdown: some View {
        VStack(spacing: 2) {
            if let left = runner.clock.left {
                Text(Format.clock(left))
                    .font(.system(size: 110, weight: .heavy, design: .rounded))
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
                }
            } else {
                Text(Format.clock(runner.clock.spent))
                    .font(.system(size: 110, weight: .heavy, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(Brand.Night.text)
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
                Text("Tap Done when you finish the set").font(.subheadline).foregroundStyle(Brand.Night.muted)
            }
        }
    }

    /// The exercise as a card you can read from a bench: the demo, the name, the cue, and the one
    /// number worth changing without opening anything — the weight in your hand.
    private func exerciseCard(_ ex: ExerciseStep, eyebrow: String?, adjustable: Bool) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Button { editing = ex } label: {
                HStack(alignment: .top, spacing: 14) {
                    ExerciseDemo(ref: ex.exercise, size: 104)
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

            if adjustable, ex.hasSetting {
                Divider()
                HStack(spacing: 10) {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(ex.settingLabel).font(.subheadline.weight(.semibold)).foregroundStyle(Brand.body)
                        if let incline = runner.incline, runner.slot?.exercise?.id == ex.id {
                            Text("\(Format.number(incline))% incline").font(.caption).foregroundStyle(Brand.muted)
                        }
                    }
                    Spacer()
                    nudge("minus", label: "Less") { runner.nudgeTarget(-1) }
                    VStack(spacing: 0) {
                        Text((runner.slot?.exercise?.id == ex.id ? runner.target : runner.plannedTarget(ex.id) ?? ex.target).map(Format.number) ?? "—")
                            .font(.system(size: 26, weight: .bold, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(Brand.ink)
                        Text(ex.shortUnit).font(.caption2).foregroundStyle(Brand.muted)
                    }
                    .frame(minWidth: 64)
                    nudge("plus", label: "More") { runner.nudgeTarget(1) }
                }
                .disabled(runner.slot?.exercise?.id != ex.id)
            }
        }
        .padding(16)
        .background(.white, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        // White card on the dark timer: its ink has to be the light-appearance ink.
        .environment(\.colorScheme, .light)
    }

    private func detail(_ ex: ExerciseStep) -> String {
        let cue = ex.exercise.cue ?? Library.shared.exercise(ex.exercise.key)?.cue ?? ""
        return cue.isEmpty ? ex.forLabel : "\(ex.forLabel) · \(cue)"
    }

    private func nudge(_ symbol: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
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
                Button("Start \(runner.slot?.blockName ?? "block")") { runner.startBlock() }
                    .buttonStyle(BigButtonStyle())
            } else {
                HStack(spacing: 10) {
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
                Button("Done") { runner.done() }
                    .buttonStyle(BigButtonStyle(tint: accent))
            }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
    }

    // MARK: - Overview

    private var overview: some View {
        NavigationStack {
            List {
                ForEach(Array(runner.runsheet.items.enumerated()), id: \.offset) { _, item in
                    switch item {
                    case .block(let b):
                        Section(b.name) {
                            ForEach(b.steps) { step in overviewRow(step) }
                        }
                    case .step(let step):
                        Section { overviewRow(step) }
                    case .ref:
                        EmptyView()
                    }
                }
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

    @ViewBuilder
    private func overviewRow(_ step: Step) -> some View {
        switch step {
        case .rest(let r):
            Label("Rest \(Format.clock(r.seconds))", systemImage: "pause.circle").foregroundStyle(Brand.rest)
        case .exercise(let e):
            Button {
                showOverview = false
                editing = e
            } label: {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(e.exercise.name).foregroundStyle(Brand.ink)
                        Text(planned(e)).font(.footnote).foregroundStyle(Brand.muted)
                    }
                    Spacer()
                    if e.id == runner.slot?.step.id {
                        Text("now").font(.caption.weight(.bold)).foregroundStyle(Brand.coral)
                    }
                    Image(systemName: "slider.horizontal.3").foregroundStyle(Brand.muted)
                }
                .frame(minHeight: Tap.regular)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
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
        let result = runner.result()
        return ScrollView {
            VStack(spacing: 20) {
                VStack(spacing: 6) {
                    Stripes().frame(width: 34, height: 28)
                    Text("Workout saved").font(.largeTitle.weight(.bold))
                    Text(runner.runsheet.title).font(.headline).foregroundStyle(Brand.muted)
                }
                .padding(.top, 24)

                SessionStatsView(result: result, runsheet: runner.runsheet, history: store.results, bodyweightKg: store.bodyweightKg)

                Button("Done") { onSave(result) }
                    .buttonStyle(BigButtonStyle())
            }
            .padding(16)
        }
        .background(Brand.canvas)
    }
}
