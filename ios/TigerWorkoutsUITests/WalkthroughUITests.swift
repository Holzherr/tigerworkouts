import XCTest

/// Walks the app the way it gets used and attaches a screenshot at each stop. It is a smoke test
/// first — every step waits for the thing it needs and fails loudly if it is missing — and a
/// visual record second: `xcrun xcresulttool export attachments` pulls the pictures out.
final class WalkthroughUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUp() {
        continueAfterFailure = false
        app = XCUIApplication()
        // The rest-end notification prompt would sit over every walkthrough; one test asks for it.
        app.launchEnvironment["UITEST_NO_PROMPTS"] = "1"
        app.launch()
        // A test that ended mid-session leaves one to resume; start each test from a clean slate.
        let discard = app.alerts.buttons["Discard"]
        if discard.waitForExistence(timeout: 3) { discard.tap() }
    }

    func testInterruptedSessionIsOfferedNotForced() {
        open("Tabata This")
        tap(app.buttons["Start workout"])
        XCTAssertTrue(app.buttons["End session"].waitForExistence(timeout: 5))
        sleep(7) // past the lead-in and into the first work slot

        // Killed mid-workout, the way a phone does it.
        app.terminate()
        app.launch()

        let alert = app.alerts["Pick up where you left off?"]
        XCTAssertTrue(alert.waitForExistence(timeout: 10), "reopening after a kill should ask, not throw you back in")
        snap("19 Resume offer")
        tap(alert.buttons["Resume"])

        // It comes back paused, so the time the app was closed is not counted as work.
        XCTAssertTrue(app.buttons["Resume"].waitForExistence(timeout: 5), "a resumed session should be paused")
        snap("20 Resumed, paused")
        tap(app.buttons["End session"])
        tap(app.buttons["Finish and save"])
        tap(app.buttons["Done"])
    }

    /// An accidental start: the timer's X offers Discard, and nothing lands in History.
    func testDiscardFromTimer() {
        tap(app.tabBars.buttons["History"])
        sleep(1)
        let before = app.cells.count
        tap(app.tabBars.buttons["Workouts"])
        open("Tabata This")
        tap(app.buttons["Start workout"])
        XCTAssertTrue(app.buttons["End session"].waitForExistence(timeout: 5))
        sleep(7)
        tap(app.buttons["End session"])
        XCTAssertTrue(app.buttons["Discard"].waitForExistence(timeout: 5), "the X should offer Discard, not only Finish and save")
        snap("97 Timer X offers Discard")
        tap(app.buttons["Discard"])
        XCTAssertTrue(app.buttons["Start workout"].waitForExistence(timeout: 5), "Discard should close the timer")
        tap(app.tabBars.buttons["History"])
        sleep(1)
        XCTAssertEqual(app.cells.count, before, "a discarded session should not be in History")
        snap("98 History after a discard")
    }

    func testBrowseRunAndFinish() {
        XCTAssertTrue(app.navigationBars["TigerWorkouts"].waitForExistence(timeout: 10))
        snap("01 Workouts")
        // The last carousel has to clear the tab bar.
        for _ in 0..<6 { app.swipeUp() }
        snap("01b Workouts, scrolled to the end")
        app.swipeDown()
        app.swipeDown()

        open("Tabata This")
        snap("02 Workout detail")

        // Any exercise on the page opens with its steppers — there is no edit mode to find.
        let firstExercise = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] '20s'")).firstMatch
        if firstExercise.waitForExistence(timeout: 3) {
            firstExercise.tap()
            XCTAssertTrue(app.buttons["Done"].waitForExistence(timeout: 5))
            snap("03 Exercise sheet")
            app.buttons["Done"].tap()
        }

        tap(app.buttons["Start workout"])
        XCTAssertTrue(app.staticTexts["Get ready"].waitForExistence(timeout: 5))
        snap("04 Lead-in")

        // The five-second lead-in runs out on its own. Tabata's work is on the clock, so Done reads Done early.
        XCTAssertTrue(app.buttons["Done early"].waitForExistence(timeout: 10))
        sleep(2)
        snap("05 Timer")

        tap(app.buttons["Session overview"])
        snap("06 Session overview")
        tap(app.buttons["Close"])

        // Out to the home screen: the session carries on in the Dynamic Island.
        XCUIDevice.shared.press(.home)
        sleep(3)
        snap("07 Dynamic Island")
        app.activate()
        XCTAssertTrue(app.buttons["End session"].waitForExistence(timeout: 10))

        tap(app.buttons["End session"])
        tap(app.buttons["Finish and save"])
        XCTAssertTrue(app.staticTexts["Workout saved"].waitForExistence(timeout: 10))
        snap("08 Finished")
        app.swipeUp()
        snap("09 Finished, stats")
        // Asked once, on the first finish screen with no bodyweight; later runs never see it.
        let saveWeight = app.buttons["Save"]
        if app.staticTexts["What do you weigh?"].exists && saveWeight.exists {
            snap("09b Bodyweight, asked once")
            saveWeight.tap()
            XCTAssertFalse(app.staticTexts["What do you weigh?"].waitForExistence(timeout: 2))
        }
        tap(app.buttons["Done"])

        tap(app.tabBars.buttons["History"])
        snap("10 History")

        // Home now knows you: the next thing to do, one tap to start it.
        home()
        XCTAssertTrue(app.buttons["up-next"].waitForExistence(timeout: 5), "with history, home should offer what to do next")
        snap("10b Home, up next")

        tap(app.tabBars.buttons["Me"])
        XCTAssertTrue(app.navigationBars["Me"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Last 4 weeks"].waitForExistence(timeout: 5))
        snap("10c Me, profile")
        app.swipeUp()
        snap("10d Me, profile scrolled")

        home()
        tap(app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Start '")).firstMatch)
        XCTAssertTrue(app.buttons["End session"].waitForExistence(timeout: 5), "Start on home should run the workout straight away")
        tap(app.buttons["End session"])
        tap(app.buttons["Finish and save"])
        tap(app.buttons["Done"])
    }

    /// The bench is taken: the session carries on with the machine, from here to the end.
    func testSwapWhenTheKitIsBusy() {
        open("Tabata This")
        tap(app.buttons["Start workout"])
        XCTAssertTrue(app.buttons["End session"].waitForExistence(timeout: 5))
        sleep(7) // past the lead-in, into the first work slot

        // The card on the timer itself, which is what you tap with a machine in front of you.
        // The workout page behind it carries the same name, so take the one actually on screen.
        let cards = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] 'Rowing machine'"))
        XCTAssertTrue(cards.firstMatch.waitForExistence(timeout: 5))
        guard let card = cards.allElementsBoundByIndex.first(where: \.isHittable) else {
            return XCTFail("the running exercise should be tappable")
        }
        card.tap()

        let heading = app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] 'swap exercise'")).firstMatch
        XCTAssertTrue(heading.waitForExistence(timeout: 5), "an exercise should offer alternatives")
        snap("24 Alternatives")
        let alternative = app.buttons.matching(NSPredicate(format: "label BEGINSWITH[c] 'Assault bike'")).firstMatch
        XCTAssertTrue(alternative.waitForExistence(timeout: 3), "the rower should offer other cardio")
        alternative.tap()

        // The swap lands on the timer: the card now names what is actually being done.
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label CONTAINS[c] 'Assault bike'")).firstMatch.waitForExistence(timeout: 5))

        XCTAssertTrue(app.buttons["End session"].waitForExistence(timeout: 5))
        snap("25 After the swap")
        tap(app.buttons["End session"])
        tap(app.buttons["Finish and save"])
        tap(app.buttons["Done"])
    }

    /// One exercise for sets is a grid: on the workout page a row per set, on the timer a tick per set.
    func testStraightSets() {
        open("Iron Base · Whole Body A")
        let grid = app.descendants(matching: .any)["set-grid"].firstMatch
        for _ in 0..<6 where !(grid.exists && grid.isHittable) {
            app.swipeUp(velocity: .slow)
        }
        XCTAssertTrue(grid.waitForExistence(timeout: 5), "a one-exercise block should show its sets")
        snap("31 Set grid on the workout page")

        tap(app.buttons["Start workout"])
        XCTAssertTrue(app.buttons["End session"].waitForExistence(timeout: 5))
        // Skip through the warm-up and the first block to the Pull block's gate.
        let startPull = app.buttons["Start Pull"]
        for _ in 0..<60 where !startPull.exists {
            let start = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Start ' AND label != 'Start workout'")).firstMatch
            if start.exists, start.isHittable {
                start.tap()
            } else if app.buttons["Skip"].exists {
                app.buttons["Skip"].tap()
            }
        }
        tap(startPull)
        XCTAssertTrue(app.buttons["Tick set 1"].waitForExistence(timeout: 5), "the timer should show the sets")
        snap("32 Set grid on the timer")

        tap(app.buttons["Tick set 1"])
        XCTAssertTrue(app.buttons["Un-tick set 1"].waitForExistence(timeout: 5), "a ticked set shows as done")
        XCTAssertTrue(app.staticTexts["Rest"].waitForExistence(timeout: 3), "the rest between sets counts down")
        snap("33 Rest between sets")

        // Starting before the rest runs out: the tick on set 2 ends the rest and logs the set.
        tap(app.buttons["Tick set 2"])
        XCTAssertTrue(app.buttons["Un-tick set 2"].waitForExistence(timeout: 5), "ticking the next set during the rest should log it")
        snap("34 Set 2 ticked during the rest")

        tap(app.buttons["Un-tick set 1"])
        XCTAssertTrue(app.buttons["Set 1 load, more"].waitForExistence(timeout: 5), "an un-ticked set can be changed")
        snap("35 Set un-ticked to fix its weight")

        tap(app.buttons["End session"])
        tap(app.buttons["Finish and save"])
        tap(app.buttons["Done"])
    }

    /// A program's rule on the finish screen, as on the web's result sheet: Made it / Missed on
    /// each lift it reads, and "Next time" with the load it makes of the session.
    func testMadeItOnTheFinishScreen() {
        open("Iron Base · Whole Body A")
        tap(app.buttons["Start workout"])
        XCTAssertTrue(app.buttons["End session"].waitForExistence(timeout: 5))
        let startBlock = app.buttons["Start Squat and press"]
        for _ in 0..<60 where !startBlock.exists {
            if app.buttons["Skip"].exists { app.buttons["Skip"].tap() } else { sleep(1) }
        }
        tap(startBlock)
        // The goblet squats of round 1, logged.
        tap(app.buttons["Done"])
        tap(app.buttons["End session"])
        tap(app.buttons["Finish and save"])
        XCTAssertTrue(app.staticTexts["Workout saved"].waitForExistence(timeout: 10))
        let missed = app.buttons["made-it-no"].firstMatch
        for _ in 0..<6 where !(missed.exists && missed.isHittable) { app.swipeUp(velocity: .slow) }
        XCTAssertTrue(missed.waitForExistence(timeout: 5), "a lift the program's rule reads gets Made it / Missed")
        let next = app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS 'Goblet squat' AND label CONTAINS 'kg'")).firstMatch
        XCTAssertTrue(next.waitForExistence(timeout: 5), "Next time shows the load the rule makes of it")
        snap("57 Finish, Made it and Next time")
        missed.tap()
        XCTAssertTrue(app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS 'repeat the weight'")).firstMatch.waitForExistence(timeout: 5), "Missed repeats the weight")
        snap("58 Finish, Missed repeats the weight")
        let done = app.buttons["Done"]
        for _ in 0..<4 where !(done.exists && done.isHittable) { app.swipeUp() }
        tap(done)
    }

    /// Logging in the gym: last time's set in one tap, ±15 s on the rest, and the header racing the
    /// last session of the same workout.
    func testGymLogging() {
        app.terminate()
        app.launchArguments = ["-seedPace"]
        app.launch()
        let discard = app.alerts.buttons["Discard"]
        if discard.waitForExistence(timeout: 3) { discard.tap() }

        open("Iron Base · Whole Body A")
        tap(app.buttons["Start workout"])
        XCTAssertTrue(app.buttons["End session"].waitForExistence(timeout: 5))
        let startPull = app.buttons["Start Pull"]
        for _ in 0..<60 where !startPull.exists {
            let start = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Start ' AND label != 'Start workout'")).firstMatch
            if start.exists, start.isHittable {
                start.tap()
            } else if app.buttons["Skip"].exists {
                app.buttons["Skip"].tap()
            }
        }
        tap(startPull)
        // Tones off from the top bar, then back on so later walks keep them.
        tap(app.buttons["Mute tones"])
        XCTAssertTrue(app.buttons["Unmute tones"].waitForExistence(timeout: 3), "the speaker should show tones are off")
        snap("36a Tones muted on the timer")
        tap(app.buttons["Unmute tones"])
        let useLast = app.buttons["Use last time for set 1"]
        XCTAssertTrue(useLast.waitForExistence(timeout: 5), "a set with a last time should offer it")
        snap("37 Last time on each set")
        useLast.tap()
        snap("38 Last time copied into set 1")

        tap(app.buttons["Tick set 1"])
        let more = app.buttons["15 seconds more rest"]
        XCTAssertTrue(more.waitForExistence(timeout: 5), "a rest should take ±15 s")
        more.tap()
        XCTAssertTrue(app.descendants(matching: .any)["ghost"].waitForExistence(timeout: 5), "a timed last session should be raced")
        snap("39 Rest with ±15 s, racing last time")
        tap(app.buttons["End session"])
        tap(app.buttons["Finish and save"])
        tap(app.buttons["Done"])

        // A fresh launch rather than navigating back: the seed is back to the only timed Cindy.
        app.terminate()
        app.launch()
        if discard.waitForExistence(timeout: 3) { discard.tap() }
        open("Cindy")
        tap(app.buttons["Start workout"])
        let done = app.buttons["Done"]
        XCTAssertTrue(app.descendants(matching: .any)["cap-left"].waitForExistence(timeout: 12))
        XCTAssertTrue(app.buttons["use-last-time"].waitForExistence(timeout: 3), "the card should offer last time")
        snap("40 Last time on the card")
        for _ in 0..<3 { tap(done) }
        XCTAssertTrue(app.descendants(matching: .any)["ghost"].waitForExistence(timeout: 5), "round 1 should be raced against last time")
        snap("41 Round 1 against last time")
        tap(app.buttons["End session"])
        tap(app.buttons["Finish and save"])
        tap(app.buttons["Done"])
    }

    /// An AMRAP runs against its cap, and the timer says how much of it is left.
    func testCapClock() {
        open("Cindy")
        tap(app.buttons["Start workout"])
        let cap = app.descendants(matching: .any)["cap-left"].firstMatch
        XCTAssertTrue(cap.waitForExistence(timeout: 12), "a capped block should show the time left on it")
        snap("36 Cap clock on an AMRAP")
        tap(app.buttons["End session"])
        tap(app.buttons["Finish and save"])
        tap(app.buttons["Done"])
    }

    /// EMOM work counts down its minute; Previous step undoes a stray Done; a finished session can
    /// be discarded, which asks first.
    func testEmomPreviousAndDiscard() {
        open("EMOM 10: 5 burpees")
        tap(app.buttons["Start workout"])
        let minute = app.descendants(matching: .any)["cap-left"].firstMatch
        XCTAssertTrue(minute.waitForExistence(timeout: 12), "EMOM work should show the time left in the minute")
        XCTAssertTrue(minute.label.contains("left in the minute"))
        snap("37 EMOM minute clock")
        tap(app.buttons["Done"])
        XCTAssertTrue(app.staticTexts["Rest"].waitForExistence(timeout: 5))
        tap(app.buttons["Previous step"])
        XCTAssertTrue(minute.waitForExistence(timeout: 5), "Previous step should go back to the set")
        snap("38 Previous step, back on the set")
        tap(app.buttons["End session"])
        tap(app.buttons["Finish and save"])
        XCTAssertTrue(app.staticTexts["Workout saved"].waitForExistence(timeout: 10))
        let discard = app.buttons["discard-workout"]
        for _ in 0..<6 where !(discard.exists && discard.isHittable) { app.swipeUp() }
        snap("39 Finish, Discard workout")
        tap(discard)
        let confirm = app.buttons.matching(NSPredicate(format: "label == 'Discard workout' AND identifier != 'discard-workout'")).firstMatch
        XCTAssertTrue(confirm.waitForExistence(timeout: 5), "Discard should ask first")
        snap("40 Discard, asked first")
        confirm.tap()
        XCTAssertFalse(app.staticTexts["Workout saved"].waitForExistence(timeout: 3))
    }

    /// The workout page is the editor: drag, remove and add without finding an edit mode.
    func testEditOnTheWorkoutPage() {
        open("Tabata This")
        let rower = app.buttons.matching(NSPredicate(format: "label BEGINSWITH[c] 'Rowing machine'")).firstMatch
        let rest = app.buttons.matching(NSPredicate(format: "label BEGINSWITH[c] 'Rest'")).firstMatch
        XCTAssertTrue(rower.waitForExistence(timeout: 5))
        XCTAssertLessThan(rower.frame.minY, rest.frame.minY)
        snap("21 Workout page, editable")

        // Hold and drag the rest above the rower.
        // The page opens with these rows at the bottom, right above the Start bar. A drag that
        // starts there makes the list auto-scroll under the finger, so where it drops depended on
        // how tall the rows above had come out and how fast the run was: the flake. Scroll them
        // to the middle first.
        centre([rower, rest])
        drag(rest, onto: rower)
        // The first edit swaps the catalogue workout for a copy with fresh ids, so every row is
        // replaced and animates in; read the order once that settles rather than after a fixed wait.
        waitFor("dragging should reorder in place") { rest.frame.minY < rower.frame.minY }

        // A catalogue workout is never written over: the first edit silently makes it yours.
        XCTAssertTrue(app.navigationBars["Tabata This (mine)"].waitForExistence(timeout: 5))
        snap("22 Reordered, now my copy")

        // A block moves as a whole by its header: drag Pull-up above Squat.
        let squat = app.buttons.matching(NSPredicate(format: "label BEGINSWITH[c] 'Tabata Squat'")).firstMatch
        let pullup = app.buttons.matching(NSPredicate(format: "label BEGINSWITH[c] 'Tabata Pull-up'")).firstMatch
        XCTAssertTrue(squat.waitForExistence(timeout: 3))
        // The list only builds rows near the screen: bring Pull-up into it before measuring. A
        // swipe flings on and could carry Squat off the top, so scroll in held steps instead.
        reveal(pullup)
        centre([squat, pullup])
        XCTAssertLessThan(squat.frame.minY, pullup.frame.minY)
        drag(pullup, onto: squat)
        waitFor("dragging a header should move the whole block") { pullup.frame.minY < squat.frame.minY }
        snap("22b Block moved")

        // Add straight from the page.
        tap(app.buttons["Add exercise"].firstMatch)
        let search = app.searchFields["Exercise"]
        tap(search)
        search.typeText("Kettlebell swing")
        tap(app.buttons.matching(NSPredicate(format: "label BEGINSWITH[c] 'Kettlebell swing'")).firstMatch)
        let swing = app.buttons.matching(NSPredicate(format: "label BEGINSWITH[c] 'Kettlebell swing'")).firstMatch
        XCTAssertTrue(swing.waitForExistence(timeout: 5), "an added exercise should appear on the page")

        // Swipe it away again.
        swing.swipeLeft()
        tap(app.buttons["Delete"])
        XCTAssertFalse(swing.waitForExistence(timeout: 2))
        snap("23 My copy, edited")

        // Every run made another "Tabata This (mine)", and once enough of them filled the search
        // results, open("Tabata This") in a later test landed on one with its rest moved first.
        tap(app.navigationBars["Tabata This (mine)"].buttons["Edit"])
        tap(app.buttons["Delete workout"])
        tap(app.buttons["Delete"].firstMatch)
        XCTAssertTrue(app.navigationBars["TigerWorkouts"].waitForExistence(timeout: 5), "deleting the copy should go back")
    }

    func testWriteAWorkout() {
        XCTAssertTrue(app.navigationBars["TigerWorkouts"].waitForExistence(timeout: 10))
        tap(app.buttons["New workout"])
        // New workout opens the workout screen itself, asking for a name first.
        let name = app.textFields["Name"]
        XCTAssertTrue(name.waitForExistence(timeout: 5))
        snap("11 New workout")
        tap(name)
        name.typeText("Swings and sprints")
        tap(app.buttons["Done"])
        XCTAssertTrue(app.navigationBars["Swings and sprints"].waitForExistence(timeout: 5))
        // Nothing to run yet, so nothing to start.
        XCTAssertFalse(app.buttons["Start workout"].exists, "an empty workout should not offer Start")
        snap("11b New workout, named, empty")

        tap(app.buttons["Add exercise"].firstMatch)
        XCTAssertTrue(app.navigationBars["Add exercise"].waitForExistence(timeout: 5))
        snap("12 Exercise picker")
        let search = app.searchFields["Exercise"]
        tap(search)
        search.typeText("Kettlebell swing")
        tap(app.buttons.matching(NSPredicate(format: "label BEGINSWITH[c] 'Kettlebell swing'")).firstMatch)

        let swing = app.buttons.matching(NSPredicate(format: "label BEGINSWITH[c] 'Kettlebell swing'")).firstMatch
        XCTAssertTrue(swing.waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Start workout"].waitForExistence(timeout: 3), "one exercise is enough to start")
        snap("13 Workout screen with an exercise")

        tap(swing)
        tap(app.buttons.matching(NSPredicate(format: "label BEGINSWITH[c] 'How long or how many'")).firstMatch)
        XCTAssertTrue(app.navigationBars["Step"].waitForExistence(timeout: 5))
        snap("14 Step editor")
        tap(app.buttons["Done"])
        tap(app.buttons["Done"])

        // No Save: it saved itself once it had a name and an exercise.
        app.navigationBars.buttons.element(boundBy: 0).tap()
        XCTAssertTrue(app.staticTexts["Mine"].waitForExistence(timeout: 5), "a saved workout should appear under Mine")
        snap("15 Workouts with Mine")
    }

    func testSettingsAndHealth() {
        tap(app.tabBars.buttons["Me"])
        XCTAssertTrue(app.navigationBars["Me"].waitForExistence(timeout: 5))
        snap("16 Me")
        for _ in 0..<4 where !(app.buttons["Settings"].exists && app.buttons["Settings"].isHittable) { app.swipeUp() }
        snap("16a Me, scrolled")
        // The exercise logbook opens from Me as well as from History.
        tap(app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Exercises'")).firstMatch)
        XCTAssertTrue(app.navigationBars["Exercises"].waitForExistence(timeout: 5))
        app.navigationBars["Exercises"].buttons.element(boundBy: 0).tap()
        XCTAssertTrue(app.navigationBars["Me"].waitForExistence(timeout: 5))
        tap(app.buttons["Settings"])
        XCTAssertTrue(app.navigationBars["Settings"].waitForExistence(timeout: 5))
        // The simulator has no haptic hardware, and the row says so rather than staying quiet.
        XCTAssertTrue(app.staticTexts["Haptic engine: not on this device"].waitForExistence(timeout: 5))
        tap(app.buttons["Test buzz"])
        snap("16b Settings")

        let health = app.switches["Apple Health"]
        // Below the suggestions section: scroll it into view.
        for _ in 0..<4 where !(health.exists && health.isHittable) { app.swipeUp() }
        XCTAssertTrue(health.waitForExistence(timeout: 5))
        // A SwiftUI toggle flips on its knob, not on the middle of the row, which is the label.
        let knob = health.coordinate(withNormalizedOffset: CGVector(dx: 0.93, dy: 0.5))
        // An earlier run can leave it on; start from off so the tap asks.
        if (health.value as? String) == "1" { knob.tap(); sleep(1) }
        knob.tap()
        // The permission sheet is the system's, presented over the app. If it does not come up,
        // the switch goes back off and the row under it has to say why.
        sleep(4)
        snap("17 Health permission")
        if (health.value as? String) == "0" {
            XCTAssertTrue(app.descendants(matching: .any)["health-error"].exists, "Health turned itself off without saying why")
        }
        // Only a signed build carries the entitlement; CI builds unsigned and says so.
        if ProcessInfo.processInfo.environment["UNSIGNED_BUILD"] != "1" {
            XCTAssertFalse(app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] 'entitlement'")).firstMatch.exists,
                           "HealthKit refused for want of the entitlement")
        }
    }

    func testLockScreen() {
        open("Tabata This")
        tap(app.buttons["Start workout"])
        XCTAssertTrue(app.staticTexts["Get ready"].waitForExistence(timeout: 5))
        // The simulator has no public lock API; this private selector is the usual test-only way in.
        let lock = NSSelectorFromString("pressLockButton")
        guard XCUIDevice.shared.responds(to: lock) else { return }

        XCUIDevice.shared.perform(lock)
        sleep(1)
        XCUIDevice.shared.perform(lock) // wakes to the Lock Screen without unlocking
        // First activity from an app asks permission on the Lock Screen itself.
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let allow = springboard.buttons["Allow"]
        if allow.waitForExistence(timeout: 4) { allow.tap() }

        // Five seconds of lead-in and twenty of work: by 29 s the card must have moved on to the
        // first rest, with the phone locked the whole time.
        sleep(29)
        XCUIDevice.shared.perform(lock)
        sleep(1)
        XCUIDevice.shared.perform(lock)
        sleep(2)
        snap("18 Lock Screen, after a transition while locked")
    }

    /// The card's buttons, with the phone locked: Done on a set, then +15 s and Skip on the rest.
    /// A lifting block, because its sets wait for Done and its rests are long enough for the
    /// Lock Screen to be read between taps.
    func testLockScreenControls() {
        open("Iron Base · Whole Body A")
        tap(app.buttons["Start workout"])
        XCTAssertTrue(app.buttons["End session"].waitForExistence(timeout: 5))
        let startPull = app.buttons["Start Pull"]
        for _ in 0..<60 where !startPull.exists {
            let start = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Start ' AND label != 'Start workout'")).firstMatch
            if start.exists, start.isHittable {
                start.tap()
            } else if app.buttons["Skip"].exists {
                app.buttons["Skip"].tap()
            }
        }
        tap(startPull)
        XCTAssertTrue(app.buttons["Tick set 1"].waitForExistence(timeout: 5))

        let lock = NSSelectorFromString("pressLockButton")
        guard XCUIDevice.shared.responds(to: lock) else { return }
        XCUIDevice.shared.perform(lock)
        sleep(1)
        XCUIDevice.shared.perform(lock)
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        for label in ["Allow", "Always Allow"] where springboard.buttons[label].waitForExistence(timeout: 2) {
            springboard.buttons[label].tap()
        }

        let done = springboard.buttons["Done"]
        XCTAssertTrue(done.waitForExistence(timeout: 10), "the card should offer Done on a set")
        snap("18b Lock Screen, Done on a set")
        done.tap()
        let more = springboard.buttons["+15 s"]
        XCTAssertTrue(more.waitForExistence(timeout: 10), "Done on the card should move the session on to the rest")
        sleep(1) // let the card finish its transition
        snap("18c Lock Screen, rest with +15 s and Skip")
        more.tap()
        sleep(2)
        snap("18d Lock Screen, 15 s added")
        tap(springboard.buttons["Skip rest"])
        XCTAssertTrue(done.waitForExistence(timeout: 10), "Skip rest should start the next set")
        snap("18e Lock Screen, rest skipped")
    }

    /// The Up next widget's tap: a workout link on a cold launch, before the catalogue has loaded,
    /// still lands on that workout's page with Start on it.
    func testWorkoutLinkOnColdLaunch() {
        app.terminate()
        app.open(URL(string: "tigerworkouts://w/proto-tabata-this")!)
        XCTAssertTrue(app.buttons["Start workout"].waitForExistence(timeout: 15), "a workout link should open that workout")
        XCTAssertTrue(app.staticTexts["Tabata This"].exists || app.navigationBars.staticTexts["Tabata This"].exists
                      || app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'Tabata This'")).firstMatch.exists)
        snap("37 Workout opened from a link on a cold launch")
    }

    /// The logbook: History → Exercises → one lift's chart, records and sessions; then the same
    /// screen from a session's exercise row.
    func testLogbook() {
        app.terminate()
        app.launchArguments = ["-seedLogbook"]
        app.launch()
        let discard = app.alerts.buttons["Discard"]
        if discard.waitForExistence(timeout: 3) { discard.tap() }

        tap(app.tabBars.buttons["History"])
        tap(app.navigationBars["History"].buttons["Exercises"])
        XCTAssertTrue(app.navigationBars["Exercises"].waitForExistence(timeout: 5))
        snap("26 Exercises")

        tap(app.buttons.matching(NSPredicate(format: "label BEGINSWITH[c] 'Barbell bench press'")).firstMatch)
        XCTAssertTrue(app.staticTexts["Best est. 1RM"].waitForExistence(timeout: 5), "a lift should show its records")
        // The session card is a link, so its PR tag is read as part of the link's label.
        let pr = app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS[c] 'personal record'")).firstMatch
        XCTAssertTrue(pr.waitForExistence(timeout: 3), "a set that beat a record should be marked")
        snap("27 Exercise history")
        app.swipeUp()
        snap("28 Exercise history, sessions")

        // A session's exercise row opens the same logbook.
        tap(app.navigationBars.buttons.element(boundBy: 0))
        tap(app.navigationBars.buttons.element(boundBy: 0))
        // Sessions other walkthroughs logged today sit above the seeded ones; scroll down to it.
        let heavy = app.buttons.matching(NSPredicate(format: "label BEGINSWITH[c] 'Heavy singles'")).firstMatch
        for _ in 0..<8 where !(heavy.exists && heavy.isHittable) { app.swipeUp() }
        tap(heavy)
        tap(app.buttons.matching(NSPredicate(format: "label BEGINSWITH[c] 'Barbell bench press'")).firstMatch)
        XCTAssertTrue(app.staticTexts["Best est. 1RM"].waitForExistence(timeout: 5))

        // Timed work shows what exists: top speed and sessions.
        tap(app.navigationBars.buttons.element(boundBy: 0))
        tap(app.navigationBars.buttons.element(boundBy: 0))
        tap(app.navigationBars["History"].buttons["Exercises"])
        tap(app.buttons.matching(NSPredicate(format: "label BEGINSWITH[c] 'Treadmill sprints'")).firstMatch)
        XCTAssertTrue(app.staticTexts["Top speed"].waitForExistence(timeout: 5))
        snap("29 Timed exercise history")
    }

    /// My equipment clears and stays clear; training maxes list every % TM lift.
    func testClearEquipmentAndMaxes() {
        tap(app.tabBars.buttons["Me"])
        for _ in 0..<4 where !(app.buttons["Settings"].exists && app.buttons["Settings"].isHittable) { app.swipeUp() }
        tap(app.buttons["Settings"])
        let kit = app.buttons["my-equipment"]
        for _ in 0..<6 where !(kit.exists && kit.isHittable) { app.swipeUp() }
        tap(kit)
        XCTAssertTrue(app.navigationBars["My equipment"].waitForExistence(timeout: 5))
        // Clearing the kit sticks, rather than coming back on the next sync.
        let tens = app.steppers["plates-10"]
        XCTAssertTrue(tens.waitForExistence(timeout: 5))
        tens.buttons.element(boundBy: 1).tap()
        let clear = app.buttons["clear-equipment"]
        snap("77 My equipment, clear")
        tap(clear)
        XCTAssertFalse(clear.waitForExistence(timeout: 2), "cleared equipment should leave nothing to clear")
        app.navigationBars.buttons.element(boundBy: 0).tap()
        XCTAssertTrue(app.buttons["my-equipment"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["my-equipment"].label.contains("Not set"))

        // Training maxes for every lift a workout loads as % TM, and a way to take them all off.
        tap(app.buttons["training-maxes"])
        XCTAssertTrue(app.navigationBars["Training maxes"].waitForExistence(timeout: 5))
        snap("78 Training maxes")
    }

    /// A past session opened from an exercise's history starts again from there, on last time's loads.
    func testDoItAgainFromExerciseHistory() {
        app.terminate()
        app.launchArguments = ["-seedPace"]
        app.launch()
        let discard = app.alerts.buttons["Discard"]
        if discard.waitForExistence(timeout: 3) { discard.tap() }

        tap(app.tabBars.buttons["History"])
        tap(app.navigationBars["History"].buttons["Exercises"])
        tap(app.buttons.matching(NSPredicate(format: "label BEGINSWITH[c] 'Pull'")).firstMatch)
        let session = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] 'Cindy'")).firstMatch
        for _ in 0..<6 where !(session.exists && session.isHittable) { app.swipeUp() }
        tap(session)
        let again = app.buttons["do-it-again"]
        for _ in 0..<6 where !(again.exists && again.isHittable) { app.swipeUp() }
        snap("80 Session from an exercise's history")
        tap(again)
        XCTAssertTrue(app.buttons["End session"].waitForExistence(timeout: 8), "Do it again should start the timer from here too")
        snap("81 Started again from an exercise's history")
        tap(app.buttons["End session"])
        let drop = app.buttons.matching(NSPredicate(format: "label BEGINSWITH[c] 'Discard'")).firstMatch
        if drop.waitForExistence(timeout: 3) { drop.tap() } else { tap(app.buttons["Finish and save"]); tap(app.buttons["Done"]) }
    }

    /// After the session: the finish screen's count, records, effort and notes, the share card, then
    /// the session in History — edited, started again, and deleted.
    func testAfterTheSession() {
        app.terminate()
        app.launchArguments = ["-seedLogbook"]
        app.launch()
        let discard = app.alerts.buttons["Discard"]
        if discard.waitForExistence(timeout: 3) { discard.tap() }

        // testSettingsAndHealth can leave Health on with its sheet unanswered. This test is about the
        // app's own history, not Health's permission sheets: Health off.
        tap(app.tabBars.buttons["Me"])
        for _ in 0..<4 where !(app.buttons["Settings"].exists && app.buttons["Settings"].isHittable) { app.swipeUp() }
        tap(app.buttons["Settings"])
        let health = app.switches["Apple Health"]
        for _ in 0..<4 where !(health.exists && health.isHittable) { app.swipeUp() }
        if health.waitForExistence(timeout: 5), (health.value as? String) == "1" {
            health.coordinate(withNormalizedOffset: CGVector(dx: 0.93, dy: 0.5)).tap()
            sleep(1)
        }
        home()

        open("Tabata This")
        tap(app.buttons["Start workout"])
        tap(app.buttons["End session"])
        tap(app.buttons["Finish and save"])
        XCTAssertTrue(app.staticTexts["Workout saved"].waitForExistence(timeout: 10))
        let count = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Workout ' AND label != 'Workout saved'")).firstMatch
        XCTAssertTrue(count.waitForExistence(timeout: 5), "the finish screen should lead with the workout count")
        snap("50 Finish, celebration")

        tap(app.buttons["effort-8"])
        XCTAssertTrue(app.staticTexts["8 · Hard"].waitForExistence(timeout: 3), "one tap sets the effort")
        let notes = app.descendants(matching: .any)["finish-notes"].firstMatch
        tap(notes)
        notes.typeText("Legs gone by round 6")
        app.swipeDown(velocity: .slow)
        snap("51 Finish, effort and notes")

        tap(app.buttons["share-card"])
        XCTAssertTrue(app.images["share-card-image"].waitForExistence(timeout: 5), "Share should show the card")
        snap("52 Share card")
        tap(app.navigationBars["Share"].buttons["Close"])
        tap(app.buttons["Done"])

        // In History the session shows its effort, and every field can be changed.
        tap(app.tabBars.buttons["History"])
        let row = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Tabata This' AND label CONTAINS 'effort 8'")).firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 5), "the effort should show in History")
        snap("53 History with effort")
        row.tap()
        XCTAssertTrue(app.staticTexts["8 · Hard"].waitForExistence(timeout: 5))
        for _ in 0..<3 { app.swipeUp(velocity: .slow) }
        let more = app.buttons["session-duration-Increment"]
        tap(more)
        tap(more)
        snap("54 Session detail, edited")

        // Do it again: the same workout, straight into the timer.
        tap(app.buttons["Do it again"])
        XCTAssertTrue(app.buttons["End session"].waitForExistence(timeout: 5), "Do it again should start the workout")
        tap(app.buttons["End session"])
        tap(app.buttons["Finish and save"])
        tap(app.buttons["Done"])

        // Delete asks first.
        for _ in 0..<3 { app.swipeUp(velocity: .slow) }
        tap(app.buttons["Delete session"])
        XCTAssertTrue(app.buttons["Delete"].waitForExistence(timeout: 3), "delete should ask first")
        snap("55 Delete, confirm")
        app.buttons["Delete"].tap()
        XCTAssertTrue(app.navigationBars["History"].waitForExistence(timeout: 5), "a deleted session closes")
        XCTAssertFalse(app.buttons.matching(NSPredicate(format: "label CONTAINS 'effort 8'")).firstMatch.waitForExistence(timeout: 2), "the deleted session should be gone")

        // A seeded session that set a record: its card carries it.
        // Earlier runs on the same simulator leave sessions above it: scroll until it shows.
        let push = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Push day'")).firstMatch
        for _ in 0..<10 where !(push.exists && push.isHittable) { app.swipeUp(velocity: .slow) }
        tap(push)
        for _ in 0..<3 { app.swipeUp(velocity: .slow) }
        tap(app.buttons["session-share"])
        XCTAssertTrue(app.images["share-card-image"].waitForExistence(timeout: 5))
        snap("56 Share card with a record")
        tap(app.navigationBars["Share"].buttons["Close"])
    }

    func testOwnExerciseAndExport() {
        app.terminate()
        app.launchArguments = ["-seedLogbook"]
        app.launch()
        let discard = app.alerts.buttons["Discard"]
        if discard.waitForExistence(timeout: 3) { discard.tap() }

        // A machine the catalogue does not have, made from the picker and used straight away.
        XCTAssertTrue(app.navigationBars["TigerWorkouts"].waitForExistence(timeout: 10))
        tap(app.buttons["New workout"])
        let name = app.textFields["Name"]
        tap(name)
        name.typeText("Machine day")
        tap(app.buttons["Done"])
        tap(app.buttons["Add exercise"].firstMatch)
        let search = app.searchFields["Exercise"]
        tap(search)
        search.typeText("Hammer chest press")
        snap("38 Picker, offering a new exercise")
        tap(app.buttons["add-new-exercise"])
        XCTAssertTrue(app.navigationBars["New exercise"].waitForExistence(timeout: 5))
        XCTAssertEqual(app.textFields["new-exercise-name"].value as? String, "Hammer chest press", "the search carries over as the name")
        tap(app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Equipment'")).firstMatch)
        tap(app.buttons["Barbell & machines"])
        snap("39 New exercise")
        tap(app.buttons["save-new-exercise"])
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label BEGINSWITH[c] 'Hammer chest press'")).firstMatch.waitForExistence(timeout: 5),
                      "the new exercise should be in the workout")
        snap("40 Workout with your own exercise")

        // It is in the picker from now on, marked as yours.
        tap(app.buttons["Add exercise"].firstMatch)
        tap(app.searchFields["Exercise"])
        app.searchFields["Exercise"].typeText("Hammer")
        XCTAssertTrue(app.staticTexts["yours · kg"].waitForExistence(timeout: 5))
        snap("41 Picker with your own exercise")
        tap(app.buttons.matching(NSPredicate(format: "label BEGINSWITH[c] 'Hammer chest press'")).firstMatch)

        // History out as CSV, from Me.
        tap(app.tabBars.buttons["Me"])
        let export = app.buttons["export-history"]
        for _ in 0..<4 where !(export.exists && export.isHittable) { app.swipeUp() }
        snap("42 Me, export history")
        tap(export)
        XCTAssertTrue(app.otherElements["ActivityListView"].waitForExistence(timeout: 10) || app.navigationBars["UIActivityContentView"].waitForExistence(timeout: 2),
                      "export should open the share sheet")
        sleep(1)
        snap("43 Export share sheet")
    }

    // MARK: - Helpers

    // MARK: - Round 4: gaps and polish

    /// For you ranks from history (a timed Cindy shares its exercises with other benchmarks), and a
    /// session started from it can be thrown away from the timer's X.
    func testForYouAndDiscardFromTimer() {
        app.terminate()
        app.launchArguments = ["-seedPace"]
        app.launch()
        let discard = app.alerts.buttons["Discard"]
        if discard.waitForExistence(timeout: 3) { discard.tap() }

        home()
        let feed = app.segmentedControls.firstMatch
        if feed.waitForExistence(timeout: 5) { feed.buttons["For you"].tap() }
        let forYou = app.descendants(matching: .any)["for-you"].firstMatch
        XCTAssertTrue(forYou.waitForExistence(timeout: 5), "with history, For you should rank picks")
        snap("100 For you, ranked from history")

        let pick = forYou.buttons.firstMatch
        tap(pick)
        tap(app.buttons["Start workout"])
        tap(app.buttons["End session"])
        XCTAssertTrue(app.buttons["Discard"].waitForExistence(timeout: 5), "the timer's X should offer Discard")
        XCTAssertTrue(app.buttons["Keep going"].exists, "Keep going should be offered")
        snap("101 End session: Finish and save, Discard, Keep going")
        app.buttons["Discard"].tap()
        XCTAssertTrue(app.buttons["Start workout"].waitForExistence(timeout: 5), "Discard should close the timer")
        XCTAssertFalse(app.staticTexts["Workout saved"].exists)
    }

    /// A heavier set than ever gets a medal the moment it is ticked; a held + speeds up; Skip can be
    /// undone.
    func testRecordOnTickAndUndo() {
        app.terminate()
        app.launchArguments = ["-seedPace"]
        app.launch()
        let discard = app.alerts.buttons["Discard"]
        if discard.waitForExistence(timeout: 3) { discard.tap() }

        open("Iron Base · Whole Body A")
        tap(app.buttons["Start workout"])
        let startPull = app.buttons["Start Pull"]
        for _ in 0..<60 where !startPull.exists {
            let start = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Start ' AND label != 'Start workout'")).firstMatch
            if start.exists, start.isHittable {
                start.tap()
            } else if app.buttons["Skip"].exists {
                app.buttons["Skip"].tap()
            }
        }
        tap(startPull)
        let load = app.staticTexts["Set 1 load"]
        XCTAssertTrue(load.waitForExistence(timeout: 5))
        let before = Double(load.value as? String ?? "") ?? 0
        app.buttons["Set 1 load, more"].press(forDuration: 2.5)
        let after = Double(load.value as? String ?? "") ?? 0
        XCTAssertGreaterThan(after - before, 5 * 2.5, "holding + should repeat and speed up (\(before) → \(after))")
        snap("102 Load after holding +")

        tap(app.buttons["Tick set 1"])
        XCTAssertTrue(app.images["set-record"].waitForExistence(timeout: 5) || app.descendants(matching: .any)["set-record"].waitForExistence(timeout: 2), "a heavier set than ever should carry a medal")
        usleep(600_000) // let the toast finish sliding in
        snap("103 Record on tick")

        // The rest after it, skipped by mistake, and put back.
        tap(app.buttons["Skip"])
        let undo = app.buttons["undo"]
        XCTAssertTrue(undo.waitForExistence(timeout: 3), "Skip should offer Undo")
        usleep(600_000) // let the toast finish sliding in
        snap("104 Skipped, Undo")
        undo.tap()
        XCTAssertTrue(app.staticTexts["Rest"].waitForExistence(timeout: 3), "Undo should bring the rest back")

        tap(app.buttons["End session"])
        tap(app.buttons["Discard"])
    }

    /// Removing a step from the workout page can be undone.
    func testRemoveStepUndo() {
        open("Tabata This")
        let rower = app.buttons.matching(NSPredicate(format: "label BEGINSWITH[c] 'Rowing machine'")).firstMatch
        XCTAssertTrue(rower.waitForExistence(timeout: 5))
        centre([rower])
        rower.swipeLeft()
        tap(app.buttons["Delete"])
        let undo = app.buttons["undo"]
        XCTAssertTrue(undo.waitForExistence(timeout: 3), "a removed step should offer Undo")
        usleep(600_000) // let the toast finish sliding in
        snap("105 Removed, Undo")
        undo.tap()
        XCTAssertTrue(rower.waitForExistence(timeout: 5), "Undo should put the step back")

        // The removal made a copy of the catalogue workout; take it away again.
        let nav = app.navigationBars["Tabata This (mine)"]
        if nav.waitForExistence(timeout: 3) {
            tap(nav.buttons["Edit"])
            tap(app.buttons["Delete workout"])
            tap(app.buttons["Delete"].firstMatch)
        }
    }

    /// After the session: sets added and removed, and the score put right.
    func testFixASessionAfterwards() {
        app.terminate()
        app.launchArguments = ["-seedPace"]
        app.launch()
        let discard = app.alerts.buttons["Discard"]
        if discard.waitForExistence(timeout: 3) { discard.tap() }

        tap(app.tabBars.buttons["History"])
        // The seeded 20-minute Cindy, not a short one another walkthrough logged.
        let cindy = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Cindy' AND label CONTAINS '20 min'")).firstMatch
        for _ in 0..<8 where !(cindy.exists && cindy.isHittable) { app.swipeUp(velocity: .slow) }
        tap(cindy)
        // Sets first: Edit sets sits near the top of the session.
        let edit = app.buttons["edit-sets"]
        for _ in 0..<6 where !(edit.exists && edit.isHittable) { app.swipeUp(velocity: .slow) }
        tap(edit)
        let add = app.buttons["add-set-bw_pullup"]
        XCTAssertTrue(add.waitForExistence(timeout: 5), "Edit sets should offer Add set")
        reveal(add)
        add.tap()
        XCTAssertTrue(app.buttons["remove-set-bw_pullup-8"].waitForExistence(timeout: 3), "Add set should add a ninth set")
        snap("107 Set added")
        app.buttons["remove-set-bw_pullup-8"].tap()
        XCTAssertFalse(app.buttons["remove-set-bw_pullup-8"].waitForExistence(timeout: 2), "the added set should go again")

        // Then the score, further down.
        let rounds = app.buttons["score-rounds-Increment"]
        for _ in 0..<10 where !(rounds.exists && rounds.isHittable) { app.swipeUp(velocity: .slow) }
        XCTAssertTrue(rounds.waitForExistence(timeout: 5), "an AMRAP's score should be editable")
        rounds.tap()
        snap("106 Score corrected")
    }

    /// The logbook chart: another line for a lift, and a shorter range.
    func testChartMetricAndRange() {
        app.terminate()
        app.launchArguments = ["-seedLogbook"]
        app.launch()
        let discard = app.alerts.buttons["Discard"]
        if discard.waitForExistence(timeout: 3) { discard.tap() }

        tap(app.tabBars.buttons["History"])
        tap(app.navigationBars["History"].buttons["Exercises"])
        tap(app.buttons.matching(NSPredicate(format: "label BEGINSWITH[c] 'Barbell bench press'")).firstMatch)
        tap(app.buttons["Volume"])
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Volume'")).firstMatch.waitForExistence(timeout: 3))
        tap(app.buttons["3 m"])
        snap("108 Chart, volume over 3 months")
    }

    /// Sign in: Apple first, then Google, then an email code.
    func testSignInOptions() {
        app.terminate()
        app.launchEnvironment["UITEST_APPLE_SIGN_IN"] = "1"
        app.launch()
        tap(app.tabBars.buttons["Me"])
        let signIn = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Sign in'")).firstMatch
        guard signIn.waitForExistence(timeout: 5) else { return } // already signed in on this simulator
        signIn.tap()
        XCTAssertTrue(app.buttons["sign-in-apple"].waitForExistence(timeout: 5), "Sign in with Apple should be offered")
        snap("109 Sign in, Apple first")
        tap(app.buttons["Cancel"])
    }

    /// Mid-session, the Session sheet's set grid for a treadmill block has an Incline row.
    func testSessionSheetIncline() {
        open("Engine Room · Ten by One")
        tap(app.buttons["Start workout"])
        XCTAssertTrue(app.buttons["End session"].waitForExistence(timeout: 5))
        tap(app.buttons["Session overview"])
        let incline = app.descendants(matching: .any)["grid-incline"]
        for _ in 0..<4 where !(incline.exists && incline.isHittable) { app.swipeUp(velocity: .slow) }
        XCTAssertTrue(incline.waitForExistence(timeout: 5), "the treadmill block's grid should show its incline")
        snap("111 Session sheet, treadmill incline")
        tap(app.buttons["Close"])
        tap(app.buttons["End session"])
        tap(app.buttons["Discard"])
    }

    /// The first session asks once for notifications, for the end of a rest in the background.
    func testRestNotificationAsked() {
        app.terminate()
        app.launchEnvironment["UITEST_NO_PROMPTS"] = nil
        app.launch()
        let discard = app.alerts.buttons["Discard"]
        if discard.waitForExistence(timeout: 3) { discard.tap() }
        open("Tabata This")
        tap(app.buttons["Start workout"])
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let allow = springboard.alerts.buttons["Allow"]
        if allow.waitForExistence(timeout: 5) {
            snap("110 Notifications asked at the first session")
            allow.tap()
        }
        tap(app.buttons["End session"])
        tap(app.buttons["Discard"])
        app.launchEnvironment["UITEST_NO_PROMPTS"] = "1"
    }

    private func open(_ title: String) {
        XCTAssertTrue(app.navigationBars["TigerWorkouts"].waitForExistence(timeout: 10))
        let search = app.searchFields.firstMatch
        if !search.exists { app.swipeDown() }
        tap(search)
        search.typeText(title)
        // BEGINSWITH would also match a copy an earlier run saved as "<title> (mine)".
        let exact = app.buttons.matching(NSPredicate(format: "label == %@ OR label BEGINSWITH %@", title, title + ",")).firstMatch
        // Copies ("<title> (mine)") list first; the catalogue row can sit below them, out of the
        // lazily built list until it is scrolled to.
        if !exact.waitForExistence(timeout: 2) {
            app.keyboards.buttons["search"].firstMatch.tap()
            for _ in 0..<15 where !exact.waitForExistence(timeout: 1) {
                app.scrollViews.firstMatch.swipeUp(velocity: .slow)
            }
        }
        let row = exact.exists ? exact : app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", title)).firstMatch
        tap(row)
        XCTAssertTrue(app.buttons["Start workout"].waitForExistence(timeout: 5))
    }

    /// Back to the top of the Workouts tab with the search cleared, where the Up next card lives.
    private func home() {
        tap(app.tabBars.buttons["Workouts"])
        for _ in 0..<3 where !app.navigationBars["TigerWorkouts"].exists {
            app.navigationBars.buttons.element(boundBy: 0).tap()
        }
        // The search that found the workout is still filled in; the card only shows without one.
        let clear = app.navigationBars["TigerWorkouts"].buttons["Clear text"]
        if clear.exists { clear.tap() }
        for label in ["Close", "Cancel"] where app.navigationBars["TigerWorkouts"].buttons[label].exists {
            app.navigationBars["TigerWorkouts"].buttons[label].tap()
        }
        XCTAssertTrue(app.navigationBars["TigerWorkouts"].waitForExistence(timeout: 5))
    }

    private func tap(_ element: XCUIElement, file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertTrue(element.waitForExistence(timeout: 8), "missing: \(element)", file: file, line: line)
        element.tap()
    }

    /// Scrolls until the elements sit in the middle band of the screen: clear of the navigation
    /// bar and the Start bar, and of the edges where a drag makes a list auto-scroll. Each scroll
    /// ends in a hold so it stops where it was dragged to instead of flinging on.
    private func centre(_ elements: [XCUIElement], file: StaticString = #filePath, line: UInt = #line) {
        let screen = app.windows.firstMatch.frame
        let band = (screen.minY + screen.height * 0.2)...(screen.minY + screen.height * 0.7)
        for _ in 0..<6 {
            let top = elements.map(\.frame.minY).min() ?? 0
            let bottom = elements.map(\.frame.maxY).max() ?? 0
            if band.contains(top), band.contains(bottom) { return }
            let shift = (band.lowerBound + band.upperBound) / 2 - (top + bottom) / 2
            // A drag this short would land as a tap on a row.
            if abs(shift) < 20 { return }
            let from = app.windows.firstMatch.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: shift < 0 ? 0.65 : 0.35))
            from.press(forDuration: 0.05, thenDragTo: from.withOffset(CGVector(dx: 0, dy: shift)), withVelocity: .slow, thenHoldForDuration: 0.4)
        }
        XCTFail("could not scroll \(elements) into the middle of the screen", file: file, line: line)
    }

    /// Scrolls down a third of the screen at a time, each step held so the list stops there,
    /// until the element is on screen.
    private func reveal(_ element: XCUIElement, file: StaticString = #filePath, line: UInt = #line) {
        let window = app.windows.firstMatch
        for _ in 0..<8 where !(element.exists && element.isHittable) {
            let from = window.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.65))
            from.press(forDuration: 0.05, thenDragTo: from.withOffset(CGVector(dx: 0, dy: -window.frame.height / 3)), withVelocity: .slow, thenHoldForDuration: 0.4)
        }
        XCTAssertTrue(element.isHittable, "could not scroll to \(element)", file: file, line: line)
    }

    /// Hold a row until the list lifts it, move it slowly onto the top edge of another, and hold
    /// there before letting go. A 0.8 s press followed by a fast move was a race: on a busy
    /// simulator the list lifted the row only after the finger had already moved, so the row went
    /// back where it was (seen on the screen recording of a failed full run). The slow move and
    /// the hold at the end give the list time to lift the row and to settle on where it lands.
    private func drag(_ row: XCUIElement, onto target: XCUIElement) {
        // The top edge of the target, not its middle: a row with history is taller ("last time"
        // under the name), and a drop on its middle lands below it.
        row.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
            .press(forDuration: 1.2, thenDragTo: target.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.1)),
                   withVelocity: .slow, thenHoldForDuration: 0.6)
    }

    /// Polls a condition on the screen until it holds, instead of sleeping a fixed time and hoping.
    private func waitFor(_ message: String, timeout: TimeInterval = 5, file: StaticString = #filePath, line: UInt = #line, _ condition: @escaping () -> Bool) {
        let met = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in condition() }, object: nil)
        XCTAssertEqual(XCTWaiter().wait(for: [met], timeout: timeout), .completed, message, file: file, line: line)
    }

    private func snap(_ name: String) {
        let shot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        shot.name = name
        shot.lifetime = .keepAlways
        add(shot)
    }

    /// Today's target and a stall, from seeded history: Jack at 7, 7 and 8 rounds, kettlebell swings
    /// stuck at 24 kg × 10 for five weeks.
    func testProgress() {
        app.terminate()
        app.launchArguments = ["-seedProgress"]
        app.launch()
        let discard = app.alerts.buttons["Discard"]
        if discard.waitForExistence(timeout: 3) { discard.tap() }

        XCTAssertTrue(app.descendants(matching: .any)["today-target"].waitForExistence(timeout: 10), "Up next should carry a Today target")
        XCTAssertTrue(app.descendants(matching: .any)["stall-line"].exists, "a stalled exercise should get one line on Up next")
        snap("60 Up next with Today and a stall")

        // The stall line opens the exercise's logbook, where the two options are.
        tap(app.descendants(matching: .any)["stall-line"])
        XCTAssertTrue(app.descendants(matching: .any)["stall-card"].waitForExistence(timeout: 5), "the logbook should show the stall")
        snap("61 Exercise logbook with a stall")
        tap(app.navigationBars.buttons.element(boundBy: 0))

        tap(app.buttons["up-next"])
        XCTAssertTrue(app.descendants(matching: .any)["today-target"].waitForExistence(timeout: 5), "the workout page should carry the Today target")
        snap("62 Workout page with Today")
        tap(app.buttons["Start workout"])
        let target = app.descendants(matching: .any)["target"]
        let start = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Start ' AND label != 'Start workout'")).firstMatch
        for _ in 0..<20 where !target.exists {
            if start.exists, start.isHittable { start.tap() } else if app.buttons["Done"].exists { app.buttons["Done"].tap() } else if app.buttons["Skip"].exists { app.buttons["Skip"].tap() }
            _ = target.waitForExistence(timeout: 1)
        }
        XCTAssertTrue(target.exists, "the AMRAP should show today's target")
        snap("63 Timer with today's target")
        tap(app.buttons["End session"])
        tap(app.buttons["Finish and save"])
        let next = app.descendants(matching: .any)["next-time"]
        for _ in 0..<4 where !(next.exists && next.isHittable) { app.swipeUp() }
        snap("64 Finish with Next time")
        tap(app.buttons["Done"])

        // Settings: how hard the suggestions push.
        tap(app.tabBars.buttons["Me"])
        for _ in 0..<4 where !(app.buttons["Settings"].exists && app.buttons["Settings"].isHittable) { app.swipeUp() }
        tap(app.buttons["Settings"])
        let overreach = app.buttons["Overreach"]
        for _ in 0..<6 where !(overreach.exists && overreach.isHittable) { app.swipeUp() }
        app.swipeUp()
        snap("65 Settings, suggestions")
        tap(app.tabBars.buttons["Discover"].exists ? app.tabBars.buttons["Discover"] : app.tabBars.buttons.element(boundBy: 0))
    }


    /// Set types, the plate calculator, a % of a training max and a shared warm-up, from a seeded
    /// workout of your own ("Loads check").
    func testLoadsAndSetTypes() {
        app.terminate()
        app.launchArguments = ["-seedLoads"]
        app.launch()
        let discard = app.alerts.buttons["Discard"]
        if discard.waitForExistence(timeout: 3) { discard.tap() }

        open("Loads check")
        XCTAssertTrue(app.descendants(matching: .any)["ref-row"].waitForExistence(timeout: 5), "the embedded warm-up should be listed")
        snap("70 Workout page, shared warm-up and training maxes")
        let grid = app.descendants(matching: .any)["set-grid"].firstMatch
        for _ in 0..<6 where !(grid.exists && grid.isHittable) { app.swipeUp(velocity: .slow) }
        XCTAssertTrue(app.buttons["Set 1: Warm-up"].waitForExistence(timeout: 5), "the plan's warm-up shows as W")
        snap("71 Set types in the editor")

        tap(app.buttons["Start workout"])
        XCTAssertTrue(app.buttons["End session"].waitForExistence(timeout: 5))
        // Through the shared warm-up to the bench block's gate.
        let startBench = app.buttons["Start Bench"]
        for _ in 0..<40 where !startBench.exists {
            let start = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Start ' AND label != 'Start workout'")).firstMatch
            if start.exists, start.isHittable { start.tap() } else if app.buttons["Skip"].exists { app.buttons["Skip"].tap() } else if app.buttons["Done"].exists { app.buttons["Done"].tap() }
            _ = startBench.waitForExistence(timeout: 1)
        }
        tap(startBench)
        XCTAssertTrue(app.buttons["Tick set 1"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Set 4: Drop set"].exists, "the drop set shows as D")
        snap("72 Set types on the timer")

        tap(app.buttons["Plates for 60 kg"].firstMatch)
        XCTAssertTrue(app.staticTexts["20 kg bar + 20 per side"].waitForExistence(timeout: 5), "the calculator should load 60 kg as a 20 each side")
        snap("73 Plate calculator")
        // Close it by a tap above the sheet. A swipe from the screen's middle started above the
        // half sheet on a Pro Max, and a swipe on the sheet's text did not move it either.
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.12)).tap()
        XCTAssertFalse(app.staticTexts["20 kg bar + 20 per side"].waitForExistence(timeout: 2) && app.staticTexts["20 kg bar + 20 per side"].isHittable, "the plate sheet should close")
        XCTAssertTrue(app.buttons["Tick set 1"].waitForExistence(timeout: 5))

        // A tap on a set number changes its type: set 3 becomes a warm-up.
        tap(app.buttons["Set 3: Normal"].firstMatch)
        XCTAssertTrue(app.buttons["Set 3: Warm-up"].firstMatch.waitForExistence(timeout: 5), "a tap steps normal to warm-up")
        snap("74 Set 3 changed to a warm-up on the timer")

        tap(app.buttons["End session"])
        tap(app.buttons["Finish and save"])
        tap(app.buttons["Done"])

        tap(app.tabBars.buttons["Me"])
        for _ in 0..<4 where !(app.buttons["Settings"].exists && app.buttons["Settings"].isHittable) { app.swipeUp() }
        tap(app.buttons["Settings"])
        let kit = app.buttons["my-equipment"]
        for _ in 0..<6 where !(kit.exists && kit.isHittable) { app.swipeUp() }
        snap("75 Settings, loads")
        tap(kit)
        XCTAssertTrue(app.navigationBars["My equipment"].waitForExistence(timeout: 5))
        snap("76 My equipment")

    }

    /// Timed and distance work, from a seeded workout of your own ("Row intervals") done twice: the
    /// round times against last time and the logged sets on the session, a set edited afterwards,
    /// the rower's pace chart, then metres counted on the timer and a hold ended early.
    func testTimedAndDistance() {
        app.terminate()
        app.launchArguments = ["-seedTimed"]
        app.launch()
        let discard = app.alerts.buttons["Discard"]
        if discard.waitForExistence(timeout: 3) { discard.tap() }

        tap(app.tabBars.buttons["History"])
        XCTAssertTrue(app.navigationBars["History"].waitForExistence(timeout: 5))
        // Newest first: the seeded session a day back is near the top, under anything this run logged.
        let session = app.staticTexts["Row intervals"].firstMatch
        for _ in 0..<8 where !(session.exists && session.isHittable) { app.swipeUp(velocity: .slow) }
        tap(session)
        let rounds = app.descendants(matching: .any)["round-times"]
        XCTAssertTrue(rounds.waitForExistence(timeout: 5), "a circuit's session should show its round times")
        for _ in 0..<3 where !app.buttons["edit-sets"].isHittable { app.swipeUp(velocity: .slow) }
        snap("90 Session, round times and sets")

        tap(app.buttons["edit-sets"])
        let seconds = app.textFields["set-cardio_rower-0-seconds"]
        XCTAssertTrue(seconds.waitForExistence(timeout: 5), "editing should offer the row's time")
        snap("91 Editing logged sets")
        seconds.tap()
        seconds.press(forDuration: 1.0)
        if app.menuItems["Select All"].waitForExistence(timeout: 2) { app.menuItems["Select All"].tap() }
        seconds.typeText("52")
        tap(app.buttons["edit-sets"]) // Done: the edit is saved
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS '250 m in 52 s'")).firstMatch.waitForExistence(timeout: 5), "the edited time should show on the set")
        snap("92 Set edited")

        tap(app.buttons.matching(NSPredicate(format: "label CONTAINS 'Rowing machine'")).firstMatch)
        XCTAssertTrue(app.staticTexts["Fastest pace · per 500 m"].waitForExistence(timeout: 5), "a timed distance should chart its pace")
        snap("93 Rower logbook, pace and fastest times")

        tap(app.tabBars.buttons["Discover"].exists ? app.tabBars.buttons["Discover"] : app.tabBars.buttons.element(boundBy: 0))
        open("Row intervals")
        tap(app.buttons["Start workout"])
        // The first block starts after the lead-in, with no gate.
        XCTAssertTrue(app.staticTexts["amount-done"].waitForExistence(timeout: 12), "a distance should have its metres to change")
        tap(app.buttons["More metres"])
        snap("94 Timer, metres done")
        tap(app.buttons["Done"])
        let early = app.buttons["Done early"]
        XCTAssertTrue(early.waitForExistence(timeout: 5), "a hold should end with Done early")
        sleep(3)
        snap("95 Hold, Done early")
        tap(early)
        tap(app.buttons["End session"])
        tap(app.buttons["Finish and save"])
        XCTAssertTrue(app.staticTexts["Workout saved"].waitForExistence(timeout: 10))
        snap("96 Finished, round times")
        tap(app.buttons["Done"])
    }

    /// Pause is big on the lead-in, "Set 1 of 10 done" on the burpees; Finish is in the ⋯ menu.
    func testTimerControls() {
        open("EMOM 10: 5 burpees")
        tap(app.buttons["Start workout"])
        XCTAssertTrue(app.buttons["Pause"].waitForExistence(timeout: 5), "a countdown's big button is Pause")
        XCTAssertTrue(app.buttons["Set 1 of 10 done"].waitForExistence(timeout: 12), "a set's big button says which set it logs")
        XCTAssertEqual(app.buttons["Skip"].label, "Skip this step")
        snap("110 Set 1 of 10 done")
        tap(app.buttons["Session menu"])
        XCTAssertTrue(app.buttons["Discard"].waitForExistence(timeout: 5), "the ⋯ menu should offer Discard")
        tap(app.buttons["Finish and save"])
        XCTAssertTrue(app.staticTexts["Workout saved"].waitForExistence(timeout: 10), "Finish and save should save the session")
        tap(app.buttons["Done"])
    }

    /// Eight sets of swings: the set you are on comes into view without a swipe, and the table
    /// fades out only at an edge with more of it behind.
    func testSetTableFollowsTheSet() {
        open("Tabata Kettlebell Swings")
        tap(app.buttons["Start workout"])
        XCTAssertTrue(app.buttons["Tick set 1"].waitForExistence(timeout: 12), "the swings should run as a set table")
        let rows = app.scrollViews["set-rows"]
        XCTAssertFalse((rows.value as? String ?? "").contains("faded top"), "at the top of the table nothing fades above set 1")
        // The window onto the table, for a side-by-side with main (the header is not pinned).
        let height = XCTAttachment(string: "set table window \(rows.frame.height) pt")
        height.name = "Set table window height"
        height.lifetime = .keepAlways
        add(height)
        snap("120 Set table at the top, no fade above")

        // Each set ended by its tick (set 3 by a tap on set 3), each rest skipped, up to set 7.
        for n in 1...6 {
            let tick = app.buttons["Tick set \(n)"]
            XCTAssertTrue(tick.waitForExistence(timeout: 5))
            if n == 6 {
                XCTAssertTrue(tick.isHittable, "after a tap on set 3, set 6 should come into view on its own")
            }
            tick.tap()
            XCTAssertTrue(app.buttons["Un-tick set \(n)"].waitForExistence(timeout: 5))
            // "Done early" is on a timed set and gone in the rest. ("Rest" is also on the page under the timer.)
            let early = app.buttons["Done early"]
            expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: early)
            waitForExpectations(timeout: 5)
            tap(app.buttons["Skip"])
            XCTAssertTrue(early.waitForExistence(timeout: 5), "skipping the rest should start set \(n + 1)")
        }

        // Set 7 runs out on its 20 s clock; set 8 is next, and in view.
        XCTAssertTrue(app.buttons["Un-tick set 7"].waitForExistence(timeout: 30), "set 7 should end by its timer")
        sleep(1)
        XCTAssertTrue(app.buttons["Tick set 8"].isHittable, "set 8 should be on screen without a scroll")
        XCTAssertTrue((rows.value as? String ?? "").contains("faded top"), "with sets above, the top edge should fade")
        snap("121 Set table on set 8, sets above fade")

        tap(app.buttons["Session menu"])
        tap(app.buttons["Finish and save"])
        XCTAssertTrue(app.staticTexts["Workout saved"].waitForExistence(timeout: 10))
        tap(app.buttons["Done"])
    }

    /// Treadmill sprints counted in metres: the set being done has −/+ on speed, metres and incline,
    /// and none of them is pushed past the edge of the table.
    func testSetTableInclineOnMetres() {
        open("Engine Room · Ten by One")
        tap(app.buttons.matching(NSPredicate(format: "label BEGINSWITH[c] 'Treadmill sprints'")).firstMatch)
        tap(app.buttons.matching(NSPredicate(format: "label BEGINSWITH[c] 'How long or how many'")).firstMatch)
        tap(app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Measured in'")).firstMatch)
        tap(app.buttons["Metres"])
        for done in ["Done", "Done", "Start workout"] { tap(app.buttons[done]) }
        // Past the lead-in and the warm-up walk, then start the parked block.
        for _ in 0..<4 where !app.buttons["Tick set 1"].waitForExistence(timeout: 3) { tap(app.buttons["Skip"].exists ? app.buttons["Skip"] : app.buttons["Start Ten by one"]) }
        let table = app.descendants(matching: .any)["timer-set-grid"]
        let names = ["Set 1 load, less", "Set 1 load, more", "Set 1 incline, less", "Set 1 incline, more", "Set 1 m, less", "Set 1 m, more", "Tick set 1"]
        let frames = names.map { table.buttons[$0].frame }
        for (i, at) in frames.enumerated() {
            XCTAssertTrue(table.frame.minX <= at.minX && at.maxX <= table.frame.maxX && !frames[(i + 1)...].contains { at.insetBy(dx: 1, dy: 1).intersects($0) }, "\(names[i]) at \(at) is outside \(table.frame) or under another control: \(frames)") }
        snap("125 Set table, metres and incline")
        tap(app.buttons["End session"])
        tap(app.buttons["Discard"])
    }

}
