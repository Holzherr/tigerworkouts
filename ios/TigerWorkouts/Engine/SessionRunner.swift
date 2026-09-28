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
    private(set) var runsheet: Runsheet
    /// The list the workout was tapped in, written on the result so the web's origins breakdown
    /// counts gym sessions too. Only a path that knows it sets it; a resumed session has none.
    let startedFrom: SessionOrigin?

    private var timer: Timer?
    /// Called once, the moment the session reaches done — not when Done is tapped. Until the store
    /// has the result, the crash-safe copy on disk stays; the store clears it (`clearSaved`).
    var onFinished: ((SessionResult) -> Void)?
    /// What was handed to `onFinished`, and what the finished screen shows.
    private(set) var finalResult: SessionResult?
    /// The last session of this workout with times kept; nil when there is none.
    private(set) var rival: SessionResult? = nil
    /// "Round 4 — 12 s ahead", recomputed when the run changes, not on every tick.
    private(set) var ghost: Pace.Ghost? = nil
    /// Today's target, read once from history at the start: the timer shows its part for the round
    /// or set in hand, beside the race against last time.
    private(set) var today: Targets.Today? = nil
    /// The screen is kept awake, the tick runs and the audio is held: from `begin` until the
    /// session is done or the timer closes, whichever comes first.
    private(set) var holding = false
    private var cuedSlot: String?
    private var discarded = false
    private var cuedPhase: Phase?
    private var lastTick: Int?

    /// Runs the runsheet exactly as handed over. The workout screen seeds the last-used numbers
    /// once, before they are seen, and whatever is set on it after that is what starts here —
    /// seeding again at this point put last time's numbers back over what had just been set.
    ///
    /// `history` gives the open reps (a range, a max) last time's numbers, set for set, and picks
    /// the last session of this workout to race on the header.
    init(runsheet: Runsheet, startedFrom: SessionOrigin? = nil, history: [SessionResult] = []) {
        self.runsheet = runsheet
        self.startedFrom = startedFrom
        let fresh = Runner.start(runsheet, now: Date().timeIntervalSince1970 * 1000)
        self.state = history.isEmpty ? fresh : Runner.prefillReps(fresh) { step, round in
            LastTime.sets(history, for: step).flatMap { $0.indices.contains(round) ? $0[round].reps : nil }
        }
        self.rival = Pace.lastTimed(history, runsheetIds: runsheet.lineage)
        self.today = Targets.today(runsheet, results: history, intent: Intent.current(), kit: Equipment.current())
    }

    /// Resume a session the app was killed in the middle of. It comes back paused at the moment
    /// it was last saved, so the time the phone spent closed never counts as workout time and
    /// nothing starts counting down before you are ready.
    init?(resuming runsheet: Runsheet, history: [SessionResult] = []) {
        guard let saved = SessionRunner.readSaved(), saved.state.runsheetId == (runsheet.id ?? runsheet.title) else { return nil }
        self.runsheet = runsheet
        self.startedFrom = nil
        self.rival = Pace.lastTimed(history, runsheetIds: runsheet.lineage, excluding: SessionRunner.rowId(saved.state))
        self.today = Targets.today(runsheet, results: history.filter { $0.id != SessionRunner.rowId(saved.state) }, intent: Intent.current(), kit: Equipment.current())
        let at = saved.savedAt.timeIntervalSince1970 * 1000
        self.state = saved.state.phase == .running || saved.state.phase == .lead
            ? Runner.pause(saved.state, now: at)
            : saved.state
    }

    /// What an interrupted session had got to, as a result that can be logged without resuming.
    /// Timed to the last save rather than to now, which may be hours later.
    static func partialResult(of saved: RunState, savedAt: Date, runsheet: Runsheet) -> SessionResult? {
        let at = savedAt.timeIntervalSince1970 * 1000
        // Rests alone are not a workout.
        guard didWork(saved) else { return nil }
        var r = Runner.toResult(saved.phase == .done ? saved : Runner.finish(saved, now: at), runsheet, now: at)
        r.id = rowId(saved)
        return r
    }

    /// A set of work was done: a rest run out says nothing.
    nonisolated static func didWork(_ s: RunState) -> Bool {
        s.slots.contains { $0.kind == .work && s.actuals[$0.id]?.doneAt != nil }
    }

    /// What a crash-safe copy found at launch comes back as. A workout no longer on the phone (deleted,
    /// never saved, a cache that did not load) still gives its session, under the title it ran
    /// with; it cannot be resumed, nor can one left for more than six hours, but either can be saved.
    struct Recovery {
        var sheet: Runsheet
        var canResume: Bool
        var partial: SessionResult?
    }

    static func recovery(of state: RunState, savedAt: Date, lookup: (String) -> Runsheet?, now: Date = Date()) -> Recovery {
        let found = lookup(state.runsheetId)
        let sheet = found ?? Runsheet(id: state.runsheetId, title: state.title, items: [])
        let fresh = now.timeIntervalSince(savedAt) < 6 * 3600
        return Recovery(sheet: sheet, canResume: found != nil && fresh, partial: partialResult(of: state, savedAt: savedAt, runsheet: sheet))
    }

    /// One id per session, so a result saved twice (finished, then recovered after a kill before the
    /// store confirmed it) replaces itself rather than logging the workout twice.
    nonisolated static func rowId(_ s: RunState) -> String { "s-\(Int(s.startedAt))-run" }

    // MARK: - Derived

    var slot: Slot? { Runner.current(state) }
    var nextSlot: Slot? { Runner.next(state) }
    var clock: Clock { Runner.clock(state, now: now) }
    var elapsed: Double { Runner.elapsed(state, now: now) }
    var overall: Double { Runner.overall(state, now: now) }
    var blockElapsed: Double { Runner.blockElapsed(state, now: now) }
    /// Time left on an amrap's or a capped for-time block's clock; nil for an uncapped block.
    var capLeft: Double? { Runner.capLeft(state, now: now) }
    /// Time left in an EMOM's minute, on its work.
    var minuteLeft: Double? { Runner.minuteLeft(state, now: now) }
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
        SessionControls.active = self
        UIApplication.shared.isIdleTimerDisabled = true
        holding = true
        timer?.invalidate()
        // 10 Hz: the countdown reads smoothly and a cue never lands more than 100 ms late.
        timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.tick() }
        }
        RunLoop.main.add(timer!, forMode: .common)
    }

    /// The copy on disk is not cleared here: a finished session's copy goes when the store has the
    /// result (`onFinished`), and the timer cannot be closed any other way.
    func end() {
        timer?.invalidate()
        timer = nil
        holding = false
        UIApplication.shared.isIdleTimerDisabled = false
        Cues.shared.end()
        SessionActivityController.shared.end(activityState)
        if SessionControls.active === self { SessionControls.active = nil }
    }

    private func tick() {
        now = Date().timeIntervalSince1970 * 1000
        let before = state
        state = Runner.tick(state, now: now)
        if state != before {
            save()
            refreshGhost()
        }
        deliver()
        fireCues()
        pushActivity()
        release()
    }

    /// A finished session lets go of the phone: the screen may sleep, the tick stops and the audio
    /// goes once the finish tone has played. Left to the timer screen closing, a phone put down on
    /// the finish screen stayed awake and held the audio session for as long as it was left there.
    private func release() {
        guard state.phase == .done, holding else { return }
        holding = false
        timer?.invalidate()
        timer = nil
        UIApplication.shared.isIdleTimerDisabled = false
        Cues.shared.endAfterFinish()
        if SessionControls.active === self { SessionControls.active = nil }
    }

    /// Hand the result over the first time the session is done. A countdown can finish the session
    /// on a locked phone, so this runs from the tick as well as from the buttons.
    private func deliver() {
        guard state.phase == .done, finalResult == nil else { return }
        let r = result()
        finalResult = r
        onFinished?(r)
    }

    /// The Lock Screen card goes when the workout does. Left running, a finished session has no
    /// countdown to show, so `Text(timerInterval:)` counts up instead and the card reads as a
    /// workout still going — Nick saw exactly that after finishing one.
    private func pushActivity() {
        if state.phase == .done {
            SessionActivityController.shared.end(activityState)
        } else {
            SessionActivityController.shared.update(activityState)
        }
    }

    private var activityState: SessionActivityAttributes.ContentState {
        var content = SessionRunner.lockScreenState(state, runsheet: runsheet, now: now)
        content.ghost = state.phase == .done ? nil : ghost.map { "\($0.label) · \($0.short)" }
        return content
    }

    private func refreshGhost() {
        guard let rival else { return }
        ghost = Pace.ghost(Runner.toResult(state, runsheet, now: now), against: rival, blockOf: Pace.blockOf(runsheet))
    }

    private var isRestSlot: Bool { slot?.kind == .rest }

    /// What the Lock Screen shows, as a pure function of the run so it can be tested.
    ///
    /// Everything in it must hold still for the length of a slot. The controller only pushes when
    /// this value changes, and iOS throttles an app that updates its activity too often — the first
    /// version put live progress in here, changed it every 100 ms tick, and the flood got the one
    /// update that mattered (lead-in to first exercise) dropped, leaving "Get ready 0:00" on the
    /// Lock Screen. The countdown needs no updates at all: it is sent as the instant it ends.
    nonisolated static func activityState(_ state: RunState, runsheet: Runsheet, now: Double, ghost: String? = nil) -> SessionActivityAttributes.ContentState {
        let slot = Runner.current(state)
        let next = Runner.next(state)
        let isRest = slot?.kind == .rest
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
            detail = Format.duration(Runner.elapsed(state, now: now))
        default:
            if isRest {
                headline = "Rest"
                detail = next?.exercise.map { "Next: \($0.exercise.name)" } ?? detail
            } else {
                headline = slot?.exercise?.exercise.name ?? runsheet.title
                if let position = stepPosition(of: slot, in: runsheet) {
                    detail = "Exercise \(position.index) of \(position.count)"
                } else if let round = slot?.roundLabel {
                    detail = round
                }
            }
        }

        // Progress as of the start of the slot: it steps at each boundary rather than creeping.
        let total = state.slots.reduce(0.0) { $0 + Runner.slotEstimate($1) }
        let done = state.slots.prefix(min(state.i, state.slots.count)).reduce(0.0) { $0 + Runner.slotEstimate($1) }
        let progress = state.phase == .done ? 1 : (total > 0 ? done / total : 0)

        return SessionActivityAttributes.ContentState(
            headline: headline,
            detail: state.phase == .paused ? "Paused · \(detail)" : detail,
            isRest: isRest,
            isPaused: state.phase == .paused,
            endsAt: state.endsAt.map { Date(timeIntervalSince1970: $0 / 1000) },
            startedAt: Date(timeIntervalSince1970: state.slotStartedAt / 1000),
            progress: progress,
            isDone: state.phase == .done,
            ghost: state.phase == .done ? nil : ghost
        )
    }

    /// The exercise steps of a slot's block, and where the slot sits in them.
    nonisolated static func stepPosition(of slot: Slot?, in runsheet: Runsheet) -> (index: Int, count: Int)? {
        guard let slot, let blockId = slot.blockId,
              let block = runsheet.items.compactMap(\.asBlock).first(where: { $0.id == blockId }) else { return nil }
        let steps = block.steps.compactMap(\.asExercise)
        guard steps.count > 1, let idx = steps.firstIndex(where: { $0.id == slot.step.id }) else { return nil }
        return (idx + 1, steps.count)
    }

    /// The cue for a change of step or phase; nil when nothing changed that deserves one. Reaching a
    /// block's gate is the end of the block: its cue plays then, with the phone locked in a pocket,
    /// not on the next Start (which then gets the work cue).
    nonisolated static func transitionCue(_ s: RunState, cuedSlot: String?, cuedPhase: Phase?) -> Haptics.Cue? {
        if s.phase == .done { return cuedPhase == .done ? nil : .finish }
        if s.phase == .ready { return cuedPhase != .ready && cuedSlot != nil ? .block : nil }
        guard s.phase == .running, let slot = Runner.current(s), slot.id != cuedSlot else { return nil }
        let startingBlock = cuedSlot != nil && cuedPhase != .ready && slot.round == 0 && slot.blockId != nil
            && s.slots.first(where: { $0.id == cuedSlot })?.blockId != slot.blockId
        return startingBlock ? .block : slot.kind == .work ? .work : .rest
    }

    nonisolated static func tone(_ cue: Haptics.Cue) -> Cues.Tone {
        switch cue {
        case .tick: .tick
        case .work: .work
        case .rest: .rest
        case .block: .block
        case .finish: .finish
        }
    }

    /// Every transition gets both a buzz and a tone: the buzz is what you feel with the phone in a
    /// pocket, the tone is what still reaches you when the screen has locked and haptics cannot.
    private func fireCues() {
        let cue = Self.transitionCue(state, cuedSlot: cuedSlot, cuedPhase: cuedPhase)
        if state.phase == .done {
            cuedPhase = .done
        } else {
            cuedPhase = state.phase
            if state.phase == .running, let slot, slot.id != cuedSlot {
                cuedSlot = slot.id
                lastTick = nil
            }
        }
        if let cue {
            Haptics.shared.play(cue)
            Cues.shared.play(Self.tone(cue))
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
        // A discarded session takes no more changes: one would write the crash-safe copy again.
        guard !discarded else { return }
        now = Date().timeIntervalSince1970 * 1000
        state = change(state, now)
        save()
        refreshGhost()
        deliver()
        fireCues()
        pushActivity()
        release()
    }

    func startBlock() { apply { Runner.startBlock($0, now: $1) } }
    func done() { apply { Runner.advance($0, now: $1) } }
    func skip() { apply { Runner.advance($0, now: $1, skipped: true) } }
    func back() { apply { Runner.back($0, now: $1) } }
    func finish() { apply { Runner.finish($0, now: $1) } }
    /// Stops the session without logging it, from the timer's X: an accidental start is not saved,
    /// streaked or written to Health. The crash-safe copy goes too, so nothing offers it back.
    func discard() {
        discarded = true
        onFinished = nil
        end()
        SessionRunner.clearSaved(startedAt: state.startedAt)
    }
    func drop(stepId: String) { apply { Runner.drop($0, now: $1, stepId: stepId) } }
    func swap(stepId: String, to exercise: LibraryExercise, target: Double?) {
        apply { Runner.swap($0, now: $1, stepId: stepId, to: exercise.ref, target: target) }
    }

    /// Change what is still to come — the next block's rounds, rest, durations or order. What is
    /// done or running is untouched; the edited sheet becomes the session's. See `Runner.replan`.
    /// What the Session sheet shows but will not let you change: done, or running now.
    var passedItems: Set<String> { Runner.passedItems(state) }

    func edit(_ sheet: Runsheet) {
        runsheet = sheet
        apply { Runner.replan($0, sheet, now: $1) }
    }

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

    /// Whether the running slot is a rest that −15 s / +15 s can move: not an EMOM's wait.
    var restAdjustable: Bool {
        guard let slot, slot.kind == .rest, !slot.untilBoundary, slot.seconds != nil else { return false }
        return state.phase == .running || state.phase == .paused
    }

    /// Last time's numbers into a set that is not done yet — a row of the grid, or the running set.
    func fill(_ slotId: String, with set: SetResult) {
        apply { Runner.fillSet($0, now: $1, slotId: slotId, with: set) }
        Haptics.shared.play(.tick)
    }

    // MARK: - The set grid

    /// The block the running slot belongs to, when it is one exercise done for sets.
    var straightSetStep: ExerciseStep? {
        guard let blockId = slot?.blockId,
              let block = runsheet.items.compactMap(\.asBlock).first(where: { $0.id == blockId }) else { return nil }
        return block.straightSetStep
    }

    /// One row per set of the running block, in order.
    struct SetRow: Identifiable, Hashable {
        var id: String { slotId }
        var slotId: String
        var number: Int
        /// What the set number shows: 1, 2, 3, or W / D / F for a warm-up, drop set or to failure.
        var mark: String = ""
        var type: SetType = .normal
        var load: Double?
        var reps: Double
        /// Metres or calories on a distance or calorie set; nil for other work.
        var amount: Double? = nil
        /// Seconds the set ran, once done; nil before and for work whose time says nothing.
        var seconds: Double? = nil
        var done: Bool
        /// The set being done now, or the next one while the rest between sets runs.
        var current: Bool
        /// The tick does something: Done on the running set, a late log on a passed one, un-tick on a done one.
        var tickable: Bool
    }

    var setRows: [SetRow] {
        guard let blockId = slot?.blockId else { return [] }
        let work = state.slots.indices.filter { state.slots[$0].blockId == blockId && state.slots[$0].kind == .work }
        let on = work.first { $0 >= state.i }
        let types = work.map { Runner.typeAt(state, $0) }
        let marks = SetType.marks(types)
        return work.enumerated().map { n, idx in
            let sl = state.slots[idx]
            let a = state.actuals[sl.id]
            let done = a?.doneAt != nil
            let live = state.phase == .running || state.phase == .paused
            // The set after a rest can be ticked too: it ends the rest early.
            let running = live && (idx == state.i || (idx == on && state.slots[state.i..<idx].allSatisfy { $0.kind == .rest }))
            return SetRow(
                slotId: sl.id,
                number: n + 1,
                mark: marks[n],
                type: types[n],
                load: Runner.effectiveTarget(state, idx),
                reps: a?.reps ?? sl.exercise?.forValue ?? 0,
                amount: Runner.amountAt(state, sl),
                seconds: done ? a?.seconds : nil,
                done: done,
                current: idx == on,
                tickable: done || idx < state.i || running
            )
        }
    }

    func tickSet(_ slotId: String) {
        if state.actuals[slotId]?.doneAt != nil {
            apply { s, _ in Runner.reopenSet(s, slotId: slotId) }
        } else {
            apply { Runner.completeSet($0, now: $1, slotId: slotId) }
        }
        Haptics.shared.play(.tick)
    }

    /// A tap on the set number: normal → warm-up → drop set → to failure → normal.
    func cycleSetType(_ slotId: String) {
        guard let idx = state.slots.firstIndex(where: { $0.id == slotId }) else { return }
        let next = Runner.typeAt(state, idx).next
        apply { s, _ in Runner.setTypeAt(s, slotId: slotId, type: next) }
        Haptics.shared.play(.tick)
    }

    func nudgeSetLoad(_ slotId: String, _ direction: Double) {
        guard let row = setRows.first(where: { $0.slotId == slotId }), let ex = straightSetStep else { return }
        let step = ex.exercise.step == 0 ? 1 : ex.exercise.step
        apply { Runner.adjustAt($0, now: $1, slotId: slotId, target: max(0, (row.load ?? 0) + direction * step)) }
        Haptics.shared.play(.tick)
    }

    func nudgeSetReps(_ slotId: String, _ direction: Double) {
        guard let row = setRows.first(where: { $0.slotId == slotId }) else { return }
        apply { s, _ in Runner.setRepsAt(s, slotId: slotId, reps: max(0, row.reps + direction)) }
        Haptics.shared.play(.tick)
    }

    func nudgeSetAmount(_ slotId: String, _ direction: Double) {
        guard let row = setRows.first(where: { $0.slotId == slotId }), let sl = state.slots.first(where: { $0.id == slotId }) else { return }
        apply { s, _ in Runner.setAmountAt(s, slotId: slotId, value: max(0, (row.amount ?? 0) + direction * Self.amountStep(sl))) }
        Haptics.shared.play(.tick)
    }

    /// Timed work on the running slot: Done ends it early and logs the time it ran.
    var timedWork: Bool { slot.map(Runner.timesWork) == true && slot?.seconds != nil }

    /// Metres or calories on the running slot: which, and how many so far.
    var amountField: Runner.Amount? { Runner.amountField(slot) }
    var amount: Double? { slot.flatMap { Runner.amountAt(state, $0) } }

    /// 10 m on a distance, the machine's own step (100 m on a rower) on a timed piece, 1 calorie.
    nonisolated static func amountStep(_ sl: Slot) -> Double {
        guard Runner.amountField(sl) == .meters, let e = sl.exercise else { return 1 }
        return e.forMode == .meters ? 10 : max(10, e.exercise.step)
    }

    func nudgeAmount(_ direction: Double) {
        guard let slot, amountField != nil else { return }
        apply { s, _ in Runner.setAmount(s, value: max(0, (Runner.amountAt(s, slot) ?? 0) + direction * Self.amountStep(slot))) }
        Haptics.shared.play(.tick)
    }

    /// Whether the running slot is done to a count, so has reps worth logging.
    var countsReps: Bool { slot?.exercise?.countsReps == true }

    /// The reps this set will log: what was counted, else the plan for a fixed count. Nil for a max
    /// or reps-plus set nobody has counted yet — the plan there is a floor, not a result.
    var reps: Double? {
        guard let slot, let ex = slot.exercise, ex.countsReps else { return nil }
        return state.actuals[slot.id]?.reps ?? (ex.forMode == .reps ? ex.forValue : nil)
    }

    func nudgeReps(_ direction: Double) {
        guard let ex = slot?.exercise, ex.countsReps else { return }
        setReps(max(0, (reps ?? ex.forValue) + (reps == nil ? 0 : direction)))
        Haptics.shared.play(.tick)
    }

    /// "Target 24 × 10", "Target 8+ · 1:15 a round": today's target where the timer is now.
    var goal: String? {
        // During a rest, what the next set or round is for.
        guard let slot = slot?.kind == .rest ? state.slots.dropFirst(state.i + 1).first(where: { $0.kind == .work }) : slot else { return nil }
        guard let idx = state.slots.firstIndex(of: slot) else { return nil }
        // Which working set this is: warm-ups before it do not count.
        let setNo = state.slots[..<idx].indices.filter { j in
            state.slots[j].kind == .work && state.slots[j].blockId == slot.blockId && state.slots[j].step.id == slot.step.id && Runner.typeAt(state, j) != .warmup
        }.count
        return Targets.timer(today, blockId: slot.blockId, stepId: slot.exercise?.id, round: slot.round, runsheet: runsheet, type: Runner.typeAt(state, idx), set: setNo)
    }

    func plannedTarget(_ stepId: String) -> Double? { Runner.plannedTarget(state, stepId: stepId) }
    func plannedIncline(_ stepId: String) -> Double? { Runner.plannedIncline(state, stepId: stepId) }

    func result() -> SessionResult {
        var r = Runner.toResult(state, runsheet, now: Date().timeIntervalSince1970 * 1000)
        r.id = Self.rowId(state)
        r.startedFrom = startedFrom?.rawValue
        return r
    }

    // MARK: - Crash safety

    /// Tests run in parallel and each gets its own file, so one test's save is never another's.
    @TaskLocal static var savedName = "tiger-run.json"

    private static var savedURL: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent(savedName)
    }

    /// A finished session is written too: until the store has it, this file is the only copy.
    private func save() {
        try? JSONEncoder().encode(state).write(to: SessionRunner.savedURL, options: .atomic)
    }

    /// A session older than six hours is not one you walked away from for a minute, and one with no
    /// set done is forgotten then. A finished one, or one with work done, is returned whatever its
    /// age: it is a workout the store never confirmed, and it can still be saved.
    static func readSaved() -> (state: RunState, savedAt: Date)? {
        guard let data = try? Data(contentsOf: savedURL),
              let attrs = try? FileManager.default.attributesOfItem(atPath: savedURL.path),
              let modified = attrs[.modificationDate] as? Date,
              let state = try? JSONDecoder().decode(RunState.self, from: data),
              state.phase == .done || didWork(state) || Date().timeIntervalSince(modified) < 6 * 3600 else { return nil }
        return (state, modified)
    }

    static func clearSaved() {
        try? FileManager.default.removeItem(at: savedURL)
    }

    /// Clear the copy only if it is still this session's: a new workout started while the last one
    /// was saving must keep its own.
    static func clearSaved(startedAt: Double) {
        guard readSaved()?.state.startedAt == startedAt else { return }
        clearSaved()
    }
}

