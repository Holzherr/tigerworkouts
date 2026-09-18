import Observation
import SwiftUI

/// Drives the pure engine: the tick, the haptics, the tones, the wake lock and the crash-safe
/// copy on disk. Everything that decides *what happens next* lives in `Runner`; this decides
/// *when*, and what you feel when it does.
@MainActor
@Observable
final class SessionRunner {
    private(set) var state: RunState
    private(set) var now: Double = Date().timeIntervalSince1970 * 1000
    let runsheet: Runsheet

    private var timer: Timer?
    private var cuedSlot: String?
    private var cuedPhase: Phase?
    private var lastTick: Int?

    init(runsheet: Runsheet, history: [SessionResult] = []) {
        // Start on the numbers you finished on last time, not what the workout was written with.
        let seeded = Settings.withLastUsed(runsheet, results: history)
        self.runsheet = seeded
        self.state = Runner.start(seeded, now: Date().timeIntervalSince1970 * 1000)
    }

    /// Resume a session the app was killed in the middle of.
    init?(resuming runsheet: Runsheet) {
        guard let saved = SessionRunner.readSaved(), saved.runsheetId == (runsheet.id ?? runsheet.title) else { return nil }
        self.runsheet = runsheet
        self.state = saved
    }

    // MARK: - Derived

    var slot: Slot? { Runner.current(state) }
    var nextSlot: Slot? { Runner.next(state) }
    var clock: Clock { Runner.clock(state, now: now) }
    var elapsed: Double { Runner.elapsed(state, now: now) }
    var overall: Double { Runner.overall(state, now: now) }
    var blockElapsed: Double { Runner.blockElapsed(state, now: now) }
    var isDone: Bool { state.phase == .done }
    var target: Double? { slot.flatMap { Runner.targetOf(state, $0) } }
    var incline: Double? {
        guard let i = state.slots.firstIndex(where: { $0.id == slot?.id }) else { return nil }
        return Runner.effectiveIncline(state, i)
    }

    /// The exercise steps of the current block, and where in them we are — "Exercise 2 of 3".
    var blockSteps: [ExerciseStep] {
        guard let blockId = slot?.blockId,
              let block = runsheet.items.compactMap(\.asBlock).first(where: { $0.id == blockId }) else {
            return slot?.exercise.map { [$0] } ?? []
        }
        return block.steps.compactMap(\.asExercise)
    }

    var stepPosition: (index: Int, count: Int)? {
        let steps = blockSteps
        guard steps.count > 1, let id = slot?.step.id, let idx = steps.firstIndex(where: { $0.id == id }) else { return nil }
        return (idx + 1, steps.count)
    }

    // MARK: - Running

