import XCTest

/// The setup question and the week-by-week table (Priyanka via Nick, 15 Nov 2026), from seeded
/// history: "Hip thrust focus week 1" run three weeks, duplicated into week 2 and run once.
final class ProgressTableUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUp() {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchEnvironment["UITEST_NO_PROMPTS"] = "1"
        app.launchEnvironment["UITEST_MUTE"] = "1"
        app.launchArguments = ["-seedWeeks", "-seedWeeksAsk"]
        app.launch()
        let discard = app.alerts.buttons["Discard"]
        if discard.waitForExistence(timeout: 3) { discard.tap() }
    }

    func testSetupQuestionAndWeekByWeek() {
        open("Hip thrust focus week 2")
        let setup = app.descendants(matching: .any)["suggest-setup"].firstMatch
        XCTAssertTrue(setup.waitForExistence(timeout: 8), "a workout with a loaded lift asks once how to progress")
        scrollTo(setup)
        snap("P1 Want suggestions on how to progress?")
        tap(app.buttons["suggest-yes"])
        XCTAssertTrue(app.buttons["progress-by-weight"].waitForExistence(timeout: 5))
        snap("P2 Progress by reps, weight or effort?")
        tap(app.buttons["progress-by-weight"])
        XCTAssertTrue(setup.waitForNonExistence(timeout: 5), "answered, the question goes")

        let entry = app.descendants(matching: .any)["week-by-week"].firstMatch
        scrollTo(entry)
        snap("P3 Week by week on the workout page")
        tap(entry)
        XCTAssertTrue(app.descendants(matching: .any)["progress-table"].firstMatch.waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Wk 4"].exists || app.staticTexts["Wk 3"].exists, "week 1's sessions sit beside week 2's")
        snap("P4 Week by week table")

        tap(app.buttons["progress-exercise-bb_hip_thrust"])
        XCTAssertTrue(app.navigationBars.staticTexts.firstMatch.waitForExistence(timeout: 5))
        snap("P5 The exercise across every workout")
    }

    /// Priyanka's week one: Today names the shoulder press at 27.5 × 8, and the player's press set
    /// starts on it (the hip thrust's ramping sets get no target).
    func testWeekOneTodayMatchesThePlayer() {
        app.terminate()
        app.launchArguments = ["-seedWeekOne"]
        app.launch()
        let discard = app.alerts.buttons["Discard"]
        if discard.waitForExistence(timeout: 3) { discard.tap() }
        open("Hip thrust focus week 1")
        let today = app.buttons["today-target"]
        XCTAssertTrue(today.waitForExistence(timeout: 5))
        XCTAssertTrue(today.label.contains("Shoulder press") && today.label.contains("27.5"), today.label)
        snap("W1 Today: shoulder press 27.5 × 8")
        tap(app.buttons["Start workout"])
        let target = app.descendants(matching: .any)["target"].firstMatch
        for _ in 0..<30 {
            if target.exists, target.label.contains("27.5") { break }
            let skip = app.buttons["Skip"]
            if skip.waitForExistence(timeout: 2) { skip.tap() } else { break }
        }
        XCTAssertTrue(target.waitForExistence(timeout: 3) && target.label.contains("27.5"), "the press's target in the player")
        snap("W2 Player: shoulder press set")
        let grid = app.descendants(matching: .any)["timer-set-grid"].firstMatch
        if grid.exists { XCTAssertTrue(grid.label.contains("27.5") || app.staticTexts.matching(NSPredicate(format: "label CONTAINS '27.5'")).count > 1) }
    }

    private func open(_ title: String) {
        XCTAssertTrue(app.navigationBars["Workouts"].waitForExistence(timeout: 10))
        let search = app.searchFields.firstMatch
        if !search.exists { app.swipeDown() }
        tap(search)
        search.typeText(title)
        let row = app.buttons.matching(NSPredicate(format: "label == %@ OR label BEGINSWITH %@", title, title + ",")).firstMatch
        if !row.waitForExistence(timeout: 3) { app.keyboards.buttons["search"].firstMatch.tap() }
        tap(row)
    }

    private func scrollTo(_ e: XCUIElement) {
        for _ in 0..<8 where !(e.exists && e.isHittable) { app.swipeUp(velocity: .slow) }
    }

    private func tap(_ e: XCUIElement, file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertTrue(e.waitForExistence(timeout: 8), "missing: \(e)", file: file, line: line)
        e.tap()
    }

    private func snap(_ name: String) {
        let shot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        shot.name = name
        shot.lifetime = .keepAlways
        add(shot)
    }
}