// MARK: - Lock Screen controls

extension SessionRunner: SessionControllable {
    /// Lengthen the running rest (or shorten it, with a negative number). Nothing on a work step.
    func extendRest(by seconds: Double) {
        apply { Runner.extendRest($0, now: $1, by: seconds) }
    }

    /// A button on the Lock Screen card, run in the app's process by an App Intent. A tap from a
    /// card that is behind the session does nothing: acting on whatever is running now would tick a
    /// set nobody meant to tick.
    func control(_ control: SessionControl, token: String?) {
        activityLog.info("control \(control.rawValue, privacy: .public) from \(token ?? "-", privacy: .public) at \(SessionRunner.token(self.state), privacy: .public)")
        if let token, token != SessionRunner.token(state) { return }
        switch control {
        case .done:
            if state.phase == .ready { startBlock() } else if state.phase == .running || state.phase == .lead { done() }
        case .skipRest:
            if state.phase == .running, isRestSlot { skip() }
        case .extendRest:
            if isRestSlot { extendRest(by: 15) }
        case .resume:
            if state.phase == .paused { pauseOrResume() }
        }
    }

    /// `activityState` plus what the card's buttons need: the set's load and reps, which buttons to
    /// show, and the token a tap carries back. Everything in it holds still for the length of a
    /// slot, like the rest of the card.
    nonisolated static func lockScreenState(_ state: RunState, runsheet: Runsheet, now: Double) -> SessionActivityAttributes.ContentState {
        var content = activityState(state, runsheet: runsheet, now: now)
        let slot = Runner.current(state)
        switch state.phase {
        case .lead, .ready: content.action = .start
        case .running: content.action = slot?.kind == .rest ? (state.endsAt == nil ? .done : .rest) : .done
        case .paused: content.action = .resume
        case .done: content.action = .none
        }
        // The block's own clock where it has one, as the instant it runs out: a cap on an AMRAP or
        // a for-time block, the minute on EMOM work. Held still while paused.
        if state.phase == .running, let slot, let id = slot.blockId, let began = state.blockStart[id] {
            if let cap = slot.capSec {
                content.capEndsAt = Date(timeIntervalSince1970: (began + cap * 1000) / 1000)
                content.capLabel = "left in the block"
            } else if slot.mode == .emom, slot.kind == .work, let every = slot.everySec {
                content.capEndsAt = Date(timeIntervalSince1970: (began + Double(slot.round + 1) * every * 1000) / 1000)
                content.capLabel = "left in the minute"
            }
        }
        // During a rest, and before a block, the set to get ready for is the next piece of work.
        let from = state.phase == .lead ? 0 : state.i
        let work = state.slots.indices.first { $0 >= from && state.slots[$0].kind == .work }
        content.setLine = state.phase == .done ? nil : work.flatMap { setLine(state, $0) }
        content.token = token(state)
        return content
    }

