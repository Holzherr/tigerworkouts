import XCTest

/// Walks the app the way it gets used and attaches a screenshot at each stop. It is a smoke test
/// first — every step waits for the thing it needs and fails loudly if it is missing — and a
/// visual record second: `xcrun xcresulttool export attachments` pulls the pictures out.
final class WalkthroughUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUp() {
        continueAfterFailure = false
        app = XCUIApplication()
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

    func testBrowseRunAndFinish() {
        XCTAssertTrue(app.navigationBars["Tiger"].waitForExistence(timeout: 10))
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

        // The five-second lead-in runs out on its own.
        XCTAssertTrue(app.buttons["Done"].waitForExistence(timeout: 10))
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

        let heading = app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] 'if it is busy'")).firstMatch
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

    /// The workout page is the editor: drag, remove and add without finding an edit mode.
    func testEditOnTheWorkoutPage() {
        open("Tabata This")
        let rower = app.buttons.matching(NSPredicate(format: "label BEGINSWITH[c] 'Rowing machine'")).firstMatch
        let rest = app.buttons.matching(NSPredicate(format: "label BEGINSWITH[c] 'Rest'")).firstMatch
        XCTAssertTrue(rower.waitForExistence(timeout: 5))
        XCTAssertLessThan(rower.frame.minY, rest.frame.minY)
        snap("21 Workout page, editable")

        // Hold and drag the rest above the rower.
        // Onto the top edge of the row, not its middle: a row with history is taller ("last time"
        // under the name), and a drop on its middle lands below it.
        rest.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
            .press(forDuration: 0.8, thenDragTo: rower.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.1)))
        sleep(1)
        XCTAssertLessThan(rest.frame.minY, rower.frame.minY, "dragging should reorder in place")

        // A catalogue workout is never written over: the first edit silently makes it yours.
        XCTAssertTrue(app.navigationBars["Tabata This (mine)"].waitForExistence(timeout: 5))
        snap("22 Reordered, now my copy")

        // A block moves as a whole by its header: drag Pull-up above Squat.
        let squat = app.buttons.matching(NSPredicate(format: "label BEGINSWITH[c] 'Tabata Squat'")).firstMatch
        let pullup = app.buttons.matching(NSPredicate(format: "label BEGINSWITH[c] 'Tabata Pull-up'")).firstMatch
        XCTAssertTrue(squat.waitForExistence(timeout: 3))
        for _ in 0..<4 where !(squat.isHittable && pullup.isHittable) {
            app.swipeUp(velocity: .slow)
        }
        XCTAssertLessThan(squat.frame.minY, pullup.frame.minY)
        pullup.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
            .press(forDuration: 0.8, thenDragTo: squat.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.1)))
        sleep(1)
        XCTAssertLessThan(pullup.frame.minY, squat.frame.minY, "dragging a header should move the whole block")
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
    }

    func testWriteAWorkout() {
        XCTAssertTrue(app.navigationBars["Tiger"].waitForExistence(timeout: 10))
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

    // MARK: - Helpers

    private func open(_ title: String) {
        XCTAssertTrue(app.navigationBars["Tiger"].waitForExistence(timeout: 10))
        let search = app.searchFields.firstMatch
        if !search.exists { app.swipeDown() }
        tap(search)
        search.typeText(title)
        // BEGINSWITH would also match a copy an earlier run saved as "<title> (mine)".
        let exact = app.buttons.matching(NSPredicate(format: "label == %@ OR label BEGINSWITH %@", title, title + ",")).firstMatch
        let row = exact.exists ? exact : app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", title)).firstMatch
        tap(row)
        XCTAssertTrue(app.buttons["Start workout"].waitForExistence(timeout: 5))
    }

    /// Back to the top of the Workouts tab with the search cleared, where the Up next card lives.
    private func home() {
        tap(app.tabBars.buttons["Workouts"])
        for _ in 0..<3 where !app.navigationBars["Tiger"].exists {
            app.navigationBars.buttons.element(boundBy: 0).tap()
        }
        // The search that found the workout is still filled in; the card only shows without one.
        let clear = app.navigationBars["Tiger"].buttons["Clear text"]
        if clear.exists { clear.tap() }
        for label in ["Close", "Cancel"] where app.navigationBars["Tiger"].buttons[label].exists {
            app.navigationBars["Tiger"].buttons[label].tap()
        }
        XCTAssertTrue(app.navigationBars["Tiger"].waitForExistence(timeout: 5))
    }

    private func tap(_ element: XCUIElement, file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertTrue(element.waitForExistence(timeout: 8), "missing: \(element)", file: file, line: line)
        element.tap()
    }

    private func snap(_ name: String) {
        let shot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        shot.name = name
        shot.lifetime = .keepAlways
        add(shot)
    }
}