    func begin() {
        Cues.shared.begin()
        SessionActivityController.shared.clearStale()
        SessionActivityController.shared.start(title: runsheet.title, state: activityState)
        UIApplication.shared.isIdleTimerDisabled = true
        timer?.invalidate()
        // 10 Hz: the countdown reads smoothly and a cue never lands more than 100 ms late.
        timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.tick() }
        }
        RunLoop.main.add(timer!, forMode: .common)
    }

    func end() {
        timer?.invalidate()
        timer = nil
        UIApplication.shared.isIdleTimerDisabled = false
        Cues.shared.end()
        SessionActivityController.shared.end(activityState)
        SessionRunner.clearSaved()
    }

    private func tick() {
        now = Date().timeIntervalSince1970 * 1000
        let before = state
        state = Runner.tick(state, now: now)
        if state != before { save() }
        fireCues()
        SessionActivityController.shared.update(activityState)
    }

    /// What the Lock Screen shows. Built fresh each time and compared by value, so the controller
    /// pushes an update only when something a person would notice has changed.
    private var activityState: SessionActivityAttributes.ContentState {
        let headline: String
        var detail = slot?.blockName ?? runsheet.title
        switch state.phase {
        case .lead:
            headline = "Get ready"
            detail = slot?.exercise.map { "First up: \($0.exercise.name)" } ?? runsheet.title
        case .ready:
            headline = "Start \(slot?.blockName ?? "block")"
            detail = slot?.exercise?.exercise.name ?? detail
        case .done:
            headline = "Done"
            detail = Format.duration(elapsed)
        default:
            if isRestSlot {
                headline = "Rest"
                detail = nextSlot?.exercise.map { "Next: \($0.exercise.name)" } ?? detail
            } else {
                headline = slot?.exercise?.exercise.name ?? runsheet.title
                if let position = stepPosition {
                    detail = "Exercise \(position.index) of \(position.count)"
                } else if let slot, slot.rounds > 1 {
                    detail = "Round \(slot.round + 1) of \(slot.rounds)"
                }
            }
        }
        return SessionActivityAttributes.ContentState(
            headline: headline,
            detail: state.phase == .paused ? "Paused · \(detail)" : detail,
            isRest: isRestSlot,
            isPaused: state.phase == .paused,
            endsAt: state.endsAt.map { Date(timeIntervalSince1970: $0 / 1000) },
            startedAt: Date(timeIntervalSince1970: state.slotStartedAt / 1000),
            progress: overall
        )
    }

    private var isRestSlot: Bool { slot?.kind == .rest }

    /// Every transition gets both a buzz and a tone: the buzz is what you feel with the phone in a
    /// pocket, the tone is what still reaches you when the screen has locked and haptics cannot.
    private func fireCues() {
        if state.phase == .done, cuedPhase != .done {
            cuedPhase = .done
            Haptics.shared.play(.finish)
            Cues.shared.play(.finish)
            return
        }
        cuedPhase = state.phase

        if let slot, slot.id != cuedSlot, state.phase == .running {
            let startingBlock = cuedSlot != nil && slot.round == 0 && slot.blockId != nil
                && state.slots.first(where: { $0.id == cuedSlot })?.blockId != slot.blockId
            cuedSlot = slot.id
            lastTick = nil
            if startingBlock {
                Haptics.shared.play(.block)
                Cues.shared.play(.block)
            } else {
                Haptics.shared.play(slot.kind == .work ? .work : .rest)
                Cues.shared.play(slot.kind == .work ? .work : .rest)
            }
            return
        }

        // The last three seconds of any countdown, including the lead-in.
        guard state.phase == .running || state.phase == .lead, let left = clock.left else { return }
        let second = Int(left.rounded(.up))
        if second != lastTick, (1...3).contains(second) {
            lastTick = second
            Haptics.shared.play(.tick)
            Cues.shared.play(.tick)
        }
    }

    // MARK: - Controls

    private func apply(_ change: (RunState, Double) -> RunState) {
        now = Date().timeIntervalSince1970 * 1000
        state = change(state, now)
        save()
        fireCues()
        SessionActivityController.shared.update(activityState)
    }

    func startBlock() { apply { Runner.startBlock($0, now: $1) } }
    func done() { apply { Runner.advance($0, now: $1) } }
    func skip() { apply { Runner.advance($0, now: $1, skipped: true) } }
    func back() { apply { Runner.back($0, now: $1) } }
    func finish() { apply { Runner.finish($0, now: $1) } }
    func drop(stepId: String) { apply { Runner.drop($0, now: $1, stepId: stepId) } }

    func pauseOrResume() {
        if state.phase == .paused {
            apply { Runner.resume($0, now: $1) }
        } else {
            apply { Runner.pause($0, now: $1) }
        }
        Haptics.shared.play(.rest)
    }

    /// Nudge the load or speed of whatever is running, by the exercise's own step.
    func nudgeTarget(_ direction: Double) {
        guard let ex = slot?.exercise else { return }
        let step = ex.exercise.step == 0 ? 1 : ex.exercise.step
        let next = max(0, (target ?? ex.target ?? 0) + direction * step)
        apply { Runner.adjust($0, now: $1, target: next) }
        Haptics.shared.play(.tick)
    }

    func nudgeIncline(_ direction: Double) {
        let next = max(0, (incline ?? slot?.exercise?.incline ?? 0) + direction)
        apply { s, _ in Runner.adjustIncline(s, incline: next) }
        Haptics.shared.play(.tick)
    }

    /// Change a step that has not come round yet, from the overview or its own sheet.
    func setStepTarget(_ stepId: String, _ value: Double) {
        if slot?.step.id == stepId {
            apply { Runner.adjust($0, now: $1, target: value) }
        } else {
            apply { s, _ in Runner.adjustStep(s, stepId: stepId, target: value) }
        }
        Haptics.shared.play(.tick)
    }

    func setStepIncline(_ stepId: String, _ value: Double) {
        if slot?.step.id == stepId {
            apply { s, _ in Runner.adjustIncline(s, incline: value) }
        } else {
            apply { s, _ in Runner.adjustStepIncline(s, stepId: stepId, incline: value) }
        }
        Haptics.shared.play(.tick)
    }

    func setReps(_ reps: Double) { apply { s, _ in Runner.setReps(s, reps: reps) } }

    func plannedTarget(_ stepId: String) -> Double? { Runner.plannedTarget(state, stepId: stepId) }
    func plannedIncline(_ stepId: String) -> Double? { Runner.plannedIncline(state, stepId: stepId) }

    func result() -> SessionResult {
        Runner.toResult(state, runsheet, now: Date().timeIntervalSince1970 * 1000)
    }

    // MARK: - Crash safety

    private static var savedURL: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("tiger-run.json")
    }

    private func save() {
        guard state.phase != .done else { return SessionRunner.clearSaved() }
        try? JSONEncoder().encode(state).write(to: SessionRunner.savedURL, options: .atomic)
    }

    /// A session older than six hours is not one you walked away from for a minute.
    static func readSaved() -> RunState? {
        guard let data = try? Data(contentsOf: savedURL),
              let attrs = try? FileManager.default.attributesOfItem(atPath: savedURL.path),
              let modified = attrs[.modificationDate] as? Date,
              Date().timeIntervalSince(modified) < 6 * 3600,
              let state = try? JSONDecoder().decode(RunState.self, from: data),
              state.phase != .done else { return nil }
        return state
    }

    static func clearSaved() {
        try? FileManager.default.removeItem(at: savedURL)
    }
}
