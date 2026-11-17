import SwiftUI

@main
struct TigerWorkoutsApp: App {
    @State private var store = Store()
    /// Remote notifications (Feedback/Push.swift) need an app delegate.
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    init() {
        Media.configureCache()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(store)
                .task { await store.load() }
                .tint(Brand.coral)
        }
    }
}