    nonisolated static func token(_ state: RunState) -> String {
        "\(state.phase.rawValue):\(Runner.current(state)?.id ?? "-")"
    }

    /// "60 kg × 8", "60 kg × max", "12 reps", "28 kg" — what to load and how many, the way it is
    /// said in a gym. Reps counted so far win over the plan. Nil when there is neither.
    nonisolated static func setLine(_ state: RunState, _ idx: Int) -> String? {
        guard let slot = state.slots[safe: idx], let ex = slot.exercise else { return nil }
        let load = ex.hasSetting ? Runner.effectiveTarget(state, idx).map { t in
            ex.shortUnit.isEmpty ? Format.number(t) : "\(Format.number(t)) \(ex.shortUnit)"
        } : nil
        var count: String?
        switch ex.forMode {
        case .reps: count = Format.number(state.actuals[slot.id]?.reps ?? ex.forValue)
        case .amrap: count = state.actuals[slot.id]?.reps.map(Format.number) ?? "\(Format.number(ex.forValue))+"
        case .max: count = state.actuals[slot.id]?.reps.map(Format.number) ?? "max"
        default: count = nil
        }
        switch (load, count) {
        case let (l?, c?): return "\(l) × \(c)"
        case let (l?, nil): return l
        case let (nil, c?): return c == "max" ? "Max reps" : "\(c) reps"
        default: return nil
        }
    }
}
