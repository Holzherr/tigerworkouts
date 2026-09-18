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
        tap(app.buttons["Done"])

        tap(app.tabBars.buttons["History"])
        snap("10 History")
    }

    func testWriteAWorkout() {
        XCTAssertTrue(app.navigationBars["Tiger"].waitForExistence(timeout: 10))
        tap(app.buttons["Write a workout"])
        XCTAssertTrue(app.navigationBars["New workout"].waitForExistence(timeout: 5))
        snap("11 New workout")

        let name = app.textFields["Name"]
        tap(name)
        name.typeText("Swings and sprints")

        tap(app.buttons["Add exercise"])
        XCTAssertTrue(app.navigationBars["Add exercise"].waitForExistence(timeout: 5))
        snap("12 Exercise picker")
        let search = app.searchFields["Exercise"]
        tap(search)
        search.typeText("Kettlebell swing")
        tap(app.buttons.matching(NSPredicate(format: "label BEGINSWITH[c] 'Kettlebell swing'")).firstMatch)

        XCTAssertTrue(app.buttons["Save"].waitForExistence(timeout: 5))
        snap("13 Editor with an exercise")
        XCTAssertTrue(app.buttons["Save"].isEnabled, "a named workout with one exercise should save")

        tap(app.buttons.matching(NSPredicate(format: "label BEGINSWITH[c] 'Kettlebell swing'")).firstMatch)
        XCTAssertTrue(app.navigationBars["Step"].waitForExistence(timeout: 5))
        snap("14 Step editor")
        tap(app.buttons["Done"])

        tap(app.buttons["Save"])
        XCTAssertTrue(app.staticTexts["Mine"].waitForExistence(timeout: 5), "a saved workout should appear under Mine")
        snap("15 Workouts with Mine")
    }

    func testSettingsAndHealth() {
        tap(app.tabBars.buttons["Me"])
        XCTAssertTrue(app.navigationBars["Me"].waitForExistence(timeout: 5))
        snap("16 Me")

        let health = app.switches["Apple Health"]
        XCTAssertTrue(health.waitForExistence(timeout: 5))
        // A SwiftUI toggle flips on its knob, not on the middle of the row, which is the label.
        health.coordinate(withNormalizedOffset: CGVector(dx: 0.93, dy: 0.5)).tap()
        // The permission sheet is the system's, presented over the app.
        sleep(4)
        snap("17 Health permission")
        XCTAssertFalse(app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] 'entitlement'")).firstMatch.exists,
                       "HealthKit refused for want of the entitlement")
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

    // MARK: - Helpers

    private func open(_ title: String) {
        XCTAssertTrue(app.navigationBars["Tiger"].waitForExistence(timeout: 10))
        let search = app.searchFields.firstMatch
        if !search.exists { app.swipeDown() }
        tap(search)
        search.typeText(title)
        let row = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", title)).firstMatch
        tap(row)
        XCTAssertTrue(app.buttons["Start workout"].waitForExistence(timeout: 5))
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
