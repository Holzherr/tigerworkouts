import XCTest

/// The App Store screenshots, taken from seeded history on a clean simulator. Skipped unless asked
/// for, so it never slows the walkthroughs: `ios/screenshots.sh` runs it and files the pictures in
/// `fastlane/screenshots/`.
final class AppStoreScreenshotsUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        try XCTSkipUnless(ProcessInfo.processInfo.environment["APPSTORE_SHOTS"] == "1", "App Store screenshots run only from screenshots.sh")
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchEnvironment["UITEST_NO_PROMPTS"] = "1"
        app.launchArguments = ["-seedLogbook", "-seedProgress", "-seedLoads", "-seedArmsAbs"]
        app.launch()
        let discard = app.alerts.buttons["Discard"]
        if discard.waitForExistence(timeout: 3) { discard.tap() }
    }

    func testAppStoreScreenshots() {
        XCTAssertTrue(app.navigationBars["Workouts"].waitForExistence(timeout: 10))
        tap(app.buttons["Discover"])
        tap(app.buttons["Coaches"])
        sleep(2)
        snap("01-discover")
        tap(app.buttons["All"])
        tap(app.buttons["Mine"])

        open("Engine AMRAP")
        XCTAssertTrue(app.descendants(matching: .any)["today-target"].waitForExistence(timeout: 5))
        sleep(1)
        snap("04-today-target")

        tap(app.buttons["Start workout"])
        let target = app.descendants(matching: .any)["target"]
        let start = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Start ' AND label != 'Start workout'")).firstMatch
        for _ in 0..<20 where !target.exists {
            if start.exists, start.isHittable { start.tap() } else if app.buttons["Skip"].exists { app.buttons["Skip"].tap() }
            _ = target.waitForExistence(timeout: 1)
        }
        sleep(3)
        snap("03-timer")
        tap(app.buttons["End session"])
        tap(app.buttons["Discard"])
        XCTAssertTrue(app.buttons["Start workout"].waitForExistence(timeout: 5))
        back()

        open("Loads check")
        sleep(1)
        snap("02-workout")
        let bench = app.buttons.matching(NSPredicate(format: "label BEGINSWITH[c] 'Barbell bench press'")).firstMatch
        tap(bench)
        sleep(1)
        snap("05-exercise")
        if app.buttons["Done"].exists { app.buttons["Done"].firstMatch.tap() }
        back()

        open("Arms and abs")
        sleep(1)
        snap("09-ai-workout")
        back()

        tap(app.tabBars.buttons["History"])
        XCTAssertTrue(app.descendants(matching: .any)["week-line"].waitForExistence(timeout: 5))
        sleep(1)
        snap("07-history")

        tap(app.navigationBars["History"].buttons["Exercises"])
        tap(app.buttons.matching(NSPredicate(format: "label BEGINSWITH[c] 'Barbell bench press'")).firstMatch)
        XCTAssertTrue(app.staticTexts["Best est. 1RM"].waitForExistence(timeout: 5))
        sleep(1)
        snap("06-logbook")

        tap(app.tabBars.buttons["Me"])
        XCTAssertTrue(app.navigationBars["Me"].waitForExistence(timeout: 5))
        app.swipeUp(velocity: .slow)
        sleep(1)
        snap("08-me")
    }

    private func back() {
        let nav = app.navigationBars.firstMatch
        if nav.buttons.element(boundBy: 0).exists { nav.buttons.element(boundBy: 0).tap() }
        let search = app.searchFields.firstMatch
        if search.buttons["Clear text"].exists { search.buttons["Clear text"].tap() }
        for label in ["Close", "Cancel"] where app.navigationBars["Workouts"].buttons[label].exists {
            app.navigationBars["Workouts"].buttons[label].tap()
        }
    }

    private func open(_ title: String) {
        XCTAssertTrue(app.navigationBars["Workouts"].waitForExistence(timeout: 10))
        let search = app.searchFields.firstMatch
        if !search.exists { app.swipeDown() }
        tap(search)
        search.typeText(title)
        let exact = app.buttons.matching(NSPredicate(format: "label == %@ OR label BEGINSWITH %@", title, title + ",")).firstMatch
        if !exact.waitForExistence(timeout: 2) {
            app.keyboards.buttons["search"].firstMatch.tap()
            for _ in 0..<15 where !exact.waitForExistence(timeout: 1) {
                app.scrollViews.firstMatch.swipeUp(velocity: .slow)
            }
        }
        tap(exact.exists ? exact : app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", title)).firstMatch)
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
