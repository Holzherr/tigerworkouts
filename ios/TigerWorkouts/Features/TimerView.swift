import SwiftUI

struct TimerView: View {
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State var runner: SessionRunner
    var onSave: (SessionResult) -> Void

    @State private var showOverview = false
    @State private var editing: ExerciseStep?
    /// Opens tall: the alternatives sit under the steppers, and a half sheet hides them.
    @State private var sheetDetent: PresentationDetent = .large
    @State private var confirmQuit = false

    private var isRest: Bool { runner.slot?.kind == .rest }
    private var accent: Color { isRest ? Brand.rest : Brand.coral }

    var body: some View {
        ZStack {
            (isRest ? Brand.rest.opacity(0.06) : Color(.systemBackground)).ignoresSafeArea()
            if runner.isDone {
                finished
            } else {
                running
            }
        }
        .animation(.easeInOut(duration: 0.2), value: runner.slot?.id)
        .animation(.easeInOut(duration: 0.2), value: runner.state.phase)
        .onAppear { runner.begin() }
        .onDisappear { runner.end() }
        .sheet(isPresented: $showOverview) { overview }
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
            Spacer(minLength: 8)
            if runner.state.phase == .lead {
                leadIn
            } else {
                slotBody
            }
            Spacer(minLength: 8)
            blockStrip
            controls
        }
    }

    private var topBar: some View {
        HStack(alignment: .firstTextBaseline) {
            Button { confirmQuit = true } label: {
                Image(systemName: "xmark").font(.system(size: 17, weight: .semibold)).frame(width: 44, height: 44)
            }
            .accessibilityLabel("End session")

            VStack(spacing: 2) {
                Text(runner.slot?.blockName ?? runner.runsheet.title)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)
                // The whole-session clock, always somewhere, always smaller than the countdown.
                Text("\(Format.clock(runner.elapsed)) elapsed")
                    .font(.caption)
                    .foregroundStyle(Brand.muted)
                    .monospacedDigit()
            }
            .frame(maxWidth: .infinity)

            Button { showOverview = true } label: {
                Image(systemName: "list.bullet").font(.system(size: 17, weight: .semibold)).frame(width: 44, height: 44)
            }
            .accessibilityLabel("Session overview")
        }
        .padding(.horizontal, 8)
        .overlay(alignment: .bottom) {
            ProgressView(value: runner.overall)
                .tint(accent)
                .scaleEffect(x: 1, y: 0.6, anchor: .center)
        }
    }

    private var leadIn: some View {
        VStack(spacing: 12) {
            Text("Get ready").font(.title3.weight(.semibold)).foregroundStyle(Brand.muted)
            Text(Format.clock(runner.clock.left ?? 0))
                .font(.system(size: 96, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(Brand.coral)
            if let next = runner.slot?.exercise {
                Text("First up: \(next.exercise.name)").font(.headline).foregroundStyle(Brand.body)
            }
        }
    }

    @ViewBuilder
    private var slotBody: some View {
        VStack(spacing: 14) {
            if let position = runner.stepPosition {
                Text("Exercise \(position.index) of \(position.count)")
                    .font(.caption.weight(.semibold))
                    .textCase(.uppercase)
                    .tracking(0.8)
                    .foregroundStyle(Brand.muted)
            } else if let slot = runner.slot, slot.rounds > 1 {
                Text("Round \(slot.round + 1) of \(slot.rounds)")
                    .font(.caption.weight(.semibold))
                    .textCase(.uppercase)
                    .tracking(0.8)
                    .foregroundStyle(Brand.muted)
            }

            if isRest {
                Text("Rest").font(.system(size: 40, weight: .bold)).foregroundStyle(Brand.rest)
                if let next = runner.nextSlot?.exercise {
                    Text("Next: \(next.exercise.name)").font(.title3).foregroundStyle(Brand.body)
                }
            } else if let ex = runner.slot?.exercise {
                // Readable from a bench, at arm's length, out of breath.
                Button { editing = ex } label: {
                    VStack(spacing: 6) {
                        Text(ex.exercise.name)
                            .font(.system(size: 34, weight: .bold))
                            .multilineTextAlignment(.center)
                            .minimumScaleFactor(0.6)
                            .lineLimit(2)
                            .foregroundStyle(Brand.ink)
                        Text(ex.forLabel).font(.title3).foregroundStyle(Brand.muted)
                    }
                    .frame(maxWidth: .infinity)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }

            countdown

            if !isRest, let ex = runner.slot?.exercise, ex.hasSetting {
                inlineNudge(ex)
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
        .padding(.horizontal, 20)
    }

    /// The treadmill's other dial, under the speed. Nil for anything without one, so a bench has
    /// no incline line; a treadmill step with none yet set gets a line that opens the sheet.
    nonisolated static func inclineLabel(_ incline: Double?, for step: ExerciseStep) -> String? {
        let treadmill = Library.shared.group(step.exercise.key).map { [.treadmill, .walk, .run].contains($0) } ?? false
        guard incline != nil || step.incline != nil || treadmill else { return nil }
        return incline.map { "\(Format.number($0))% incline" } ?? "Set incline"
    }

    private var countdown: some View {
        VStack(spacing: 4) {
            if let left = runner.clock.left {
                Text(Format.clock(left))
                    .font(.system(size: 104, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(left <= 3 ? Brand.coral : (isRest ? Brand.rest : Brand.ink))
                    .contentTransition(.numericText(countsDown: true))
                // Both figures: how far into this step, and how long the step is. A 10-minute
                // walk should read as a 10-minute walk, not only as a number falling.
                if let total = runner.slot?.seconds {
                    Text("\(Format.clock(runner.clock.spent)) of \(Format.clock(total))")
                        .font(.footnote)
                        .foregroundStyle(Brand.muted)
                        .monospacedDigit()
                }
            } else {
                Text(Format.clock(runner.clock.spent))
                    .font(.system(size: 104, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(Brand.ink)
                Text("Tap Done when you finish the set").font(.footnote).foregroundStyle(Brand.muted)
            }
        }
    }

    /// The one adjustment worth making without opening anything: the weight in your hand.
    private func inlineNudge(_ ex: ExerciseStep) -> some View {
        HStack(spacing: 12) {
            Button { runner.nudgeTarget(-1) } label: {
                Image(systemName: "minus").font(.system(size: 18, weight: .bold)).frame(width: 56, height: 56)
            }
            .background(Brand.coralSoft, in: RoundedRectangle(cornerRadius: 14))
            .foregroundStyle(Brand.coralInk)

            Button { editing = ex } label: {
                VStack(spacing: 0) {
                    Text(runner.target.map(Format.number) ?? "—")
                        .font(.system(size: 28, weight: .semibold, design: .rounded))
                        .monospacedDigit()
                    Text(ex.shortUnit).font(.caption2).foregroundStyle(Brand.muted)
                }
                .frame(minWidth: 96, minHeight: 56)
            }
            .buttonStyle(.plain)

            Button { runner.nudgeTarget(1) } label: {
                Image(systemName: "plus").font(.system(size: 18, weight: .bold)).frame(width: 56, height: 56)
            }
            .background(Brand.coralSoft, in: RoundedRectangle(cornerRadius: 14))
            .foregroundStyle(Brand.coralInk)
        }
    }

    /// Where you are inside the block, at a glance — the live exercise filled in.
    @ViewBuilder
    private var blockStrip: some View {
        let steps = runner.blockSteps
        if steps.count > 1 {
            ScrollView(.horizontal) {
                HStack(spacing: 8) {
                    ForEach(steps) { s in
                        let live = s.id == runner.slot?.step.id
                        Button { editing = s } label: {
                            Text(s.exercise.name)
                                .font(.footnote.weight(live ? .semibold : .regular))
                                .lineLimit(1)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 9)
                                .background(live ? Brand.coral : Brand.coralSoft, in: Capsule())
                                .foregroundStyle(live ? .white : Brand.coralInk)
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
                    .buttonStyle(BigButtonStyle(tint: Brand.ink, filled: false))

                    Button {
                        runner.skip()
                    } label: {
                        Label("Skip", systemImage: "forward.fill")
                    }
                    .buttonStyle(BigButtonStyle(tint: Brand.muted, filled: false))
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
